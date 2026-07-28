import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// Migrations (including RLS DDL) must run as the schema-owning role, not the
// RLS-restricted `ledgera_app` runtime role that DATABASE_URL now points at.
const connectionString =
  process.env['DATABASE_MIGRATOR_URL'] ??
  process.env['DATABASE_URL'] ??
  'postgres://ledgera:ledgera_dev@localhost:5432/ledgera_dev';

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

async function main() {
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: './src/migrations' });
  console.log('Migrations complete.');
  await client.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
