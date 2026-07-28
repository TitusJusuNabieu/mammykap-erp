import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, desc, and, isNull } from 'drizzle-orm';
import { quotes, quoteLines, customers } from '@ledgera/db';
import { authenticate, requireMinRole } from '../../middleware/auth.js';
import { nextSequence } from '../../utils/sequence.js';
import { NotFoundError } from '../../utils/errors.js';

const LINE_SCHEMA = z.object({
  description: z.string().min(1),
  quantity: z.number().positive().default(1),
  unitPrice: z.number().min(0),
  discountPct: z.number().min(0).max(100).default(0),
  taxRate: z.number().min(0).max(100).default(0),
  sortOrder: z.number().int().default(0),
});

const quotesRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /quotes ───────────────────────────────────
  app.get('/quotes', { preHandler: [authenticate] }, async (req) => {
    const { orgId } = req.user;
    const { type, status, limit = '50', offset = '0' } = req.query as Record<string, string>;

    const query = req.db
      .select({
        id: quotes.id,
        quoteNumber: quotes.quoteNumber,
        type: quotes.type,
        status: quotes.status,
        customerId: quotes.customerId,
        customerName: quotes.customerName,
        date: quotes.date,
        expiryDate: quotes.expiryDate,
        dueDate: quotes.dueDate,
        totalAmount: quotes.totalAmount,
        createdAt: quotes.createdAt,
      })
      .from(quotes)
      .where(and(eq(quotes.organizationId, orgId), isNull(quotes.deletedAt)))
      .orderBy(desc(quotes.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));

    const rows = await query;

    // Attach customer name from customers table when customerId is set
    const enriched = await Promise.all(
      rows.map(async (row) => {
        if (row.customerId && !row.customerName) {
          const [cust] = await req.db
            .select({ name: customers.name })
            .from(customers)
            .where(eq(customers.id, row.customerId))
            .limit(1);
          return { ...row, customerName: cust?.name ?? null };
        }
        return row;
      }),
    );

    return { data: enriched };
  });

  // ── POST /quotes ──────────────────────────────────
  app.post('/quotes', { preHandler: [authenticate, requireMinRole('cashier')] }, async (req, reply) => {
    const { orgId, userId } = req.user;

    const body = z.object({
      type: z.enum(['quotation', 'proforma_invoice', 'tax_invoice']).default('quotation'),
      customerId: z.string().uuid().optional(),
      customerName: z.string().optional(),
      customerEmail: z.string().email().optional().or(z.literal('')),
      customerPhone: z.string().optional(),
      customerAddress: z.string().optional(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(() => new Date().toISOString().slice(0, 10)),
      expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      notes: z.string().optional(),
      terms: z.string().optional(),
      lines: z.array(LINE_SCHEMA).min(1),
    }).parse(req.body);

    // Calculate totals
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;

    const lineData = body.lines.map((line, idx) => {
      const gross = line.quantity * line.unitPrice;
      const discountAmount = gross * (line.discountPct / 100);
      const afterDiscount = gross - discountAmount;
      const taxAmount = afterDiscount * (line.taxRate / 100);
      const lineTotal = afterDiscount + taxAmount;

      subtotal       += afterDiscount;
      totalDiscount  += discountAmount;
      totalTax       += taxAmount;

      return {
        description: line.description,
        quantity: String(line.quantity),
        unitPrice: String(line.unitPrice),
        discountPct: String(line.discountPct),
        discountAmount: String(discountAmount),
        taxRate: String(line.taxRate),
        taxAmount: String(taxAmount),
        lineTotal: String(lineTotal),
        sortOrder: String(line.sortOrder ?? idx),
        organizationId: orgId,
      };
    });

    const totalAmount = subtotal + totalTax;

    const prefix = body.type === 'quotation' ? 'QUO' : body.type === 'proforma_invoice' ? 'PRO' : 'INV';
    const quoteNumber = await nextSequence(req.db, orgId, `quote_${body.type}`, prefix, 6);

    const [quote] = await req.db.insert(quotes).values({
      organizationId: orgId,
      quoteNumber,
      type: body.type,
      status: 'draft',
      customerId: body.customerId,
      customerName: body.customerName,
      customerEmail: body.customerEmail,
      customerPhone: body.customerPhone,
      customerAddress: body.customerAddress,
      date: body.date,
      expiryDate: body.expiryDate,
      dueDate: body.dueDate,
      subtotal: String(subtotal),
      discountAmount: String(totalDiscount),
      taxAmount: String(totalTax),
      totalAmount: String(totalAmount),
      notes: body.notes,
      terms: body.terms,
      createdBy: userId,
    }).returning();

    if (!quote) throw new Error('Failed to create quote');

    await req.db.insert(quoteLines).values(
      lineData.map((l) => ({ ...l, quoteId: quote.id })),
    );

    return reply.status(201).send({ data: quote });
  });

  // ── GET /quotes/:id ───────────────────────────────
  app.get('/quotes/:id', { preHandler: [authenticate] }, async (req) => {
    const { orgId } = req.user;
    const { id } = req.params as { id: string };

    const [quote] = await req.db
      .select()
      .from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.organizationId, orgId), isNull(quotes.deletedAt)))
      .limit(1);

    if (!quote) throw new NotFoundError('Quote');

    const lines = await req.db
      .select()
      .from(quoteLines)
      .where(eq(quoteLines.quoteId, id))
      .orderBy(quoteLines.sortOrder);

    let customerData = null;
    if (quote.customerId) {
      const [c] = await req.db
        .select({ id: customers.id, name: customers.name, email: customers.email, phone: customers.phone, address: customers.address })
        .from(customers)
        .where(eq(customers.id, quote.customerId))
        .limit(1);
      customerData = c ?? null;
    }

    return { data: { ...quote, lines, customer: customerData } };
  });

  // ── PATCH /quotes/:id ─────────────────────────────
  app.patch('/quotes/:id', { preHandler: [authenticate, requireMinRole('cashier')] }, async (req) => {
    const { orgId } = req.user;
    const { id } = req.params as { id: string };

    const body = z.object({
      status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted']).optional(),
      customerName: z.string().optional(),
      customerEmail: z.string().email().optional().or(z.literal('')),
      customerPhone: z.string().optional(),
      customerAddress: z.string().optional(),
      expiryDate: z.string().optional(),
      dueDate: z.string().optional(),
      notes: z.string().optional(),
      terms: z.string().optional(),
    }).parse(req.body);

    const [existing] = await req.db
      .select()
      .from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.organizationId, orgId), isNull(quotes.deletedAt)))
      .limit(1);

    if (!existing) throw new NotFoundError('Quote');

    const [updated] = await req.db
      .update(quotes)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(quotes.id, id))
      .returning();

    return { data: updated };
  });

  // ── DELETE /quotes/:id ────────────────────────────
  app.delete('/quotes/:id', { preHandler: [authenticate, requireMinRole('branch_manager')] }, async (req, reply) => {
    const { orgId } = req.user;
    const { id } = req.params as { id: string };

    const [existing] = await req.db
      .select({ id: quotes.id, status: quotes.status })
      .from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.organizationId, orgId), isNull(quotes.deletedAt)))
      .limit(1);

    if (!existing) throw new NotFoundError('Quote');

    // Soft delete — consistent with every other module's delete invariant.
    await req.db.update(quotes).set({ deletedAt: new Date() }).where(eq(quotes.id, id));

    return reply.status(204).send();
  });
};

export default quotesRoutes;
