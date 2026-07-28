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
import { invoiceStatusEnum, paymentMethodEnum } from './enums.js';
import { organizations, branches } from './organizations.js';
import { fiscalPeriods, accounts, journalEntries } from './accounting.js';
import { products, productVariants, stockBatches } from './inventory.js';
import { users } from './users.js';

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    customerNumber: varchar('customer_number', { length: 50 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 30 }),
    email: varchar('email', { length: 255 }),
    address: text('address'),
    tin: varchar('tin', { length: 50 }),
    creditLimit: numeric('credit_limit', { precision: 18, scale: 4 }).notNull().default('0'),
    currentBalance: numeric('current_balance', { precision: 18, scale: 4 }).notNull().default('0'),
    arAccountId: uuid('ar_account_id').references(() => accounts.id),
    isActive: boolean('is_active').notNull().default(true),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('customers_org_number_idx').on(t.organizationId, t.customerNumber),
    index('customers_org_idx').on(t.organizationId),
  ],
);

export const sales = pgTable(
  'sales',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    branchId: uuid('branch_id').notNull().references(() => branches.id),
    saleNumber: varchar('sale_number', { length: 50 }).notNull(),
    date: date('date').notNull(),
    customerId: uuid('customer_id').references(() => customers.id),
    fiscalPeriodId: uuid('fiscal_period_id').references(() => fiscalPeriods.id),
    subtotal: numeric('subtotal', { precision: 18, scale: 4 }).notNull().default('0'),
    discountAmount: numeric('discount_amount', { precision: 18, scale: 4 }).notNull().default('0'),
    taxAmount: numeric('tax_amount', { precision: 18, scale: 4 }).notNull().default('0'),
    totalAmount: numeric('total_amount', { precision: 18, scale: 4 }).notNull().default('0'),
    amountPaid: numeric('amount_paid', { precision: 18, scale: 4 }).notNull().default('0'),
    amountDue: numeric('amount_due', { precision: 18, scale: 4 }).notNull().default('0'),
    status: invoiceStatusEnum('status').notNull().default('draft'),
    isCreditSale: boolean('is_credit_sale').notNull().default(false),
    notes: text('notes'),
    receiptUrl: text('receipt_url'),
    journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sales_org_number_idx').on(t.organizationId, t.saleNumber),
    index('sales_org_date_idx').on(t.organizationId, t.date),
    index('sales_customer_idx').on(t.customerId),
  ],
);

export const saleLines = pgTable('sale_lines', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  saleId: uuid('sale_id').notNull().references(() => sales.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  variantId: uuid('variant_id').references(() => productVariants.id),
  batchId: uuid('batch_id').references(() => stockBatches.id),
  description: text('description'),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  unitPrice: numeric('unit_price', { precision: 18, scale: 4 }).notNull(),
  discountPct: numeric('discount_pct', { precision: 5, scale: 2 }).notNull().default('0'),
  discountAmount: numeric('discount_amount', { precision: 18, scale: 4 }).notNull().default('0'),
  taxRate: numeric('tax_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  taxAmount: numeric('tax_amount', { precision: 18, scale: 4 }).notNull().default('0'),
  lineTotal: numeric('line_total', { precision: 18, scale: 4 }).notNull(),
  unitCost: numeric('unit_cost', { precision: 18, scale: 4 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const salePayments = pgTable('sale_payments', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  saleId: uuid('sale_id').notNull().references(() => sales.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  method: paymentMethodEnum('method').notNull(),
  amount: numeric('amount', { precision: 18, scale: 4 }).notNull(),
  reference: varchar('reference', { length: 100 }),
  accountId: uuid('account_id').references(() => accounts.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const saleReturns = pgTable(
  'sale_returns',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    branchId: uuid('branch_id').notNull().references(() => branches.id),
    returnNumber: varchar('return_number', { length: 50 }).notNull(),
    originalSaleId: uuid('original_sale_id').references(() => sales.id),
    date: date('date').notNull(),
    reason: text('reason'),
    totalAmount: numeric('total_amount', { precision: 18, scale: 4 }).notNull().default('0'),
    refundMethod: paymentMethodEnum('refund_method'),
    journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('returns_org_number_idx').on(t.organizationId, t.returnNumber)],
);

export const customerPayments = pgTable(
  'customer_payments',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    paymentNumber: varchar('payment_number', { length: 50 }).notNull(),
    date: date('date').notNull(),
    customerId: uuid('customer_id').notNull().references(() => customers.id),
    saleId: uuid('sale_id').references(() => sales.id),
    amount: numeric('amount', { precision: 18, scale: 4 }).notNull(),
    method: paymentMethodEnum('method').notNull(),
    reference: varchar('reference', { length: 100 }),
    accountId: uuid('account_id').references(() => accounts.id),
    notes: text('notes'),
    journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('cust_payments_org_number_idx').on(t.organizationId, t.paymentNumber)],
);
