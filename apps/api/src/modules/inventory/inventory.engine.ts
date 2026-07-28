import { eq, and, gt, asc, sql } from 'drizzle-orm';
import type { Database } from '@ledgera/db';
import { stockLevels, stockMovements, stockBatches, organizationSettings } from '@ledgera/db';
import { InsufficientStockError } from '../../utils/errors.js';

export interface StockAdjustInput {
  orgId: string;
  branchId: string;
  productId: string;
  variantId?: string | undefined;
  batchId?: string | undefined;
  quantity: number;           // positive = in, negative = out
  unitCost: number;
  movementType: string;
  sourceType: string;
  sourceId: string;
  notes?: string | undefined;
  userId?: string | undefined;
}

export interface BatchAllocation {
  batchId: string;
  quantity: number;
  unitCost: number;
}

export class InventoryEngine {
  constructor(private readonly db: Database) {}

  async adjustStock(input: StockAdjustInput): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Lock the stock level row
      const existing = await tx
        .select()
        .from(stockLevels)
        .where(
          and(
            eq(stockLevels.productId, input.productId),
            eq(stockLevels.branchId, input.branchId),
            input.variantId
              ? eq(stockLevels.variantId, input.variantId)
              : sql`${stockLevels.variantId} IS NULL`,
          ),
        )
        .for('update')
        .limit(1);

      const current = existing[0];
      const currentQty = Number(current?.quantity ?? 0);
      const currentAvgCost = Number(current?.avgCost ?? input.unitCost);
      const newQty = currentQty + input.quantity;

      if (newQty < 0) {
        // Check if org allows negative stock before throwing
        const [settings] = await tx
          .select({ allowNegativeStock: organizationSettings.allowNegativeStock })
          .from(organizationSettings)
          .where(eq(organizationSettings.organizationId, input.orgId))
          .limit(1);

        if (!settings?.allowNegativeStock) {
          throw new InsufficientStockError(input.productId, Math.abs(input.quantity), currentQty);
        }
      }

      // Recalculate weighted average cost when adding stock
      let newAvgCost = currentAvgCost;
      if (input.quantity > 0 && newQty > 0) {
        const currentValue = currentQty * currentAvgCost;
        const addedValue = input.quantity * input.unitCost;
        newAvgCost = (currentValue + addedValue) / newQty;
      }

      // Upsert stock level
      if (current) {
        await tx
          .update(stockLevels)
          .set({ quantity: String(newQty), avgCost: String(newAvgCost), updatedAt: new Date() })
          .where(eq(stockLevels.id, current.id));
      } else {
        await tx.insert(stockLevels).values({
          organizationId: input.orgId,
          productId: input.productId,
          variantId: input.variantId,
          branchId: input.branchId,
          quantity: String(newQty),
          avgCost: String(input.unitCost),
        });
      }

      // Write movement record
      await tx.insert(stockMovements).values({
        organizationId: input.orgId,
        branchId: input.branchId,
        productId: input.productId,
        variantId: input.variantId,
        batchId: input.batchId,
        movementType: input.movementType,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        quantity: String(input.quantity),
        unitCost: String(input.unitCost),
        totalCost: String(Math.abs(input.quantity) * input.unitCost),
        quantityBefore: String(currentQty),
        quantityAfter: String(newQty),
        notes: input.notes,
        createdBy: input.userId,
      });
    });
  }

  /** FIFO: allocates batches oldest-first for a sale. Returns cost. */
  async allocateFIFO(
    orgId: string,
    branchId: string,
    productId: string,
    quantity: number,
  ): Promise<{ allocations: BatchAllocation[]; totalCost: number }> {
    const batches = await this.db
      .select()
      .from(stockBatches)
      .where(
        and(
          eq(stockBatches.organizationId, orgId),
          eq(stockBatches.productId, productId),
          eq(stockBatches.branchId, branchId),
          gt(stockBatches.quantity, '0'),
        ),
      )
      .orderBy(asc(stockBatches.createdAt));

    let remaining = quantity;
    let totalCost = 0;
    const allocations: BatchAllocation[] = [];

    for (const batch of batches) {
      if (remaining <= 0) break;
      const available = Number(batch.quantity);
      const take = Math.min(remaining, available);
      totalCost += take * Number(batch.costPrice);
      allocations.push({ batchId: batch.id, quantity: take, unitCost: Number(batch.costPrice) });
      remaining -= take;
    }

    if (remaining > 0) {
      throw new InsufficientStockError(productId, quantity, quantity - remaining);
    }

    return { allocations, totalCost };
  }

  /** Weighted average COGS for a sale. */
  async getCOGSWeightedAvg(
    productId: string,
    branchId: string,
    quantity: number,
  ): Promise<number> {
    const [level] = await this.db
      .select()
      .from(stockLevels)
      .where(
        and(
          eq(stockLevels.productId, productId),
          eq(stockLevels.branchId, branchId),
        ),
      )
      .limit(1);

    if (!level || Number(level.quantity) < quantity) {
      throw new InsufficientStockError(productId, quantity, Number(level?.quantity ?? 0));
    }

    return quantity * Number(level.avgCost);
  }

  async getStockLevel(productId: string, branchId: string): Promise<number> {
    const [level] = await this.db
      .select({ quantity: stockLevels.quantity })
      .from(stockLevels)
      .where(and(eq(stockLevels.productId, productId), eq(stockLevels.branchId, branchId)))
      .limit(1);
    return Number(level?.quantity ?? 0);
  }
}
