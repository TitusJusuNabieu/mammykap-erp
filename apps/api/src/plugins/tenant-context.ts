import type { FastifyRequest } from 'fastify';
import { drizzle } from 'drizzle-orm/postgres-js';
import { queryClient, schema, type Database, type ReservedConnection } from '@ledgera/db';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by openTenantTransaction — the reserved connection backing req.db. */
    _reservedSql?: ReservedConnection;
    _txFinalized?: boolean;
  }
}

/**
 * Opens a Postgres transaction on a reserved (single, non-pooled)
 * connection and sets the `app.current_org_id` session variable on it, so
 * every RLS policy (packages/db/src/migrations/0003_row_level_security.sql)
 * scopes reads/writes to this org for the rest of the request. The
 * transaction-bound Drizzle instance is assigned to `request.db`.
 */
let savepointCounter = 0;

/**
 * drizzle-orm's postgres-js adapter calls `client.begin(fn)` to implement
 * `db.transaction()`, and `client.savepoint(fn)` for a nested
 * `tx.transaction()`. postgres-js only attaches both methods (along with
 * `.options`, see below) to the top-level pool client — `.reserve()`
 * returns a reduced Sql callable without them. Since a reserved connection
 * is already wrapped in our own outer `BEGIN` (below), the correct
 * semantics for a "nested transaction" here is a SAVEPOINT, not a second
 * real `BEGIN` (Postgres has no true nested transactions anyway).
 */
function attachTransactionShim(reserved: ReservedConnection): void {
  const savepointScope = async <T>(fn: (client: ReservedConnection) => Promise<T>): Promise<T> => {
    const name = `tx_${savepointCounter++}`;
    await reserved.unsafe(`SAVEPOINT ${name}`);
    try {
      const result = await fn(reserved);
      await reserved.unsafe(`RELEASE SAVEPOINT ${name}`);
      return result;
    } catch (err) {
      await reserved.unsafe(`ROLLBACK TO SAVEPOINT ${name}`);
      throw err;
    }
  };

  Object.assign(reserved, {
    begin: savepointScope,
    savepoint: savepointScope,
  });
}

export async function openTenantTransaction(request: FastifyRequest, orgId: string): Promise<void> {
  const reserved = await queryClient.reserve();
  // postgres-js only attaches `.options` (parsers/serializers config) to the
  // top-level pool client — reserve() returns a reduced Sql callable without
  // it. drizzle-orm's postgres-js adapter mutates `client.options.parsers`
  // at construction time, so it throws on a bare reserved connection unless
  // we backfill the same shared options object (safe: it's the same pool's
  // config, and the mutation is idempotent).
  (reserved as unknown as { options: typeof queryClient.options }).options = queryClient.options;
  attachTransactionShim(reserved);
  await reserved`BEGIN`;
  await reserved`SELECT set_config('app.current_org_id', ${orgId}, true)`;
  request._reservedSql = reserved;
  request._txFinalized = false;
  request.db = drizzle(reserved, { schema }) as Database;
}

/** Commits/rolls back the reserved connection's transaction and releases it. */
export async function finalizeTenantTransaction(
  request: FastifyRequest,
  outcome: 'commit' | 'rollback',
): Promise<void> {
  const reserved = request._reservedSql;
  if (!reserved || request._txFinalized) return;
  request._txFinalized = true;
  try {
    await reserved.unsafe(outcome === 'commit' ? 'COMMIT' : 'ROLLBACK');
  } finally {
    reserved.release();
  }
}
