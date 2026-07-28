import {
  boolean,
  date,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { currencyCodeEnum } from './enums.js';
import { organizations, branches } from './organizations.js';
import { accounts, journalEntries } from './accounting.js';
import { users } from './users.js';

export const bankAccounts = pgTable('bank_accounts', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  branchId: uuid('branch_id').references(() => branches.id),
  name: varchar('name', { length: 255 }).notNull(),
  bankName: varchar('bank_name', { length: 255 }).notNull(),
  accountNumber: varchar('account_number', { length: 100 }).notNull(),
  accountType: varchar('account_type', { length: 50 }).notNull().default('current'),
  currency: currencyCodeEnum('currency').notNull().default('SLE'),
  currentBalance: numeric('current_balance', { precision: 18, scale: 4 }).notNull().default('0'),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bankTransactions = pgTable('bank_transactions', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  bankAccountId: uuid('bank_account_id').notNull().references(() => bankAccounts.id),
  txnNumber: varchar('txn_number', { length: 50 }).notNull(),
  date: date('date').notNull(),
  type: varchar('type', { length: 30 }).notNull(),
  description: text('description').notNull(),
  amount: numeric('amount', { precision: 18, scale: 4 }).notNull(),
  balanceAfter: numeric('balance_after', { precision: 18, scale: 4 }),
  isReconciled: boolean('is_reconciled').notNull().default(false),
  journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mobileMoneWallets = pgTable('mobile_money_wallets', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  branchId: uuid('branch_id').references(() => branches.id),
  provider: varchar('provider', { length: 50 }).notNull(),
  walletNumber: varchar('wallet_number', { length: 50 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  currentBalance: numeric('current_balance', { precision: 18, scale: 4 }).notNull().default('0'),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mobileMoenyTransactions = pgTable('mobile_money_transactions', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  walletId: uuid('wallet_id').notNull().references(() => mobileMoneWallets.id),
  txnNumber: varchar('txn_number', { length: 50 }).notNull(),
  date: date('date').notNull(),
  type: varchar('type', { length: 30 }).notNull(),
  description: text('description').notNull(),
  amount: numeric('amount', { precision: 18, scale: 4 }).notNull(),
  feeAmount: numeric('fee_amount', { precision: 18, scale: 4 }).notNull().default('0'),
  netAmount: numeric('net_amount', { precision: 18, scale: 4 }).notNull(),
  externalRef: varchar('external_ref', { length: 100 }),
  isReconciled: boolean('is_reconciled').notNull().default(false),
  journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
