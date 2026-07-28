import {
  boolean,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { currencyCodeEnum, stockMethodEnum, subscriptionPlanEnum, subscriptionStatusEnum } from './enums.js';

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  logoUrl: text('logo_url'),
  address: text('address'),
  phone: varchar('phone', { length: 30 }),
  email: varchar('email', { length: 255 }),
  website: varchar('website', { length: 255 }),
  tin: varchar('tin', { length: 50 }),
  registrationNumber: varchar('registration_number', { length: 100 }),
  baseCurrency: currencyCodeEnum('base_currency').notNull().default('SLE'),
  fiscalYearStart: date('fiscal_year_start').notNull().default('2024-01-01'),
  stockValuationMethod: stockMethodEnum('stock_valuation_method').notNull().default('weighted_average'),
  timezone: varchar('timezone', { length: 50 }).notNull().default('Africa/Freetown'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  plan: subscriptionPlanEnum('plan').notNull().default('starter'),
  status: subscriptionStatusEnum('status').notNull().default('trialing'),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  maxUsers: text('max_users').notNull().default('3'),
  maxBranches: text('max_branches').notNull().default('1'),
  maxProducts: text('max_products').notNull().default('500'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const branches = pgTable(
  'branches',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    name: varchar('name', { length: 255 }).notNull(),
    code: varchar('code', { length: 20 }).notNull(),
    address: text('address'),
    phone: varchar('phone', { length: 30 }),
    email: varchar('email', { length: 255 }),
    isMainBranch: boolean('is_main_branch').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('branches_org_code_idx').on(t.organizationId, t.code)],
);
