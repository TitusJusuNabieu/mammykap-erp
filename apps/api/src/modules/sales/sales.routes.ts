import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, gte, lte, inArray, sql } from 'drizzle-orm';
import {
  sales, saleLines, salePayments, customers, customerPayments,
  products, accounts, organizationSettings, storeRequests, storeRequestLines,
  storeRequestSupplies, storeRequestSupplyLines,
} from '@ledgera/db';
import { authenticate, requireMinRole } from '../../middleware/auth.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { AccountingEngine } from '../accounting/accounting.engine.js';
import { InventoryEngine } from '../inventory/inventory.engine.js';
import { nextSequence } from '../../utils/sequence.js';
import { logAudit } from '../../utils/audit.js';

const PAYMENT_METHOD_SCHEMA = z.enum(['cash','bank','orange_money','afrimoney','qmoney','cheque','credit']);

const salesRoutes: FastifyPluginAsync = async (app) => {

  // ── GET /sales ───────────────────────────────────
  app.get('/sales', { preHandler: [authenticate] }, async (req) => {
    const { orgId, role, branchId: userBranch } = req.user;
    const query = z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      status: z.enum(['draft','sent','partial','paid','overdue','cancelled']).optional(),
      customer_id: z.string().uuid().optional(),
      branch_id: z.string().uuid().optional(),
      limit: z.coerce.number().max(200).default(50),
    }).parse(req.query);

    const conditions = [eq(sales.organizationId, orgId)];
    if (query.from)         conditions.push(gte(sales.date, query.from));
    if (query.to)           conditions.push(lte(sales.date, query.to));
    if (query.status)       conditions.push(eq(sales.status, query.status));
    if (query.customer_id)  conditions.push(eq(sales.customerId, query.customer_id));
    // Branch managers see only their branch
    if (role === 'branch_manager' && userBranch) {
      conditions.push(eq(sales.branchId, userBranch));
    } else if (query.branch_id) {
      conditions.push(eq(sales.branchId, query.branch_id));
    }

    const rows = await req.db
      .select()
      .from(sales)
      .where(and(...conditions))
      .orderBy(desc(sales.date), desc(sales.createdAt))
      .limit(query.limit);

    return { data: rows, meta: { count: rows.length } };
  });

  // ── POST /sales (POS checkout) ───────────────────
  app.post('/sales', { preHandler: [authenticate, requireMinRole('cashier')] }, async (req, reply) => {
    const { orgId, userId, branchId: userBranchId } = req.user;

    const body = z.object({
      branchId: z.string().uuid().optional(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(() => new Date().toISOString().slice(0, 10)),
      // When goods are expected to be handed over at the store/warehouse —
      // defaults to same-day pickup. See POST /store-requests/:id/supply.
      expectedCollectionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      customerId: z.string().uuid().optional(),
      isCreditSale: z.boolean().default(false),
      notes: z.string().optional(),
      lines: z.array(z.object({
        productId: z.string().uuid(),
        variantId: z.string().uuid().optional(),
        quantity: z.number().positive(),
        unitPrice: z.number().min(0),
        discountPct: z.number().min(0).max(100).default(0),
      })).min(1),
      payments: z.array(z.object({
        method: PAYMENT_METHOD_SCHEMA,
        amount: z.number().positive(),
        accountId: z.string().uuid().optional(),
        reference: z.string().optional(),
      })).optional(),
    }).parse(req.body);

    const branchId = body.branchId ?? userBranchId;
    if (!branchId) throw new ValidationError('Branch ID is required');
    const expectedCollectionDate = body.expectedCollectionDate ?? body.date;

    // Get org settings for tax
    const [settings] = await req.db
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, orgId))
      .limit(1);

    const taxRate = settings?.enableTax ? Number(settings.defaultTaxRate ?? 0) : 0;

    // Fetch products for pricing & COGS
    const productIds = [...new Set(body.lines.map((l) => l.productId))];
    const productRows = await req.db
      .select()
      .from(products)
      .where(and(eq(products.organizationId, orgId), inArray(products.id, productIds)));

    const productMap = new Map(productRows.map((p) => [p.id, p]));

    // Identify system accounts
    const accRows = await req.db
      .select()
      .from(accounts)
      .where(eq(accounts.organizationId, orgId));
    const accByCode = new Map(accRows.map((a) => [a.code, a]));

    const accounting = new AccountingEngine(req.db);

    // Calculate totals
    let subtotal = 0;
    let totalTax = 0;
    let totalDiscount = 0;

    const lineData = body.lines.map((line) => {
      const product = productMap.get(line.productId);
      if (!product) throw new NotFoundError(`Product ${line.productId}`);

      const grossLineTotal = line.quantity * line.unitPrice;
      const discountAmount = grossLineTotal * (line.discountPct / 100);
      const lineAfterDiscount = grossLineTotal - discountAmount;
      const lineTaxRate = product.isTaxable ? taxRate : 0;
      const taxAmount = lineAfterDiscount * (lineTaxRate / 100);
      const lineTotal = lineAfterDiscount + taxAmount;

      subtotal       += lineAfterDiscount;
      totalTax       += taxAmount;
      totalDiscount  += discountAmount;

      return {
        productId: line.productId,
        variantId: line.variantId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountPct: line.discountPct,
        discountAmount,
        taxRate: lineTaxRate,
        taxAmount,
        lineTotal,
        unitCost: Number(product.costPrice),
        product,
      };
    });

    const totalAmount = subtotal + totalTax;
    const amountPaid = body.isCreditSale ? 0 : (body.payments?.reduce((s, p) => s + p.amount, 0) ?? 0);

    if (!body.isCreditSale && amountPaid < totalAmount - 0.01) {
      throw new ValidationError(`Amount paid (${amountPaid}) is less than total (${totalAmount})`);
    }

    // Generate sale number
    const saleNumber = await nextSequence(req.db, orgId, 'receipt', settings?.receiptPrefix ?? 'RCP', 6);

    // Determine status
    const status = body.isCreditSale
      ? 'partial'
      : amountPaid >= totalAmount - 0.01
        ? 'paid'
        : 'partial';

    // Insert sale
    const [sale] = await req.db.insert(sales).values({
      organizationId: orgId,
      branchId,
      saleNumber,
      date: body.date,
      expectedCollectionDate,
      customerId: body.customerId,
      isCreditSale: body.isCreditSale,
      subtotal: String(subtotal),
      discountAmount: String(totalDiscount),
      taxAmount: String(totalTax),
      totalAmount: String(totalAmount),
      amountPaid: String(amountPaid),
      amountDue: String(totalAmount - amountPaid),
      status,
      notes: body.notes,
      createdBy: userId,
    }).returning();

    if (!sale) throw new Error('Failed to create sale');

    // Insert sale lines. Stock is deliberately NOT adjusted here — goods
    // leave (and, past the grace period, get repriced) only when the store
    // request created below is fulfilled via POST /store-requests/:id/supply.
    const insertedLines: (typeof saleLines.$inferSelect)[] = [];
    for (const line of lineData) {
      const [insertedLine] = await req.db.insert(saleLines).values({
        saleId: sale.id,
        organizationId: orgId,
        productId: line.productId,
        variantId: line.variantId,
        quantity: String(line.quantity),
        unitPrice: String(line.unitPrice),
        discountPct: String(line.discountPct),
        discountAmount: String(line.discountAmount),
        taxRate: String(line.taxRate),
        taxAmount: String(line.taxAmount),
        lineTotal: String(line.lineTotal),
        unitCost: String(line.unitCost),
      }).returning();
      if (!insertedLine) throw new Error('Failed to create sale line');
      insertedLines.push(insertedLine);
    }

    // Store request — the sales-desk request that store/warehouse staff
    // resolve (in full or in batches) via POST /store-requests/:id/supply.
    const storeRequestNumber = await nextSequence(req.db, orgId, 'store_request', 'SRQ', 6);
    const [storeRequest] = await req.db.insert(storeRequests).values({
      organizationId: orgId,
      branchId,
      storeRequestNumber,
      saleId: sale.id,
      expectedCollectionDate,
      requestedBy: userId,
    }).returning();
    if (!storeRequest) throw new Error('Failed to create store request');

    await req.db.insert(storeRequestLines).values(
      insertedLines.map((sl) => ({
        storeRequestId: storeRequest.id,
        saleLineId: sl.id,
        productId: sl.productId,
        variantId: sl.variantId,
        quantity: sl.quantity,
        requestedUnitPrice: sl.unitPrice,
        requestedLineTotal: sl.lineTotal,
      })),
    );

    await logAudit(req.db, {
      organizationId: orgId,
      userId,
      action: 'create',
      resourceType: 'store_request',
      resourceId: storeRequest.id,
      resourceNumber: storeRequestNumber,
    });

    // Insert payments
    if (!body.isCreditSale && body.payments) {
      await req.db.insert(salePayments).values(
        body.payments.map((p) => ({
          saleId: sale.id,
          organizationId: orgId,
          method: p.method,
          amount: String(p.amount),
          reference: p.reference,
          accountId: p.accountId,
        })),
      );
    }

    // Post journal entry — revenue-side only. COGS/Inventory is posted
    // separately, at supply time (POST /store-requests/:id/supply), since
    // stock hasn't actually left yet at sale-creation time.
    const revenueAccount = accByCode.get('4001');
    const taxAccount     = accByCode.get('2300');
    const cashAccount    = accByCode.get('1001');
    const arAccount      = accByCode.get('1040');

    if (revenueAccount && (cashAccount || arAccount)) {
      const debitAccount = body.isCreditSale ? arAccount : cashAccount;

      const journalLines = [
        // DR Cash or AR
        { accountId: debitAccount!.id, debit: totalAmount, credit: 0, description: `Sale ${saleNumber}` },
        // CR Revenue (net of tax)
        { accountId: revenueAccount.id, debit: 0, credit: subtotal, description: `Revenue ${saleNumber}` },
      ];

      if (totalTax > 0 && taxAccount) {
        journalLines.push({ accountId: taxAccount.id, debit: 0, credit: totalTax, description: 'GST/VAT' });
      }

      const je = await accounting.postJournal({
        organizationId: orgId,
        branchId,
        date: body.date,
        description: `Sale ${saleNumber}`,
        sourceType: 'sale',
        sourceId: sale.id,
        lines: journalLines,
        createdBy: userId,
      });

      await req.db.update(sales)
        .set({ journalEntryId: je.id })
        .where(eq(sales.id, sale.id));
    }

    // Update customer running balance
    if (body.isCreditSale && body.customerId) {
      await req.db
        .update(customers)
        .set({ currentBalance: sql`current_balance + ${totalAmount}` })
        .where(and(eq(customers.id, body.customerId), eq(customers.organizationId, orgId)));
    }

    await logAudit(req.db, {
      organizationId: orgId,
      userId,
      action: 'create',
      resourceType: 'sale',
      resourceId: sale.id,
      resourceNumber: saleNumber,
    });

    return reply.status(201).send({
      data: { ...sale, saleNumber, storeRequestNumber, storeRequestId: storeRequest.id },
    });
  });

  // ── GET /sales/:id ───────────────────────────────
  app.get('/sales/:id', { preHandler: [authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId } = req.user;

    const [sale] = await req.db.select().from(sales)
      .where(and(eq(sales.id, id), eq(sales.organizationId, orgId)));
    if (!sale) throw new NotFoundError('Sale');

    const [lines, payments] = await Promise.all([
      req.db.select().from(saleLines).where(eq(saleLines.saleId, id)),
      req.db.select().from(salePayments).where(eq(salePayments.saleId, id)),
    ]);

    return { data: { ...sale, lines, payments } };
  });

  // ── POST /sales/:id/void ─────────────────────────
  app.post('/sales/:id/void', { preHandler: [authenticate, requireMinRole('branch_manager')] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId, userId } = req.user;
    const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);

    const [sale] = await req.db.select().from(sales)
      .where(and(eq(sales.id, id), eq(sales.organizationId, orgId)));
    if (!sale) throw new NotFoundError('Sale');
    if (sale.status === 'cancelled') throw new ValidationError('Sale already voided');

    const accounting = new AccountingEngine(req.db);

    // Stock only actually left for whatever quantity was already supplied
    // via the store request (see store-requests.routes.ts) — restoring the
    // full original sale-line quantities here (the old behavior) would be
    // wrong for anything still pending/partially supplied.
    const [sr] = await req.db.select().from(storeRequests).where(eq(storeRequests.saleId, id));
    if (sr) {
      const supplies = await req.db.select().from(storeRequestSupplies).where(eq(storeRequestSupplies.storeRequestId, sr.id));
      if (supplies.length > 0) {
        const supplyIds = supplies.map((s) => s.id);
        const [supplyLines, srLines] = await Promise.all([
          req.db.select().from(storeRequestSupplyLines).where(inArray(storeRequestSupplyLines.storeRequestSupplyId, supplyIds)),
          req.db.select().from(storeRequestLines).where(eq(storeRequestLines.storeRequestId, sr.id)),
        ]);
        const srLineMap = new Map(srLines.map((l) => [l.id, l]));
        const inventory = new InventoryEngine(req.db);

        for (const sl of supplyLines) {
          const parentLine = srLineMap.get(sl.storeRequestLineId);
          if (!parentLine) continue;
          await inventory.adjustStock({
            orgId,
            branchId: sale.branchId,
            productId: parentLine.productId,
            variantId: parentLine.variantId ?? undefined,
            quantity: Number(sl.quantitySupplied),
            unitCost: Number(sl.unitCost),
            movementType: 'return_in',
            sourceType: 'sale_void',
            sourceId: id,
            userId,
          });
        }

        for (const s of supplies) {
          if (s.cogsJournalEntryId) {
            await accounting.voidJournal(s.cogsJournalEntryId, orgId, `Sale voided: ${reason}`, userId);
          }
          if (s.priceAdjustmentJournalEntryId) {
            await accounting.voidJournal(s.priceAdjustmentJournalEntryId, orgId, `Sale voided: ${reason}`, userId);
          }
        }
      }
      await req.db.update(storeRequests).set({ status: 'cancelled' }).where(eq(storeRequests.id, sr.id));
    }

    // Void the sale's own revenue journal entry
    if (sale.journalEntryId) {
      await accounting.voidJournal(sale.journalEntryId, orgId, `Sale voided: ${reason}`, userId);
    }

    await req.db.update(sales)
      .set({ status: 'cancelled' })
      .where(eq(sales.id, id));

    await logAudit(req.db, {
      organizationId: orgId,
      userId,
      action: 'void',
      resourceType: 'sale',
      resourceId: sale.id,
      resourceNumber: sale.saleNumber,
      changes: { reason },
    });

    return { data: { success: true } };
  });

  // ── Customers ─────────────────────────────────────
  app.get('/customers', { preHandler: [authenticate] }, async (req) => {
    const { orgId } = req.user;
    const rows = await req.db.select().from(customers)
      .where(eq(customers.organizationId, orgId))
      .orderBy(customers.name);
    return { data: rows };
  });

  app.post('/customers', { preHandler: [authenticate, requireMinRole('cashier')] }, async (req, reply) => {
    const { orgId, userId } = req.user;
    const body = z.object({
      name: z.string().min(1).max(255),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      address: z.string().optional(),
      tin: z.string().optional(),
      creditLimit: z.number().min(0).default(0),
    }).parse(req.body);

    const count = await req.db.$count(customers, eq(customers.organizationId, orgId));
    const num = `CUST-${String(count + 1).padStart(5, '0')}`;

    const [customer] = await req.db.insert(customers).values({
      ...body,
      organizationId: orgId,
      customerNumber: num,
      creditLimit: String(body.creditLimit),
      createdBy: userId,
    }).returning();

    return reply.status(201).send({ data: customer });
  });

  app.get('/customers/:id', { preHandler: [authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId } = req.user;
    const [customer] = await req.db.select().from(customers)
      .where(and(eq(customers.id, id), eq(customers.organizationId, orgId)));
    if (!customer) throw new NotFoundError('Customer');
    return { data: customer };
  });

  // ── Customer Payments ─────────────────────────────
  app.post('/customer-payments', { preHandler: [authenticate, requireMinRole('cashier')] }, async (req, reply) => {
    const { orgId, userId } = req.user;
    const body = z.object({
      customerId: z.string().uuid(),
      saleId: z.string().uuid().optional(),
      date: z.string().default(() => new Date().toISOString().slice(0, 10)),
      amount: z.number().positive(),
      method: PAYMENT_METHOD_SCHEMA,
      accountId: z.string().uuid().optional(),
      reference: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const paymentNumber = await nextSequence(req.db, orgId, 'customer_payment', 'CPAY', 6);

    const [payment] = await req.db.insert(customerPayments).values({
      ...body,
      organizationId: orgId,
      paymentNumber,
      amount: String(body.amount),
      createdBy: userId,
    }).returning();

    // Post journal: DR Cash / CR Accounts Receivable
    const accRows = await req.db.select().from(accounts).where(eq(accounts.organizationId, orgId));
    const accByCode = new Map(accRows.map((a) => [a.code, a]));
    const cashAccount = accByCode.get('1001');
    const arAccount   = accByCode.get('1040');

    if (cashAccount && arAccount) {
      const accounting = new AccountingEngine(req.db);
      const je = await accounting.postJournal({
        organizationId: orgId,
        date: body.date,
        description: `Customer payment ${paymentNumber}`,
        sourceType: 'customer_payment',
        sourceId: payment!.id,
        lines: [
          { accountId: cashAccount.id, debit: body.amount, credit: 0 },
          { accountId: arAccount.id,   debit: 0,           credit: body.amount },
        ],
        createdBy: userId,
      });

      await req.db.update(customerPayments)
        .set({ journalEntryId: je.id })
        .where(eq(customerPayments.id, payment!.id));
    }

    return reply.status(201).send({ data: payment });
  });
};

export default salesRoutes;
