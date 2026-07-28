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
import { invoiceStatusEnum, paymentMethodEnum, poStatusEnum } from './enums.js';
import { organizations, branches } from './organizations.js';
import { accounts, fiscalPeriods, journalEntries } from './accounting.js';
import { products, productVariants } from './inventory.js';
import { users } from './users.js';

export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    supplierNumber: varchar('supplier_number', { length: 50 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 30 }),
    email: varchar('email', { length: 255 }),
    address: text('address'),
    tin: varchar('tin', { length: 50 }),
    currentBalance: numeric('current_balance', { precision: 18, scale: 4 }).notNull().default('0'),
    apAccountId: uuid('ap_account_id').references(() => accounts.id),
    paymentTermsDays: numeric('payment_terms_days').notNull().default('30'),
    isActive: boolean('is_active').notNull().default(true),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('suppliers_org_number_idx').on(t.organizationId, t.supplierNumber)],
);

export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    branchId: uuid('branch_id').notNull().references(() => branches.id),
    poNumber: varchar('po_number', { length: 50 }).notNull(),
    date: date('date').notNull(),
    expectedDate: date('expected_date'),
    supplierId: uuid('supplier_id').notNull().references(() => suppliers.id),
    fiscalPeriodId: uuid('fiscal_period_id').references(() => fiscalPeriods.id),
    subtotal: numeric('subtotal', { precision: 18, scale: 4 }).notNull().default('0'),
    taxAmount: numeric('tax_amount', { precision: 18, scale: 4 }).notNull().default('0'),
    totalAmount: numeric('total_amount', { precision: 18, scale: 4 }).notNull().default('0'),
    status: poStatusEnum('status').notNull().default('draft'),
    notes: text('notes'),
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('po_org_number_idx').on(t.organizationId, t.poNumber)],
);

export const purchaseOrderLines = pgTable('purchase_order_lines', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  poId: uuid('po_id').notNull().references(() => purchaseOrders.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  variantId: uuid('variant_id').references(() => productVariants.id),
  description: text('description'),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  receivedQty: numeric('received_qty', { precision: 12, scale: 3 }).notNull().default('0'),
  unitCost: numeric('unit_cost', { precision: 18, scale: 4 }).notNull(),
  taxRate: numeric('tax_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  taxAmount: numeric('tax_amount', { precision: 18, scale: 4 }).notNull().default('0'),
  lineTotal: numeric('line_total', { precision: 18, scale: 4 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const goodsReceivedNotes = pgTable(
  'goods_received_notes',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    branchId: uuid('branch_id').notNull().references(() => branches.id),
    grnNumber: varchar('grn_number', { length: 50 }).notNull(),
    date: date('date').notNull(),
    poId: uuid('po_id').references(() => purchaseOrders.id),
    supplierId: uuid('supplier_id').notNull().references(() => suppliers.id),
    totalCost: numeric('total_cost', { precision: 18, scale: 4 }).notNull().default('0'),
    journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('grn_org_number_idx').on(t.organizationId, t.grnNumber)],
);

export const grnLines = pgTable('grn_lines', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  grnId: uuid('grn_id').notNull().references(() => goodsReceivedNotes.id),
  poLineId: uuid('po_line_id').references(() => purchaseOrderLines.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  variantId: uuid('variant_id').references(() => productVariants.id),
  batchNumber: varchar('batch_number', { length: 100 }),
  expiryDate: date('expiry_date'),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  unitCost: numeric('unit_cost', { precision: 18, scale: 4 }).notNull(),
  lineTotal: numeric('line_total', { precision: 18, scale: 4 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const purchaseInvoices = pgTable(
  'purchase_invoices',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    branchId: uuid('branch_id').notNull().references(() => branches.id),
    invoiceNumber: varchar('invoice_number', { length: 100 }).notNull(),
    supplierInvoiceNo: varchar('supplier_invoice_no', { length: 100 }),
    date: date('date').notNull(),
    dueDate: date('due_date'),
    grnId: uuid('grn_id').references(() => goodsReceivedNotes.id),
    supplierId: uuid('supplier_id').notNull().references(() => suppliers.id),
    fiscalPeriodId: uuid('fiscal_period_id').references(() => fiscalPeriods.id),
    subtotal: numeric('subtotal', { precision: 18, scale: 4 }).notNull().default('0'),
    taxAmount: numeric('tax_amount', { precision: 18, scale: 4 }).notNull().default('0'),
    totalAmount: numeric('total_amount', { precision: 18, scale: 4 }).notNull().default('0'),
    amountPaid: numeric('amount_paid', { precision: 18, scale: 4 }).notNull().default('0'),
    amountDue: numeric('amount_due', { precision: 18, scale: 4 }).notNull().default('0'),
    status: invoiceStatusEnum('status').notNull().default('draft'),
    journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('pinv_org_number_idx').on(t.organizationId, t.invoiceNumber)],
);

export const supplierPayments = pgTable(
  'supplier_payments',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    paymentNumber: varchar('payment_number', { length: 50 }).notNull(),
    date: date('date').notNull(),
    supplierId: uuid('supplier_id').notNull().references(() => suppliers.id),
    invoiceId: uuid('invoice_id').references(() => purchaseInvoices.id),
    amount: numeric('amount', { precision: 18, scale: 4 }).notNull(),
    method: paymentMethodEnum('method').notNull(),
    reference: varchar('reference', { length: 100 }),
    accountId: uuid('account_id').references(() => accounts.id),
    notes: text('notes'),
    journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('spay_org_number_idx').on(t.organizationId, t.paymentNumber)],
);
