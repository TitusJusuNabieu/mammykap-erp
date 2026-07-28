import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

const connectionString =
  process.env['DATABASE_URL'] ?? 'postgres://ledgera:ledgera_dev@localhost:5432/ledgera_dev';

// Migrations run as the schema-owning role (DATABASE_MIGRATOR_URL), separate
// from the least-privilege runtime roles below.
const migrationConnectionString =
  process.env['DATABASE_MIGRATOR_URL'] ?? connectionString;

// For migrations & seeding (single connection)
export const migrationClient = postgres(migrationConnectionString, { max: 1 });

// For the application pool — runs as `ledgera_app`, which is subject to
// Postgres RLS. Exported (not just wrapped in `db`) so per-request code can
// `.reserve()` a connection to open a tenant-scoped transaction on it.
export const queryClient = postgres(connectionString, {
  max: 20,
  idle_timeout: 30,
  connect_timeout: 10,
});

export const db = drizzle(queryClient, { schema, logger: process.env['NODE_ENV'] === 'development' });

// Admin pool — runs as `ledgera_bypass` (BYPASSRLS). Used only for
// legitimately cross-tenant queries: pre-auth lookups (login/register/
// refresh), webhook handlers that write to an arbitrary org, and
// super_admin cross-org tooling. Never used for ordinary per-tenant request
// handling — RLS must stay meaningful for everything else.
const adminConnectionString = process.env['DATABASE_ADMIN_URL'] ?? connectionString;
const adminQueryClient = postgres(adminConnectionString, {
  max: 5,
  idle_timeout: 30,
  connect_timeout: 10,
});
export const adminDb = drizzle(adminQueryClient, { schema, logger: process.env['NODE_ENV'] === 'development' });

export type Database = typeof db;

/** A single reserved (non-pooled) connection — used to open per-request tenant transactions. */
export type ReservedConnection = Awaited<ReturnType<typeof queryClient.reserve>>;
