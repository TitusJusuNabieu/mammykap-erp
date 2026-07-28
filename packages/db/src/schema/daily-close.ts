import {
  date,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations, branches } from './organizations.js';
import { users } from './users.js';

// One row per user+branch+day, created only on a successful close. Its mere
// existence IS the "balanced" record — the enforcement logic (does this
// user have any unresolved store requests due by this date) lives in the
// daily-close route, not in this table.
export const dailyCloses = pgTable(
  'daily_closes',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    branchId: uuid('branch_id').notNull().references(() => branches.id),
    userId: uuid('user_id').notNull().references(() => users.id),
    businessDate: date('business_date').notNull(),
    salesCount: integer('sales_count').notNull().default(0),
    salesTotal: numeric('sales_total', { precision: 18, scale: 4 }).notNull().default('0'),
    notes: text('notes'),
    closedBy: uuid('closed_by').notNull().references(() => users.id),
    closedAt: timestamp('closed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('daily_closes_unique_idx').on(t.organizationId, t.branchId, t.userId, t.businessDate),
  ],
);
