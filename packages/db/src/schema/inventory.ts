import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations, branches } from './organizations.js';
import { accounts } from './accounting.js';
import { users } from './users.js';

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  parentId: uuid('parent_id'),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const units = pgTable('units', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: varchar('name', { length: 50 }).notNull(),
  abbreviation: varchar('abbreviation', { length: 10 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    categoryId: uuid('category_id').references(() => categories.id),
    unitId: uuid('unit_id').references(() => units.id),
    sku: varchar('sku', { length: 100 }),
    barcode: varchar('barcode', { length: 100 }),
    name: varchar('name', { length: 500 }).notNull(),
    description: text('description'),
    costPrice: numeric('cost_price', { precision: 18, scale: 4 }).notNull().default('0'),
    sellingPrice: numeric('selling_price', { precision: 18, scale: 4 }).notNull().default('0'),
    taxRate: numeric('tax_rate', { precision: 5, scale: 2 }).notNull().default('0'),
    isTaxable: boolean('is_taxable').notNull().default(false),
    trackInventory: boolean('track_inventory').notNull().default(true),
    hasExpiry: boolean('has_expiry').notNull().default(false),
    hasBatch: boolean('has_batch').notNull().default(false),
    reorderPoint: numeric('reorder_point', { precision: 12, scale: 3 }).notNull().default('0'),
    isActive: boolean('is_active').notNull().default(true),
    imageUrl: text('image_url'),
    inventoryAccountId: uuid('inventory_account_id').references(() => accounts.id),
    revenueAccountId: uuid('revenue_account_id').references(() => accounts.id),
    cogsAccountId: uuid('cogs_account_id').references(() => accounts.id),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('products_org_idx').on(t.organizationId),
    uniqueIndex('products_org_sku_idx').on(t.organizationId, t.sku),
    uniqueIndex('products_org_barcode_idx').on(t.organizationId, t.barcode),
  ],
);

export const productVariants = pgTable('product_variants', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  productId: uuid('product_id').notNull().references(() => products.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  sku: varchar('sku', { length: 100 }),
  barcode: varchar('barcode', { length: 100 }),
  attributes: jsonb('attributes').notNull().default('{}'),
  costPrice: numeric('cost_price', { precision: 18, scale: 4 }),
  sellingPrice: numeric('selling_price', { precision: 18, scale: 4 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const stockLevels = pgTable(
  'stock_levels',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    productId: uuid('product_id').notNull().references(() => products.id),
    variantId: uuid('variant_id').references(() => productVariants.id),
    branchId: uuid('branch_id').notNull().references(() => branches.id),
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull().default('0'),
    avgCost: numeric('avg_cost', { precision: 18, scale: 4 }).notNull().default('0'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('stock_levels_unique_idx').on(t.productId, t.variantId, t.branchId)],
);

export const stockBatches = pgTable('stock_batches', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  branchId: uuid('branch_id').notNull().references(() => branches.id),
  batchNumber: varchar('batch_number', { length: 100 }).notNull(),
  expiryDate: date('expiry_date'),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull().default('0'),
  costPrice: numeric('cost_price', { precision: 18, scale: 4 }).notNull().default('0'),
  manufacturedDate: date('manufactured_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    branchId: uuid('branch_id').notNull().references(() => branches.id),
    productId: uuid('product_id').notNull().references(() => products.id),
    variantId: uuid('variant_id').references(() => productVariants.id),
    batchId: uuid('batch_id').references(() => stockBatches.id),
    movementType: varchar('movement_type', { length: 50 }).notNull(),
    sourceType: varchar('source_type', { length: 50 }),
    sourceId: uuid('source_id'),
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
    unitCost: numeric('unit_cost', { precision: 18, scale: 4 }).notNull().default('0'),
    totalCost: numeric('total_cost', { precision: 18, scale: 4 }).notNull().default('0'),
    quantityBefore: numeric('quantity_before', { precision: 12, scale: 3 }).notNull().default('0'),
    quantityAfter: numeric('quantity_after', { precision: 12, scale: 3 }).notNull().default('0'),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('stock_movements_product_idx').on(t.organizationId, t.productId, t.createdAt)],
);

export const stockTransfers = pgTable(
  'stock_transfers',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    transferNumber: varchar('transfer_number', { length: 50 }).notNull(),
    fromBranchId: uuid('from_branch_id').notNull().references(() => branches.id),
    toBranchId: uuid('to_branch_id').notNull().references(() => branches.id),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    notes: text('notes'),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    shippedBy: uuid('shipped_by').references(() => users.id),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    receivedBy: uuid('received_by').references(() => users.id),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('transfers_org_number_idx').on(t.organizationId, t.transferNumber)],
);

export const stockTransferLines = pgTable('stock_transfer_lines', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  transferId: uuid('transfer_id').notNull().references(() => stockTransfers.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  variantId: uuid('variant_id').references(() => productVariants.id),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  receivedQty: numeric('received_qty', { precision: 12, scale: 3 }).notNull().default('0'),
  unitCost: numeric('unit_cost', { precision: 18, scale: 4 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
