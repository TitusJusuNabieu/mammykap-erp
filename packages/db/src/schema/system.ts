import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { auditActionEnum, notificationChannelEnum } from './enums.js';
import { organizations } from './organizations.js';
import { users } from './users.js';

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  organizationId: uuid('organization_id').references(() => organizations.id),
  userId: uuid('user_id').references(() => users.id),
  action: auditActionEnum('action').notNull(),
  resourceType: varchar('resource_type', { length: 100 }).notNull(),
  resourceId: uuid('resource_id'),
  resourceNumber: varchar('resource_number', { length: 100 }),
  changes: jsonb('changes'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  organizationId: uuid('organization_id').references(() => organizations.id),
  userId: uuid('user_id').references(() => users.id),
  channel: notificationChannelEnum('channel').notNull(),
  title: varchar('title', { length: 500 }).notNull(),
  body: text('body').notNull(),
  data: jsonb('data'),
  isRead: boolean('is_read').notNull().default(false),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const organizationSettings = pgTable('organization_settings', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id).unique(),
  invoicePrefix: varchar('invoice_prefix', { length: 10 }).notNull().default('INV'),
  poPrefix: varchar('po_prefix', { length: 10 }).notNull().default('PO'),
  receiptPrefix: varchar('receipt_prefix', { length: 10 }).notNull().default('RCP'),
  expensePrefix: varchar('expense_prefix', { length: 10 }).notNull().default('EXP'),
  enableTax: boolean('enable_tax').notNull().default(true),
  defaultTaxRate: numeric('default_tax_rate', { precision: 5, scale: 2 }).notNull().default('15'),
  taxName: varchar('tax_name', { length: 50 }).notNull().default('GST'),
  taxNumber: varchar('tax_number', { length: 100 }),
  enableMultiCurrency: boolean('enable_multi_currency').notNull().default(false),
  enablePayroll: boolean('enable_payroll').notNull().default(true),
  enableMomo: boolean('enable_momo').notNull().default(true),
  allowNegativeStock: boolean('allow_negative_stock').notNull().default(false),
  // Days after a sale during which the originally quoted price still holds
  // at handover; past this, storeRequests.supply reprices at the product's
  // current sellingPrice. See store-requests.ts.
  depositGracePeriodDays: integer('deposit_grace_period_days').notNull().default(60),
  lowStockNotification: boolean('low_stock_notification').notNull().default(true),
  whatsappReceipts: boolean('whatsapp_receipts').notNull().default(false),
  smsReceipts: boolean('sms_receipts').notNull().default(false),
  posAutoPrint: boolean('pos_auto_print').notNull().default(true),
  // Receipt / Invoice customization
  receiptHeaderText: text('receipt_header_text'),
  receiptFooterText: text('receipt_footer_text').default('Thank you for your business!'),
  invoiceFooterText: text('invoice_footer_text').default('Payment is due within 30 days. Thank you.'),
  showLogoOnReceipt: boolean('show_logo_on_receipt').notNull().default(true),
  showLogoOnInvoice: boolean('show_logo_on_invoice').notNull().default(true),
  showTinOnReceipt: boolean('show_tin_on_receipt').notNull().default(true),
  showTinOnInvoice: boolean('show_tin_on_invoice').notNull().default(true),
  invoiceTerms: text('invoice_terms'),
  invoiceBankDetails: text('invoice_bank_details'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Sequence tracker for human-readable numbers (INV-0001, etc.)
export const sequences = pgTable('sequences', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  sequenceKey: varchar('sequence_key', { length: 50 }).notNull(),
  currentValue: numeric('current_value').notNull().default('0'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
