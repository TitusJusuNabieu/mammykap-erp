import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import {
  suppliers, purchaseOrders, purchaseOrderLines,
  goodsReceivedNotes, grnLines, purchaseInvoices, supplierPayments, accounts,
} from '@ledgera/db';
import { authenticate, requireMinRole } from '../../middleware/auth.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { AccountingEngine } from '../accounting/accounting.engine.js';
import { InventoryEngine } from '../inventory/inventory.engine.js';
import { nextSequence } from '../../utils/sequence.js';
import { logAudit } from '../../utils/audit.js';

const purchasesRoutes: FastifyPluginAsync = async (app) => {

  // ── Suppliers ─────────────────────────────────────
  app.get('/suppliers', { preHandler: [authenticate] }, async (req) => {
    const { orgId } = req.user;
    const rows = await req.db.select().from(suppliers)
      .where(eq(suppliers.organizationId, orgId))
      .orderBy(suppliers.name);
    return { data: rows };
  });

  app.post('/suppliers', { preHandler: [authenticate, requireMinRole('inventory_officer')] }, async (req, reply) => {
    const { orgId, userId } = req.user;
    const body = z.object({
      name: z.string().min(1).max(255),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      address: z.string().optional(),
      tin: z.string().optional(),
      paymentTermsDays: z.number().int().min(0).default(30),
    }).parse(req.body);

    const count = await req.db.$count(suppliers, eq(suppliers.organizationId, orgId));
    const supplierNumber = `SUPP-${String(count + 1).padStart(5, '0')}`;

    const [supplier] = await req.db.insert(suppliers).values({
      ...body,
      organizationId: orgId,
      supplierNumber,
      paymentTermsDays: String(body.paymentTermsDays),
      createdBy: userId,
    }).returning();

    return reply.status(201).send({ data: supplier });
  });

  app.get('/suppliers/:id', { preHandler: [authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId } = req.user;
    const [supplier] = await req.db.select().from(suppliers)
      .where(and(eq(suppliers.id, id), eq(suppliers.organizationId, orgId)));
    if (!supplier) throw new NotFoundError('Supplier');
    return { data: supplier };
  });

  // ── Purchase Orders ───────────────────────────────
  app.get('/purchase-orders', { preHandler: [authenticate] }, async (req) => {
    const { orgId } = req.user;
    const rows = await req.db.select().from(purchaseOrders)
      .where(eq(purchaseOrders.organizationId, orgId))
      .orderBy(desc(purchaseOrders.date));
    return { data: rows };
  });

  app.post('/purchase-orders', { preHandler: [authenticate, requireMinRole('inventory_officer')] }, async (req, reply) => {
    const { orgId, userId, branchId: userBranchId } = req.user;
    const body = z.object({
      branchId: z.string().uuid().optional(),
      supplierId: z.string().uuid(),
      date: z.string().default(() => new Date().toISOString().slice(0, 10)),
      expectedDate: z.string().optional(),
      notes: z.string().optional(),
      lines: z.array(z.object({
        productId: z.string().uuid(),
        quantity: z.number().positive(),
        unitCost: z.number().min(0),
        taxRate: z.number().min(0).max(100).default(0),
        description: z.string().optional(),
      })).min(1),
    }).parse(req.body);

    const branchId = body.branchId ?? userBranchId;
    if (!branchId) throw new ValidationError('Branch ID required');

    const poNumber = await nextSequence(req.db, orgId, 'purchase_order', 'PO', 6);

    const lineAmounts = body.lines.map((l) => {
      const lineTotal = l.quantity * l.unitCost;
      const taxAmount = lineTotal * (l.taxRate / 100);
      return { ...l, lineTotal: lineTotal + taxAmount, taxAmount };
    });

    const subtotal = lineAmounts.reduce((s, l) => s + l.quantity * l.unitCost, 0);
    const taxAmount = lineAmounts.reduce((s, l) => s + l.taxAmount, 0);
    const totalAmount = subtotal + taxAmount;

    const [po] = await req.db.insert(purchaseOrders).values({
      organizationId: orgId,
      branchId,
      poNumber,
      supplierId: body.supplierId,
      date: body.date,
      expectedDate: body.expectedDate,
      notes: body.notes,
      subtotal: String(subtotal),
      taxAmount: String(taxAmount),
      totalAmount: String(totalAmount),
      status: 'draft',
      createdBy: userId,
    }).returning();

    if (!po) throw new Error('Failed to create PO');

    await req.db.insert(purchaseOrderLines).values(
      lineAmounts.map((l) => ({
        poId: po.id,
        organizationId: orgId,
        productId: l.productId,
        description: l.description,
        quantity: String(l.quantity),
        unitCost: String(l.unitCost),
        taxRate: String(l.taxRate),
        taxAmount: String(l.taxAmount),
        lineTotal: String(l.lineTotal),
      })),
    );

    await logAudit(req.db, {
      organizationId: orgId,
      userId,
      action: 'create',
      resourceType: 'purchase_order',
      resourceId: po.id,
      resourceNumber: poNumber,
    });

    return reply.status(201).send({ data: po });
  });

  app.post('/purchase-orders/:id/approve', { preHandler: [authenticate, requireMinRole('branch_manager')] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId, userId } = req.user;
    const [updated] = await req.db.update(purchaseOrders)
      .set({ status: 'sent', approvedBy: userId, approvedAt: new Date() })
      .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.organizationId, orgId)))
      .returning();
    if (!updated) throw new NotFoundError('Purchase Order');
    return { data: updated };
  });

  // ── GRN ───────────────────────────────────────────
  app.post('/grn', { preHandler: [authenticate, requireMinRole('inventory_officer')] }, async (req, reply) => {
    const { orgId, userId, branchId: userBranchId } = req.user;
    const body = z.object({
      poId: z.string().uuid().optional(),
      branchId: z.string().uuid().optional(),
      supplierId: z.string().uuid(),
      date: z.string().default(() => new Date().toISOString().slice(0, 10)),
      notes: z.string().optional(),
      lines: z.array(z.object({
        productId: z.string().uuid(),
        poLineId: z.string().uuid().optional(),
        quantity: z.number().positive(),
        unitCost: z.number().min(0),
        batchNumber: z.string().optional(),
        expiryDate: z.string().optional(),
      })).min(1),
    }).parse(req.body);

    const branchId = body.branchId ?? userBranchId;
    if (!branchId) throw new ValidationError('Branch ID required');

    const grnNumber = await nextSequence(req.db, orgId, 'grn', 'GRN', 6);
    const totalCost = body.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0);

    const [grn] = await req.db.insert(goodsReceivedNotes).values({
      organizationId: orgId,
      branchId,
      grnNumber,
      date: body.date,
      poId: body.poId,
      supplierId: body.supplierId,
      totalCost: String(totalCost),
      notes: body.notes,
      createdBy: userId,
    }).returning();

    if (!grn) throw new Error('Failed to create GRN');

    await req.db.insert(grnLines).values(
      body.lines.map((l) => ({
        grnId: grn.id,
        poLineId: l.poLineId,
        productId: l.productId,
        batchNumber: l.batchNumber,
        expiryDate: l.expiryDate,
        quantity: String(l.quantity),
        unitCost: String(l.unitCost),
        lineTotal: String(l.quantity * l.unitCost),
      })),
    );

    // Increase stock for each line
    const engine = new InventoryEngine(req.db);
    for (const line of body.lines) {
      await engine.adjustStock({
        orgId,
        branchId,
        productId: line.productId,
        quantity: line.quantity,
        unitCost: line.unitCost,
        movementType: 'purchase',
        sourceType: 'grn',
        sourceId: grn.id,
        userId,
      });
    }

    // Post accounting: DR Inventory / CR Accounts Payable
    const accRows = await req.db.select().from(accounts).where(eq(accounts.organizationId, orgId));
    const accByCode = new Map(accRows.map((a) => [a.code, a]));
    const invAccount = accByCode.get('1100');
    const apAccount  = accByCode.get('2000');

    if (invAccount && apAccount) {
      const accounting = new AccountingEngine(req.db);
      const je = await accounting.postJournal({
        organizationId: orgId,
        branchId,
        date: body.date,
        description: `GRN ${grnNumber}`,
        sourceType: 'grn',
        sourceId: grn.id,
        lines: [
          { accountId: invAccount.id, debit: totalCost, credit: 0, description: `Inventory received ${grnNumber}` },
          { accountId: apAccount.id,  debit: 0, credit: totalCost, description: `Payable to supplier` },
        ],
        createdBy: userId,
      });

      await req.db.update(goodsReceivedNotes)
        .set({ journalEntryId: je.id })
        .where(eq(goodsReceivedNotes.id, grn.id));
    }

    return reply.status(201).send({ data: grn });
  });

  app.get('/grn', { preHandler: [authenticate] }, async (req) => {
    const { orgId } = req.user;
    const rows = await req.db.select().from(goodsReceivedNotes)
      .where(eq(goodsReceivedNotes.organizationId, orgId))
      .orderBy(desc(goodsReceivedNotes.date));
    return { data: rows };
  });

  // ── Supplier Payments ─────────────────────────────
  app.post('/supplier-payments', { preHandler: [authenticate, requireMinRole('accountant')] }, async (req, reply) => {
    const { orgId, userId } = req.user;
    const body = z.object({
      supplierId: z.string().uuid(),
      invoiceId: z.string().uuid().optional(),
      date: z.string().default(() => new Date().toISOString().slice(0, 10)),
      amount: z.number().positive(),
      method: z.enum(['cash','bank','orange_money','afrimoney','qmoney','cheque']),
      accountId: z.string().uuid(),
      reference: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const paymentNumber = await nextSequence(req.db, orgId, 'supplier_payment', 'SPAY', 6);

    const [payment] = await req.db.insert(supplierPayments).values({
      ...body,
      organizationId: orgId,
      paymentNumber,
      amount: String(body.amount),
      createdBy: userId,
    }).returning();

    // Post: DR Accounts Payable / CR Cash/Bank
    const accRows = await req.db.select().from(accounts).where(eq(accounts.organizationId, orgId));
    const apAccount = accRows.find((a) => a.code === '2000');
    const payAccount = accRows.find((a) => a.id === body.accountId);

    if (apAccount && payAccount) {
      const accounting = new AccountingEngine(req.db);
      const je = await accounting.postJournal({
        organizationId: orgId,
        date: body.date,
        description: `Supplier payment ${paymentNumber}`,
        sourceType: 'supplier_payment',
        sourceId: payment!.id,
        lines: [
          { accountId: apAccount.id,  debit: body.amount, credit: 0 },
          { accountId: payAccount.id, debit: 0, credit: body.amount },
        ],
        createdBy: userId,
      });

      await req.db.update(supplierPayments)
        .set({ journalEntryId: je.id })
        .where(eq(supplierPayments.id, payment!.id));
    }

    return reply.status(201).send({ data: payment });
  });

  app.get('/supplier-payments', { preHandler: [authenticate] }, async (req) => {
    const { orgId } = req.user;
    const rows = await req.db.select().from(supplierPayments)
      .where(eq(supplierPayments.organizationId, orgId))
      .orderBy(desc(supplierPayments.date));
    return { data: rows };
  });
};

export default purchasesRoutes;
