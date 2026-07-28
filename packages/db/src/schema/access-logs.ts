import { index, integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations } from './organizations.js';
import { users } from './users.js';

// Global "every request" forensic log, separate from auditLogs on purpose —
// see the note in server.ts where the onResponse hook that populates this
// is registered. Short-retention/high-volume, not a business audit trail.
export const accessLogs = pgTable(
  'access_logs',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    organizationId: uuid('organization_id').references(() => organizations.id),
    userId: uuid('user_id').references(() => users.id),
    method: varchar('method', { length: 10 }).notNull(),
    path: varchar('path', { length: 500 }).notNull(),
    statusCode: integer('status_code').notNull(),
    durationMs: integer('duration_ms').notNull(),
    ip: varchar('ip', { length: 64 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('access_logs_org_idx').on(t.organizationId, t.createdAt),
    index('access_logs_user_idx').on(t.userId, t.createdAt),
  ],
);
