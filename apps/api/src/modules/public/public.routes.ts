import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, inArray, isNull } from 'drizzle-orm';
import {
  organizations, branches, products, categories, stockLevels,
  organizationSettings, quotes, quoteLines,
} from '@ledgera/db';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { nextSequence } from '../../utils/sequence.js';

type StockStatus = 'available' | 'in_stock' | 'low_stock' | 'out_of_stock';

/**
 * Public storefront — no `authenticate` preHandler, backed by `app.adminDb`
 * (BYPASSRLS, same pre-auth pattern as auth.routes.ts) since there's no
 * tenant JWT on these requests. Only meaningful for a dedicated (single-
 * tenant) deployment, where "the org" can be resolved unambiguously — a
 * SaaS-mode public storefront would need slug/subdomain routing instead,
 * which isn't implemented here.
 */
const publicRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (_req, reply) => {
    if (process.env['DEPLOYMENT_MODE'] !== 'dedicated') {
      return reply.status(404).send({ code: 'NOT_FOUND', message: 'Not found' });
    }
  });

  async function theOrg() {
    const [org] = await app.adminDb.select().from(organizations).limit(1);
    if (!org) throw new NotFoundError('Organization');
    return org;
  }

  async function theBranch(orgId: string) {
    const rows = await app.adminDb.select().from(branches).where(eq(branches.organizationId, orgId));
    return rows.find((b) => b.isMainBranch) ?? rows[0];
  }

  // ── GET /public/org ────────────────────────────────
  app.get('/public/org', async () => {
    const org = await theOrg();
    return {
      data: {
        name: org.name,
        address: org.address,
        phone: org.phone,
        email: org.email,
        logoUrl: org.logoUrl,
      },
    };
  });

  // ── GET /public/catalog ─────────────────────────────
  app.get('/public/catalog', async (req) => {
    const query = z.object({
      q: z.string().optional(),
      limit: z.coerce.number().max(200).default(100),
    }).parse(req.query);

    const org = await theOrg();
    const branch = await theBranch(org.id);

    const productRows = await app.adminDb
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        description: products.description,
        sellingPrice: products.sellingPrice,
        imageUrl: products.imageUrl,
        trackInventory: products.trackInventory,
        reorderPoint: products.reorderPoint,
        categoryId: products.categoryId,
      })
      .from(products)
      .where(and(eq(products.organizationId, org.id), eq(products.isActive, true)))
      .limit(query.limit);

    const categoryRows = await app.adminDb.select().from(categories).where(eq(categories.organizationId, org.id));
    const categoryMap = new Map(categoryRows.map((c) => [c.id, c.name]));

    const stockRows = branch
      ? await app.adminDb.select().from(stockLevels).where(and(
          eq(stockLevels.branchId, branch.id),
          isNull(stockLevels.variantId),
          inArray(stockLevels.productId, productRows.map((p) => p.id)),
        ))
      : [];
    const stockByProduct = new Map(stockRows.map((s) => [s.productId, Number(s.quantity)]));

    const q = query.q?.toLowerCase();
    const items = productRows
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q))
      .map((p) => {
        let status: StockStatus;
        if (!p.trackInventory) {
          status = 'available';
        } else {
          const qty = stockByProduct.get(p.id) ?? 0;
          status = qty <= 0 ? 'out_of_stock' : qty <= Number(p.reorderPoint) ? 'low_stock' : 'in_stock';
        }
        return {
          id: p.id,
          name: p.name,
          sku: p.sku,
          description: p.description,
          category: p.categoryId ? categoryMap.get(p.categoryId) ?? null : null,
          sellingPrice: p.sellingPrice,
          imageUrl: p.imageUrl,
          status,
        };
      });

    return { data: items };
  });

  // ── POST /public/purchase-requests ──────────────────
  app.post('/public/purchase-requests', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const body = z.object({
      customerName: z.string().min(1).max(255),
      customerPhone: z.string().min(1).max(50),
      customerEmail: z.string().email().optional().or(z.literal('')),
      notes: z.string().max(2000).optional(),
      lines: z.array(z.object({
        productId: z.string().uuid(),
        quantity: z.number().positive(),
      })).min(1).max(50),
    }).parse(req.body);

    const org = await theOrg();

    const productIds = [...new Set(body.lines.map((l) => l.productId))];
    const productRows = await app.adminDb.select().from(products)
      .where(and(eq(products.organizationId, org.id), eq(products.isActive, true), inArray(products.id, productIds)));
    const productMap = new Map(productRows.map((p) => [p.id, p]));

    for (const line of body.lines) {
      if (!productMap.has(line.productId)) {
        throw new ValidationError(`Product ${line.productId} is not available`);
      }
    }

    const [settings] = await app.adminDb.select().from(organizationSettings)
      .where(eq(organizationSettings.organizationId, org.id));
    const taxRate = settings?.enableTax ? Number(settings.defaultTaxRate ?? 0) : 0;

    let subtotal = 0;
    let totalTax = 0;
    const lineData = body.lines.map((line) => {
      const product = productMap.get(line.productId)!;
      const unitPrice = Number(product.sellingPrice);
      const lineTaxRate = product.isTaxable ? taxRate : 0;
      const gross = line.quantity * unitPrice;
      const taxAmount = gross * (lineTaxRate / 100);
      const lineTotal = gross + taxAmount;
      subtotal += gross;
      totalTax += taxAmount;
      return {
        productId: line.productId,
        description: product.name,
        quantity: String(line.quantity),
        unitPrice: String(unitPrice),
        taxRate: String(lineTaxRate),
        taxAmount: String(taxAmount),
        lineTotal: String(lineTotal),
      };
    });
    const totalAmount = subtotal + totalTax;

    const quoteNumber = await nextSequence(app.adminDb, org.id, 'purchase_request', 'REQ', 6);

    const [quote] = await app.adminDb.insert(quotes).values({
      organizationId: org.id,
      quoteNumber,
      type: 'quotation',
      status: 'requested',
      source: 'storefront',
      customerName: body.customerName,
      customerEmail: body.customerEmail || undefined,
      customerPhone: body.customerPhone,
      date: new Date().toISOString().slice(0, 10),
      subtotal: String(subtotal),
      taxAmount: String(totalTax),
      totalAmount: String(totalAmount),
      notes: body.notes,
    }).returning();
    if (!quote) throw new Error('Failed to create purchase request');

    await app.adminDb.insert(quoteLines).values(
      lineData.map((l) => ({ ...l, quoteId: quote.id, organizationId: org.id })),
    );

    return reply.status(201).send({
      data: {
        referenceNumber: quoteNumber,
        totalAmount: String(totalAmount),
        lines: lineData,
      },
    });
  });
};

export default publicRoutes;
