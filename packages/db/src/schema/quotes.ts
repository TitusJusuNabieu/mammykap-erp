import {
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
import { quoteTypeEnum, quoteStatusEnum } from './enums.js';
import { organizations } from './organizations.js';
import { customers } from './sales.js';
import { users } from './users.js';

export const quotes = pgTable(
  'quotes',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    quoteNumber: varchar('quote_number', { length: 50 }).notNull(),
    type: quoteTypeEnum('type').notNull().default('quotation'),
    status: quoteStatusEnum('status').notNull().default('draft'),

    // Customer — registered or free-text
    customerId: uuid('customer_id').references(() => customers.id),
    customerName: varchar('customer_name', { length: 255 }),
    customerEmail: varchar('customer_email', { length: 255 }),
    customerPhone: varchar('customer_phone', { length: 50 }),
    customerAddress: text('customer_address'),

    date: date('date').notNull(),
    expiryDate: date('expiry_date'),
    dueDate: date('due_date'),

    subtotal: numeric('subtotal', { precision: 18, scale: 4 }).notNull().default('0'),
    discountAmount: numeric('discount_amount', { precision: 18, scale: 4 }).notNull().default('0'),
    taxAmount: numeric('tax_amount', { precision: 18, scale: 4 }).notNull().default('0'),
    totalAmount: numeric('total_amount', { precision: 18, scale: 4 }).notNull().default('0'),

    notes: text('notes'),
    terms: text('terms'),

    // Set when converted to a sale
    convertedToSaleId: uuid('converted_to_sale_id'),

    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('quotes_org_number_idx').on(t.organizationId, t.quoteNumber),
    index('quotes_org_date_idx').on(t.organizationId, t.date),
    index('quotes_customer_idx').on(t.customerId),
  ],
);

export const quoteLines = pgTable(
  'quote_lines',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    quoteId: uuid('quote_id').notNull().references(() => quotes.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    description: text('description').notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull().default('1'),
    unitPrice: numeric('unit_price', { precision: 18, scale: 4 }).notNull().default('0'),
    discountPct: numeric('discount_pct', { precision: 5, scale: 2 }).notNull().default('0'),
    discountAmount: numeric('discount_amount', { precision: 18, scale: 4 }).notNull().default('0'),
    taxRate: numeric('tax_rate', { precision: 5, scale: 2 }).notNull().default('0'),
    taxAmount: numeric('tax_amount', { precision: 18, scale: 4 }).notNull().default('0'),
    lineTotal: numeric('line_total', { precision: 18, scale: 4 }).notNull().default('0'),
    sortOrder: numeric('sort_order', { precision: 5, scale: 0 }).notNull().default('0'),
  },
  (t) => [index('quote_lines_quote_idx').on(t.quoteId)],
);
