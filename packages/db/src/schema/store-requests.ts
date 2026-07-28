import {
  boolean,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { storeRequestStatusEnum } from './enums.js';
import { organizations, branches } from './organizations.js';
import { journalEntries } from './accounting.js';
import { sales, saleLines } from './sales.js';
import { products, productVariants } from './inventory.js';
import { users } from './users.js';

// One per sale — created when the sale is recorded at the sales desk.
// Stock only leaves (and, past the grace period, sale lines only get
// repriced) once store/warehouse staff resolve this via a supply event.
// See storeRequestSupplies for the actual handover(s) — a request can be
// fulfilled across multiple partial handovers.
export const storeRequests = pgTable(
  'store_requests',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    branchId: uuid('branch_id').notNull().references(() => branches.id),
    storeRequestNumber: varchar('store_request_number', { length: 50 }).notNull(),
    saleId: uuid('sale_id').notNull().references(() => sales.id),
    status: storeRequestStatusEnum('status').notNull().default('pending'),
    expectedCollectionDate: date('expected_collection_date').notNull(),
    requestedBy: uuid('requested_by').references(() => users.id),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('store_requests_org_number_idx').on(t.organizationId, t.storeRequestNumber),
    uniqueIndex('store_requests_sale_idx').on(t.saleId),
    index('store_requests_status_idx').on(t.organizationId, t.branchId, t.status),
    index('store_requests_gate_idx').on(t.requestedBy, t.status, t.expectedCollectionDate),
  ],
);

// Immutable snapshot of what was quoted at sale time. sale_lines itself is
// never touched again — actual supplied pricing lives entirely on
// storeRequestSupplyLines, since partial handovers can happen at different
// prices on different days for the same line.
export const storeRequestLines = pgTable('store_request_lines', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  storeRequestId: uuid('store_request_id').notNull().references(() => storeRequests.id),
  saleLineId: uuid('sale_line_id').notNull().references(() => saleLines.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  variantId: uuid('variant_id').references(() => productVariants.id),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  requestedUnitPrice: numeric('requested_unit_price', { precision: 18, scale: 4 }).notNull(),
  requestedLineTotal: numeric('requested_line_total', { precision: 18, scale: 4 }).notNull(),
  suppliedQuantity: numeric('supplied_quantity', { precision: 12, scale: 3 }).notNull().default('0'),
  rejectedQuantity: numeric('rejected_quantity', { precision: 12, scale: 3 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// One row per physical handover event (the outbound equivalent of a GRN).
// A store request can have several of these if fulfilled in batches.
export const storeRequestSupplies = pgTable('store_request_supplies', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  storeRequestId: uuid('store_request_id').notNull().references(() => storeRequests.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  branchId: uuid('branch_id').notNull().references(() => branches.id),
  suppliedBy: uuid('supplied_by').notNull().references(() => users.id),
  suppliedAt: timestamp('supplied_at', { withTimezone: true }).notNull().defaultNow(),
  wasRepriced: boolean('was_repriced').notNull().default(false),
  cogsJournalEntryId: uuid('cogs_journal_entry_id').references(() => journalEntries.id),
  priceAdjustmentJournalEntryId: uuid('price_adjustment_journal_entry_id').references(() => journalEntries.id),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const storeRequestSupplyLines = pgTable('store_request_supply_lines', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  storeRequestSupplyId: uuid('store_request_supply_id').notNull().references(() => storeRequestSupplies.id),
  storeRequestLineId: uuid('store_request_line_id').notNull().references(() => storeRequestLines.id),
  quantitySupplied: numeric('quantity_supplied', { precision: 12, scale: 3 }).notNull(),
  unitPriceCharged: numeric('unit_price_charged', { precision: 18, scale: 4 }).notNull(),
  unitCost: numeric('unit_cost', { precision: 18, scale: 4 }).notNull().default('0'),
  lineTotal: numeric('line_total', { precision: 18, scale: 4 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Permanent "can't supply the rest of this line" events (e.g. discontinued,
// out of stock) — distinct from voiding the whole sale.
export const storeRequestRejections = pgTable('store_request_rejections', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  storeRequestId: uuid('store_request_id').notNull().references(() => storeRequests.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  branchId: uuid('branch_id').notNull().references(() => branches.id),
  rejectedBy: uuid('rejected_by').notNull().references(() => users.id),
  rejectedAt: timestamp('rejected_at', { withTimezone: true }).notNull().defaultNow(),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const storeRequestRejectionLines = pgTable('store_request_rejection_lines', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  storeRequestRejectionId: uuid('store_request_rejection_id').notNull().references(() => storeRequestRejections.id),
  storeRequestLineId: uuid('store_request_line_id').notNull().references(() => storeRequestLines.id),
  quantityRejected: numeric('quantity_rejected', { precision: 12, scale: 3 }).notNull(),
});
