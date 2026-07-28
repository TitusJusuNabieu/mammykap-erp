import { auditLogs } from '@ledgera/db';
import type { Database } from '@ledgera/db';

type AuditAction = typeof auditLogs.$inferInsert.action;

// Narrow structural type (not the full Database) so this also accepts a
// Drizzle transaction object (`tx` inside `db.transaction(...)`), which
// exposes `.insert()` but isn't nominally typed as `Database`.
type Insertable = Pick<Database, 'insert'>;

export interface AuditEntry {
  organizationId: string;
  userId?: string | undefined;
  action: AuditAction;
  resourceType: string;
  resourceId?: string | undefined;
  resourceNumber?: string | undefined;
  changes?: unknown;
}

/**
 * Records a mutation to the audit trail. Swallows its own errors (matching
 * the existing login-event call site in auth.service.ts) — an audit-log
 * write failure must never fail the business transaction it's describing.
 */
export async function logAudit(db: Insertable, entry: AuditEntry): Promise<void> {
  await db
    .insert(auditLogs)
    .values({
      organizationId: entry.organizationId,
      userId: entry.userId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      resourceNumber: entry.resourceNumber,
      changes: entry.changes,
    })
    .catch(() => {});
}
