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
  integer,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { accountTypeEnum, currencyCodeEnum, entryStatusEnum } from './enums.js';
import { organizations } from './organizations.js';
import { branches } from './organizations.js';
import { users } from './users.js';

export const fiscalYears = pgTable('fiscal_years', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: varchar('name', { length: 100 }).notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  isClosed: boolean('is_closed').notNull().default(false),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  closedBy: uuid('closed_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fiscalPeriods = pgTable('fiscal_periods', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  fiscalYearId: uuid('fiscal_year_id').notNull().references(() => fiscalYears.id),
  name: varchar('name', { length: 50 }).notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  isClosed: boolean('is_closed').notNull().default(false),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  closedBy: uuid('closed_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    code: varchar('code', { length: 20 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    accountType: accountTypeEnum('account_type').notNull(),
    parentId: uuid('parent_id'),
    isSystem: boolean('is_system').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    description: text('description'),
    currency: currencyCodeEnum('currency'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('accounts_org_code_idx').on(t.organizationId, t.code)],
);

export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    branchId: uuid('branch_id').references(() => branches.id),
    fiscalPeriodId: uuid('fiscal_period_id').references(() => fiscalPeriods.id),
    entryNumber: varchar('entry_number', { length: 50 }).notNull(),
    date: date('date').notNull(),
    description: text('description').notNull(),
    status: entryStatusEnum('status').notNull().default('draft'),
    sourceType: varchar('source_type', { length: 50 }),
    sourceId: uuid('source_id'),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    postedBy: uuid('posted_by').references(() => users.id),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: uuid('voided_by').references(() => users.id),
    voidReason: text('void_reason'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('je_org_number_idx').on(t.organizationId, t.entryNumber),
    index('je_org_date_idx').on(t.organizationId, t.date),
    index('je_source_idx').on(t.sourceType, t.sourceId),
  ],
);

export const journalLines = pgTable(
  'journal_lines',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    journalEntryId: uuid('journal_entry_id').notNull().references(() => journalEntries.id),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    accountId: uuid('account_id').notNull().references(() => accounts.id),
    description: text('description'),
    debit: numeric('debit', { precision: 18, scale: 4 }).notNull().default('0'),
    credit: numeric('credit', { precision: 18, scale: 4 }).notNull().default('0'),
    currency: currencyCodeEnum('currency').notNull(),
    exchangeRate: numeric('exchange_rate', { precision: 14, scale: 6 }).notNull().default('1'),
    baseDebit: numeric('base_debit', { precision: 18, scale: 4 }).notNull().default('0'),
    baseCredit: numeric('base_credit', { precision: 18, scale: 4 }).notNull().default('0'),
    lineNumber: integer('line_number').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('jl_account_idx').on(t.accountId, t.journalEntryId),
    index('jl_org_idx').on(t.organizationId),
  ],
);

export const exchangeRates = pgTable(
  'exchange_rates',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    fromCurrency: currencyCodeEnum('from_currency').notNull(),
    toCurrency: currencyCodeEnum('to_currency').notNull(),
    rate: numeric('rate', { precision: 14, scale: 6 }).notNull(),
    date: date('date').notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('exchange_rates_unique_idx').on(
      t.organizationId,
      t.fromCurrency,
      t.toCurrency,
      t.date,
    ),
  ],
);
