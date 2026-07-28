import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, inArray } from 'drizzle-orm';
import {
  storeRequests, storeRequestLines, storeRequestSupplies, storeRequestSupplyLines,
  storeRequestRejections, storeRequestRejectionLines,
  sales, saleLines, products, accounts, organizationSettings,
} from '@ledgera/db';
import { authenticate, requireMinRole } from '../../middleware/auth.js';
import { NotFoundError, ValidationError, ConflictError } from '../../utils/errors.js';
import { AccountingEngine } from '../accounting/accounting.engine.js';
import { InventoryEngine } from './inventory.engine.js';
import { logAudit } from '../../utils/audit.js';

// Roles at or above this level can see every store request in their branch
// (or org, with an explicit branchId filter); everyone else only sees the
// ones they themselves requested. Mirrors the branch-scoping style already
// used in sales.routes.ts's GET /sales (literal role checks, no imported
// hierarchy — requireMinRole's ROLE_HIERARCHY isn't exported).
const WAREHOUSE_ROLES = new Set(['inventory_officer', 'branch_manager', 'org_owner', 'accountant', 'super_admin']);

interface TargetLine {
  line: typeof storeRequestLines.$inferSelect;
  quantity: number;
}

/** Resolves which lines/quantities a supply or reject call applies to. */
function resolveTargetLines(
  lines: (typeof storeRequestLines.$inferSelect)[],
  requested: { storeRequestLineId: string; quantity: number }[] | undefined,
): TargetLine[] {
  if (!requested) {
    return lines
      .map((line) => ({
        line,
        quantity: Number(line.quantity) - Number(line.suppliedQuantity) - Number(line.rejectedQuantity),
      }))
      .filter((t) => t.quantity > 0.0005);
  }

  return requested.map((r) => {
    const line = lines.find((l) => l.id === r.storeRequestLineId);
    if (!line) throw new NotFoundError(`Store request line ${r.storeRequestLineId}`);
    const remaining = Number(line.quantity) - Number(line.suppliedQuantity) - Number(line.rejectedQuantity);
    if (r.quantity > remaining + 0.0005) {
      throw new ValidationError(
        `Requested quantity ${r.quantity} exceeds remaining ${remaining} on line ${line.id}`,
      );
    }
    return { line, quantity: r.quantity };
  });
}

/** Recomputes storeRequests.status from the current line states. */
function computeStatus(lines: (typeof storeRequestLines.$inferSelect)[]): 'pending' | 'partially_supplied' | 'supplied' | 'rejected' {
  const remainingOf = (l: typeof storeRequestLines.$inferSelect) =>
    Number(l.quantity) - Number(l.suppliedQuantity) - Number(l.rejectedQuantity);
  const allResolved = lines.every((l) => remainingOf(l) <= 0.0005);
  const anySupplied = lines.some((l) => Number(l.suppliedQuantity) > 0);
  const anyProgress = lines.some((l) => Number(l.suppliedQuantity) > 0 || Number(l.rejectedQuantity) > 0);

  if (allResolved) return anySupplied ? 'supplied' : 'rejected';
  return anyProgress ? 'partially_supplied' : 'pending';
}

const storeRequestsRoutes: FastifyPluginAsync = async (app) => {

  // ── GET /store-requests ───────────────────────────
  app.get('/store-requests', { preHandler: [authenticate] }, async (req) => {
    const { orgId, role, userId, branchId: userBranch } = req.user;
    const query = z.object({
      status: z.enum(['pending', 'partially_supplied', 'supplied', 'rejected', 'cancelled']).optional(),
      branchId: z.string().uuid().optional(),
      limit: z.coerce.number().max(200).default(50),
    }).parse(req.query);

    const conditions = [eq(storeRequests.organizationId, orgId)];
    if (query.status) conditions.push(eq(storeRequests.status, query.status));

    if (!WAREHOUSE_ROLES.has(role)) {
      conditions.push(eq(storeRequests.requestedBy, userId));
    } else if (query.branchId) {
      conditions.push(eq(storeRequests.branchId, query.branchId));
    } else if (role === 'inventory_officer' && userBranch) {
      conditions.push(eq(storeRequests.branchId, userBranch));
    }

    const rows = await req.db
      .select()
      .from(storeRequests)
      .where(and(...conditions))
      .orderBy(storeRequests.expectedCollectionDate)
      .limit(query.limit);

    return { data: rows, meta: { count: rows.length } };
  });

  // ── GET /store-requests/:id ────────────────────────
  app.get('/store-requests/:id', { preHandler: [authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId } = req.user;

    const [sr] = await req.db.select().from(storeRequests)
      .where(and(eq(storeRequests.id, id), eq(storeRequests.organizationId, orgId)));
    if (!sr) throw new NotFoundError('Store request');

    const [sale, lines, supplies, rejections] = await Promise.all([
      req.db.select().from(sales).where(eq(sales.id, sr.saleId)).then((r) => r[0]),
      req.db.select().from(storeRequestLines).where(eq(storeRequestLines.storeRequestId, id)),
      req.db.select().from(storeRequestSupplies).where(eq(storeRequestSupplies.storeRequestId, id)),
      req.db.select().from(storeRequestRejections).where(eq(storeRequestRejections.storeRequestId, id)),
    ]);

    const supplyIds = supplies.map((s) => s.id);
    const supplyLines = supplyIds.length
      ? await req.db.select().from(storeRequestSupplyLines).where(inArray(storeRequestSupplyLines.storeRequestSupplyId, supplyIds))
      : [];
    const rejectionIds = rejections.map((r) => r.id);
    const rejectionLines = rejectionIds.length
      ? await req.db.select().from(storeRequestRejectionLines).where(inArray(storeRequestRejectionLines.storeRequestRejectionId, rejectionIds))
      : [];

    return {
      data: {
        ...sr,
        sale,
        lines,
        supplies: supplies.map((s) => ({ ...s, lines: supplyLines.filter((l) => l.storeRequestSupplyId === s.id) })),
        rejections: rejections.map((r) => ({ ...r, lines: rejectionLines.filter((l) => l.storeRequestRejectionId === r.id) })),
      },
    };
  });

  // ── POST /store-requests/:id/supply ────────────────
  // Physical handover — this is the moment stock actually leaves, and (if
  // the sale's grace period has elapsed) the moment repricing happens.
  // Can be called more than once per store request for partial handovers.
  app.post('/store-requests/:id/supply', { preHandler: [authenticate, requireMinRole('inventory_officer')] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId, userId } = req.user;
    const body = z.object({
      lines: z.array(z.object({
        storeRequestLineId: z.string().uuid(),
        quantity: z.number().positive(),
      })).optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const [sr] = await req.db.select().from(storeRequests)
      .where(and(eq(storeRequests.id, id), eq(storeRequests.organizationId, orgId)));
    if (!sr) throw new NotFoundError('Store request');
    if (sr.status === 'supplied' || sr.status === 'rejected' || sr.status === 'cancelled') {
      throw new ConflictError(`Store request already ${sr.status}`);
    }

    const allLines = await req.db.select().from(storeRequestLines).where(eq(storeRequestLines.storeRequestId, id));
    const targets = resolveTargetLines(allLines, body.lines);
    if (targets.length === 0) throw new ValidationError('Nothing left to supply on this store request');

    const [sale] = await req.db.select().from(sales).where(eq(sales.id, sr.saleId));
    if (!sale) throw new NotFoundError('Sale');

    const originalSaleLines = await req.db.select().from(saleLines)
      .where(inArray(saleLines.id, targets.map((t) => t.line.saleLineId)));
    const saleLineMap = new Map(originalSaleLines.map((l) => [l.id, l]));

    const productIds = [...new Set(targets.map((t) => t.line.productId))];
    const productRows = await req.db.select().from(products)
      .where(and(eq(products.organizationId, orgId), inArray(products.id, productIds)));
    const productMap = new Map(productRows.map((p) => [p.id, p]));

    const [settings] = await req.db.select().from(organizationSettings)
      .where(eq(organizationSettings.organizationId, orgId));
    const graceDays = settings?.depositGracePeriodDays ?? 60;
    const daysSinceSale = Math.floor((Date.now() - new Date(sale.date).getTime()) / 86_400_000);
    const pastGracePeriod = daysSinceSale > graceDays;

    const accRows = await req.db.select().from(accounts).where(eq(accounts.organizationId, orgId));
    const accByCode = new Map(accRows.map((a) => [a.code, a]));

    let subtotalDelta = 0, taxDelta = 0, totalCOGS = 0;
    const supplyLineInputs: {
      storeRequestLineId: string; quantitySupplied: number; unitPriceCharged: number; unitCost: number; lineTotal: number;
    }[] = [];
    const stockAdjustments: { productId: string; variantId: string | null; quantity: number; unitCost: number; trackInventory: boolean }[] = [];
    const suppliedQuantityUpdates = new Map<string, number>();

    for (const { line, quantity } of targets) {
      const product = productMap.get(line.productId);
      if (!product) throw new NotFoundError(`Product ${line.productId}`);
      const originalLine = saleLineMap.get(line.saleLineId);
      const discountPct = Number(originalLine?.discountPct ?? 0);
      const taxRatePct = Number(originalLine?.taxRate ?? 0);

      const originalUnitPrice = Number(line.requestedUnitPrice);
      const unitPriceCharged = pastGracePeriod ? Number(product.sellingPrice) : originalUnitPrice;
      const unitCost = Number(product.costPrice);

      const netOf = (unitPrice: number) => {
        const gross = quantity * unitPrice;
        const discount = gross * (discountPct / 100);
        const net = gross - discount;
        const tax = net * (taxRatePct / 100);
        return { net, tax, total: net + tax };
      };
      const requested = netOf(originalUnitPrice);
      const charged = netOf(unitPriceCharged);

      subtotalDelta += charged.net - requested.net;
      taxDelta += charged.tax - requested.tax;
      totalCOGS += quantity * unitCost;

      supplyLineInputs.push({
        storeRequestLineId: line.id,
        quantitySupplied: quantity,
        unitPriceCharged,
        unitCost,
        lineTotal: charged.total,
      });
      if (product.trackInventory) {
        stockAdjustments.push({ productId: line.productId, variantId: line.variantId, quantity, unitCost, trackInventory: true });
      }
      suppliedQuantityUpdates.set(line.id, (suppliedQuantityUpdates.get(line.id) ?? 0) + quantity);
    }

    const totalDelta = subtotalDelta + taxDelta;
    const wasRepriced = Math.abs(totalDelta) > 0.005;

    // 1. The handover event itself
    const [supply] = await req.db.insert(storeRequestSupplies).values({
      storeRequestId: id,
      organizationId: orgId,
      branchId: sr.branchId,
      suppliedBy: userId,
      wasRepriced,
      notes: body.notes,
    }).returning();
    if (!supply) throw new Error('Failed to create store request supply');

    await req.db.insert(storeRequestSupplyLines).values(
      supplyLineInputs.map((l) => ({
        storeRequestSupplyId: supply.id,
        storeRequestLineId: l.storeRequestLineId,
        quantitySupplied: String(l.quantitySupplied),
        unitPriceCharged: String(l.unitPriceCharged),
        unitCost: String(l.unitCost),
        lineTotal: String(l.lineTotal),
      })),
    );

    // 2. Line progress
    for (const [lineId, qty] of suppliedQuantityUpdates) {
      const line = allLines.find((l) => l.id === lineId)!;
      await req.db.update(storeRequestLines)
        .set({ suppliedQuantity: String(Number(line.suppliedQuantity) + qty) })
        .where(eq(storeRequestLines.id, lineId));
    }

    // 3. Stock leaves now
    const inventory = new InventoryEngine(req.db);
    for (const adj of stockAdjustments) {
      await inventory.adjustStock({
        orgId,
        branchId: sr.branchId,
        productId: adj.productId,
        variantId: adj.variantId ?? undefined,
        quantity: -adj.quantity,
        unitCost: adj.unitCost,
        movementType: 'sale',
        sourceType: 'store_request_supply',
        sourceId: supply.id,
        userId,
      });
    }

    // 4. COGS journal — always, separate from the sale's revenue entry
    const accounting = new AccountingEngine(req.db);
    let cogsJournalEntryId: string | undefined;
    const cogsAccount = accByCode.get('5000');
    const inventoryAccount = accByCode.get('1100');
    if (totalCOGS > 0.005 && cogsAccount && inventoryAccount) {
      const je = await accounting.postJournal({
        organizationId: orgId,
        branchId: sr.branchId,
        date: new Date().toISOString().slice(0, 10),
        description: `COGS - store request ${sr.storeRequestNumber}`,
        sourceType: 'store_request_supply',
        sourceId: supply.id,
        lines: [
          { accountId: cogsAccount.id, debit: totalCOGS, credit: 0 },
          { accountId: inventoryAccount.id, debit: 0, credit: totalCOGS },
        ],
        createdBy: userId,
      });
      cogsJournalEntryId = je.id;
    }

    // 5. Reprice delta journal — only if the price actually moved
    let priceAdjustmentJournalEntryId: string | undefined;
    if (wasRepriced) {
      const revenueAccount = accByCode.get('4001');
      const taxAccount = accByCode.get('2300');
      const debitAccount = sale.isCreditSale ? accByCode.get('1040') : accByCode.get('1001');
      if (revenueAccount && debitAccount) {
        const lines: { accountId: string; debit: number; credit: number; description?: string }[] = [];
        if (Math.abs(subtotalDelta) > 0.005) {
          lines.push(subtotalDelta > 0
            ? { accountId: revenueAccount.id, debit: 0, credit: subtotalDelta, description: 'Repricing at collection' }
            : { accountId: revenueAccount.id, debit: -subtotalDelta, credit: 0, description: 'Repricing at collection' });
        }
        if (Math.abs(taxDelta) > 0.005 && taxAccount) {
          lines.push(taxDelta > 0
            ? { accountId: taxAccount.id, debit: 0, credit: taxDelta, description: 'GST/VAT adjustment' }
            : { accountId: taxAccount.id, debit: -taxDelta, credit: 0, description: 'GST/VAT adjustment' });
        }
        lines.push(totalDelta > 0
          ? { accountId: debitAccount.id, debit: totalDelta, credit: 0, description: `Sale ${sale.saleNumber} repriced` }
          : { accountId: debitAccount.id, debit: 0, credit: -totalDelta, description: `Sale ${sale.saleNumber} repriced` });

        const je = await accounting.postJournal({
          organizationId: orgId,
          branchId: sr.branchId,
          date: new Date().toISOString().slice(0, 10),
          description: `Sale ${sale.saleNumber} repriced at collection (grace period elapsed)`,
          sourceType: 'sale_reprice',
          sourceId: sale.id,
          lines,
          createdBy: userId,
        });
        priceAdjustmentJournalEntryId = je.id;

        const newSubtotal = Number(sale.subtotal) + subtotalDelta;
        const newTax = Number(sale.taxAmount) + taxDelta;
        const newTotal = Number(sale.totalAmount) + totalDelta;
        const newAmountDue = Number(sale.amountDue) + totalDelta;
        await req.db.update(sales).set({
          subtotal: String(newSubtotal),
          taxAmount: String(newTax),
          totalAmount: String(newTotal),
          amountDue: String(newAmountDue),
          status: newAmountDue <= 0.01 ? 'paid' : 'partial',
          isRepriced: true,
          repricedAt: new Date(),
        }).where(eq(sales.id, sale.id));
      }
    }

    await req.db.update(storeRequestSupplies).set({ cogsJournalEntryId, priceAdjustmentJournalEntryId }).where(eq(storeRequestSupplies.id, supply.id));

    // 6. Roll up store request status
    const refreshedLines = await req.db.select().from(storeRequestLines).where(eq(storeRequestLines.storeRequestId, id));
    const newStatus = computeStatus(refreshedLines);
    const [updated] = await req.db.update(storeRequests).set({ status: newStatus }).where(eq(storeRequests.id, id)).returning();

    await logAudit(req.db, {
      organizationId: orgId,
      userId,
      action: 'approve',
      resourceType: 'store_request',
      resourceId: id,
      resourceNumber: sr.storeRequestNumber,
      changes: { supplyId: supply.id, repriced: wasRepriced, totalDelta },
    });

    return { data: { storeRequest: updated, supply } };
  });

  // ── POST /store-requests/:id/reject ────────────────
  // Permanently marks some/all remaining quantity as un-suppliable (e.g.
  // discontinued/out of stock). Does not touch the sale or its journal — a
  // manager separately voids the sale via POST /sales/:id/void if needed.
  app.post('/store-requests/:id/reject', { preHandler: [authenticate, requireMinRole('inventory_officer')] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId, userId } = req.user;
    const body = z.object({
      reason: z.string().min(1),
      lines: z.array(z.object({
        storeRequestLineId: z.string().uuid(),
        quantity: z.number().positive(),
      })).optional(),
    }).parse(req.body);

    const [sr] = await req.db.select().from(storeRequests)
      .where(and(eq(storeRequests.id, id), eq(storeRequests.organizationId, orgId)));
    if (!sr) throw new NotFoundError('Store request');
    if (sr.status === 'supplied' || sr.status === 'rejected' || sr.status === 'cancelled') {
      throw new ConflictError(`Store request already ${sr.status}`);
    }

    const allLines = await req.db.select().from(storeRequestLines).where(eq(storeRequestLines.storeRequestId, id));
    const targets = resolveTargetLines(allLines, body.lines);
    if (targets.length === 0) throw new ValidationError('Nothing left to reject on this store request');

    const [rejection] = await req.db.insert(storeRequestRejections).values({
      storeRequestId: id,
      organizationId: orgId,
      branchId: sr.branchId,
      rejectedBy: userId,
      reason: body.reason,
    }).returning();
    if (!rejection) throw new Error('Failed to create store request rejection');

    await req.db.insert(storeRequestRejectionLines).values(
      targets.map((t) => ({
        storeRequestRejectionId: rejection.id,
        storeRequestLineId: t.line.id,
        quantityRejected: String(t.quantity),
      })),
    );

    for (const { line, quantity } of targets) {
      await req.db.update(storeRequestLines)
        .set({ rejectedQuantity: String(Number(line.rejectedQuantity) + quantity) })
        .where(eq(storeRequestLines.id, line.id));
    }

    const refreshedLines = await req.db.select().from(storeRequestLines).where(eq(storeRequestLines.storeRequestId, id));
    const newStatus = computeStatus(refreshedLines);
    const [updated] = await req.db.update(storeRequests).set({ status: newStatus }).where(eq(storeRequests.id, id)).returning();

    await logAudit(req.db, {
      organizationId: orgId,
      userId,
      action: 'reject',
      resourceType: 'store_request',
      resourceId: id,
      resourceNumber: sr.storeRequestNumber,
      changes: { rejectionId: rejection.id, reason: body.reason },
    });

    return { data: { storeRequest: updated, rejection } };
  });
};

export default storeRequestsRoutes;
