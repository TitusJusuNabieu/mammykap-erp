import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, asc, desc, ilike, or, lte, inArray } from 'drizzle-orm';
import { products, categories, units, stockLevels, stockMovements, stockTransfers, stockTransferLines } from '@ledgera/db';
import { authenticate, requireMinRole } from '../../middleware/auth.js';
import { enforcePlanLimit } from '../../middleware/subscription.js';
import { NotFoundError } from '../../utils/errors.js';
import { InventoryEngine } from './inventory.engine.js';
import { nextSequence } from '../../utils/sequence.js';

const inventoryRoutes: FastifyPluginAsync = async (app) => {

  // ── Categories ───────────────────────────────────
  app.get('/categories', { preHandler: [authenticate] }, async (req) => {
    const { orgId } = req.user;
    const rows = await req.db.select().from(categories)
      .where(eq(categories.organizationId, orgId))
      .orderBy(asc(categories.name));
    return { data: rows };
  });

  app.post('/categories', { preHandler: [authenticate, requireMinRole('inventory_officer')] }, async (req, reply) => {
    const { orgId } = req.user;
    const body = z.object({
      name: z.string().min(1),
      parentId: z.string().uuid().optional(),
      description: z.string().optional(),
    }).parse(req.body);

    const [cat] = await req.db.insert(categories)
      .values({ ...body, organizationId: orgId })
      .returning();
    return reply.status(201).send({ data: cat });
  });

  // ── Products ─────────────────────────────────────
  app.get('/products', { preHandler: [authenticate] }, async (req) => {
    const { orgId } = req.user;
    const query = z.object({
      q: z.string().optional(),
      category_id: z.string().uuid().optional(),
      low_stock: z.coerce.boolean().optional(),
      is_active: z.coerce.boolean().default(true),
      limit: z.coerce.number().max(200).default(50),
    }).parse(req.query);

    const conditions = [
      eq(products.organizationId, orgId),
      eq(products.isActive, query.is_active),
    ];

    if (query.q) {
      conditions.push(
        or(
          ilike(products.name, `%${query.q}%`),
          ilike(products.sku, `%${query.q}%`),
          ilike(products.barcode, `%${query.q}%`),
        )!,
      );
    }

    if (query.category_id) conditions.push(eq(products.categoryId, query.category_id));

    const rows = await req.db
      .select({
        id: products.id,
        sku: products.sku,
        barcode: products.barcode,
        name: products.name,
        costPrice: products.costPrice,
        sellingPrice: products.sellingPrice,
        taxRate: products.taxRate,
        isTaxable: products.isTaxable,
        reorderPoint: products.reorderPoint,
        trackInventory: products.trackInventory,
        hasExpiry: products.hasExpiry,
        hasBatch: products.hasBatch,
        imageUrl: products.imageUrl,
        categoryId: products.categoryId,
        isActive: products.isActive,
      })
      .from(products)
      .where(and(...conditions))
      .orderBy(asc(products.name))
      .limit(query.limit);

    // Attach stock levels
    const ids = rows.map((r) => r.id);
    const levels = ids.length
      ? await req.db
          .select()
          .from(stockLevels)
          .where(and(
            eq(stockLevels.organizationId, orgId),
            inArray(stockLevels.productId, ids),
          ))
      : [];

    const levelsMap = new Map<string, typeof levels>();
    for (const l of levels) {
      const arr = levelsMap.get(l.productId) ?? [];
      arr.push(l);
      levelsMap.set(l.productId, arr);
    }

    const data = rows.map((p) => {
      const pLevels = levelsMap.get(p.id) ?? [];
      const totalQty = pLevels.reduce((s, l) => s + Number(l.quantity), 0);
      return {
        ...p,
        stockLevel: totalQty,
        stockLevels: pLevels,
        isBelowReorder: totalQty <= Number(p.reorderPoint ?? 0),
      };
    });

    return { data, meta: { total: data.length } };
  });

  app.post('/products', { preHandler: [authenticate, requireMinRole('inventory_officer'), enforcePlanLimit('products')] }, async (req, reply) => {
    const { orgId, userId } = req.user;
    const body = z.object({
      name: z.string().min(1).max(500),
      sku: z.string().max(100).optional(),
      barcode: z.string().max(100).optional(),
      categoryId: z.string().uuid().optional(),
      unitId: z.string().uuid().optional(),
      costPrice: z.number().min(0),
      sellingPrice: z.number().min(0),
      taxRate: z.number().min(0).max(100).default(0),
      isTaxable: z.boolean().default(false),
      trackInventory: z.boolean().default(true),
      hasExpiry: z.boolean().default(false),
      hasBatch: z.boolean().default(false),
      reorderPoint: z.number().min(0).default(0),
      description: z.string().optional(),
    }).parse(req.body);

    const [product] = await req.db
      .insert(products)
      .values({
        ...body,
        organizationId: orgId,
        costPrice: String(body.costPrice),
        sellingPrice: String(body.sellingPrice),
        taxRate: String(body.taxRate),
        reorderPoint: String(body.reorderPoint),
        createdBy: userId,
      })
      .returning();

    return reply.status(201).send({ data: product });
  });

  app.get('/products/:id', { preHandler: [authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId } = req.user;

    const [product] = await req.db
      .select()
      .from(products)
      .where(and(eq(products.id, id), eq(products.organizationId, orgId)));

    if (!product) throw new NotFoundError('Product');

    const levels = await req.db
      .select()
      .from(stockLevels)
      .where(eq(stockLevels.productId, id));

    return { data: { ...product, stockLevels: levels } };
  });

  app.patch('/products/:id', { preHandler: [authenticate, requireMinRole('inventory_officer')] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId } = req.user;
    const body = z.object({
      name: z.string().optional(),
      costPrice: z.number().min(0).optional(),
      sellingPrice: z.number().min(0).optional(),
      taxRate: z.number().min(0).max(100).optional(),
      isTaxable: z.boolean().optional(),
      reorderPoint: z.number().min(0).optional(),
      isActive: z.boolean().optional(),
      description: z.string().optional(),
    }).parse(req.body);

    const { costPrice, sellingPrice, taxRate, reorderPoint, ...restBody } = body;

    const update = {
      ...restBody,
      ...(costPrice !== undefined ? { costPrice: String(costPrice) } : {}),
      ...(sellingPrice !== undefined ? { sellingPrice: String(sellingPrice) } : {}),
      ...(taxRate !== undefined ? { taxRate: String(taxRate) } : {}),
      ...(reorderPoint !== undefined ? { reorderPoint: String(reorderPoint) } : {}),
      updatedAt: new Date(),
    };

    const [updated] = await req.db
      .update(products)
      .set(update)
      .where(and(eq(products.id, id), eq(products.organizationId, orgId)))
      .returning();

    if (!updated) throw new NotFoundError('Product');
    return { data: updated };
  });

  app.get('/products/:id/movements', { preHandler: [authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId } = req.user;
    const rows = await req.db
      .select()
      .from(stockMovements)
      .where(and(eq(stockMovements.productId, id), eq(stockMovements.organizationId, orgId)))
      .orderBy(desc(stockMovements.createdAt))
      .limit(100);
    return { data: rows };
  });

  // ── Stock (current levels) ───────────────────────
  app.get('/inventory/stock', { preHandler: [authenticate] }, async (req) => {
    const { orgId } = req.user;
    const query = z.object({ branchId: z.string().uuid().optional() }).parse(req.query);
    const conditions = [eq(stockLevels.organizationId, orgId)];
    if (query.branchId) conditions.push(eq(stockLevels.branchId, query.branchId));
    const rows = await req.db.select().from(stockLevels).where(and(...conditions));
    return { data: rows };
  });

  // ── Inter-branch Transfers ───────────────────────
  app.post('/inventory/transfers', { preHandler: [authenticate, requireMinRole('inventory_officer')] }, async (req, reply) => {
    const { orgId, userId } = req.user;
    const body = z.object({
      fromBranchId: z.string().uuid(),
      toBranchId: z.string().uuid(),
      notes: z.string().optional(),
      lines: z.array(z.object({
        productId: z.string().uuid(),
        quantity: z.number().positive(),
        unitCost: z.number().min(0),
      })).min(1),
    }).parse(req.body);

    const engine = new InventoryEngine(req.db);
    const transferNumber = await nextSequence(req.db, orgId, 'transfer', 'TRF', 6);

    const [transfer] = await req.db
      .insert(stockTransfers)
      .values({
        organizationId: orgId,
        transferNumber,
        fromBranchId: body.fromBranchId,
        toBranchId: body.toBranchId,
        status: 'pending',
        notes: body.notes,
        createdBy: userId,
      })
      .returning();

    if (!transfer) throw new Error('Failed to create transfer');

    await req.db.insert(stockTransferLines).values(
      body.lines.map((l) => ({
        transferId: transfer.id,
        productId: l.productId,
        quantity: String(l.quantity),
        unitCost: String(l.unitCost),
      })),
    );

    // Deduct from source branch
    for (const line of body.lines) {
      await engine.adjustStock({
        orgId,
        branchId: body.fromBranchId,
        productId: line.productId,
        quantity: -line.quantity,
        unitCost: line.unitCost,
        movementType: 'transfer_out',
        sourceType: 'transfer',
        sourceId: transfer.id,
        userId,
      });
    }

    await req.db
      .update(stockTransfers)
      .set({ status: 'in_transit', shippedAt: new Date(), shippedBy: userId })
      .where(eq(stockTransfers.id, transfer.id));

    return reply.status(201).send({ data: transfer });
  });

  app.patch('/inventory/transfers/:id/receive', { preHandler: [authenticate, requireMinRole('inventory_officer')] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId, userId } = req.user;
    const body = z.object({
      lines: z.array(z.object({
        transferLineId: z.string().uuid(),
        receivedQty: z.number().min(0),
      })),
    }).parse(req.body);

    const [transfer] = await req.db
      .select()
      .from(stockTransfers)
      .where(and(eq(stockTransfers.id, id), eq(stockTransfers.organizationId, orgId)));

    if (!transfer) throw new NotFoundError('Transfer');

    const lines = await req.db
      .select()
      .from(stockTransferLines)
      .where(eq(stockTransferLines.transferId, id));

    const engine = new InventoryEngine(req.db);

    for (const received of body.lines) {
      const line = lines.find((l) => l.id === received.transferLineId);
      if (!line || received.receivedQty <= 0) continue;

      await engine.adjustStock({
        orgId,
        branchId: transfer.toBranchId,
        productId: line.productId,
        quantity: received.receivedQty,
        unitCost: Number(line.unitCost),
        movementType: 'transfer_in',
        sourceType: 'transfer',
        sourceId: id,
        userId,
      });

      await req.db
        .update(stockTransferLines)
        .set({ receivedQty: String(received.receivedQty) })
        .where(eq(stockTransferLines.id, received.transferLineId));
    }

    await req.db
      .update(stockTransfers)
      .set({ status: 'received', receivedAt: new Date(), receivedBy: userId })
      .where(eq(stockTransfers.id, id));

    return { data: { success: true } };
  });
};

export default inventoryRoutes;
