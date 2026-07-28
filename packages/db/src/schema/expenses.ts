import {
  boolean,
  date,
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
import { expenseStatusEnum, paymentMethodEnum } from './enums.js';
import { organizations, branches } from './organizations.js';
import { accounts, fiscalPeriods, journalEntries } from './accounting.js';
import { users } from './users.js';

export const expenseCategories = pgTable('expense_categories', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: varchar('name', { length: 255 }).notNull(),
  accountId: uuid('account_id').references(() => accounts.id),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    branchId: uuid('branch_id').notNull().references(() => branches.id),
    expenseNumber: varchar('expense_number', { length: 50 }).notNull(),
    date: date('date').notNull(),
    categoryId: uuid('category_id').references(() => expenseCategories.id),
    fiscalPeriodId: uuid('fiscal_period_id').references(() => fiscalPeriods.id),
    description: text('description').notNull(),
    amount: numeric('amount', { precision: 18, scale: 4 }).notNull(),
    taxAmount: numeric('tax_amount', { precision: 18, scale: 4 }).notNull().default('0'),
    totalAmount: numeric('total_amount', { precision: 18, scale: 4 }).notNull(),
    paymentMethod: paymentMethodEnum('payment_method').notNull().default('cash'),
    accountId: uuid('account_id').references(() => accounts.id),
    status: expenseStatusEnum('status').notNull().default('draft'),
    attachmentUrl: text('attachment_url'),
    isRecurring: boolean('is_recurring').notNull().default(false),
    recurrenceRule: jsonb('recurrence_rule'),
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('expenses_org_number_idx').on(t.organizationId, t.expenseNumber)],
);

export const pettyCashFunds = pgTable('petty_cash_funds', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  branchId: uuid('branch_id').notNull().references(() => branches.id),
  name: varchar('name', { length: 255 }).notNull(),
  custodianId: uuid('custodian_id').references(() => users.id),
  floatAmount: numeric('float_amount', { precision: 18, scale: 4 }).notNull().default('0'),
  currentBalance: numeric('current_balance', { precision: 18, scale: 4 }).notNull().default('0'),
  accountId: uuid('account_id').references(() => accounts.id),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pettyCashTransactions = pgTable('petty_cash_transactions', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  fundId: uuid('fund_id').notNull().references(() => pettyCashFunds.id),
  txnNumber: varchar('txn_number', { length: 50 }).notNull(),
  date: date('date').notNull(),
  type: varchar('type', { length: 20 }).notNull(),
  amount: numeric('amount', { precision: 18, scale: 4 }).notNull(),
  description: text('description').notNull(),
  categoryId: uuid('category_id').references(() => expenseCategories.id),
  attachmentUrl: text('attachment_url'),
  journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
