// Runs before any test file's imports resolve (vitest `setupFiles`) — must
// set these before `@ledgera/db`'s client.ts (which reads process.env at
// module-load time to build its connection pools) is ever imported.
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] = 'postgres://ledgera_app:ledgera_app_dev@localhost:5432/ledgera_test';
process.env['DATABASE_ADMIN_URL'] = 'postgres://ledgera_bypass:ledgera_bypass_dev@localhost:5432/ledgera_test';
process.env['DATABASE_MIGRATOR_URL'] = 'postgres://ledgera:ledgera_dev@localhost:5432/ledgera_test';
process.env['REDIS_URL'] = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
process.env['JWT_SECRET'] = 'test-jwt-secret-do-not-use-in-production-0000000000';
// Dedicated mode no-ops the subscription-status gate entirely (see
// middleware/subscription.ts) — tests don't need to fabricate a realistic
// subscriptions row just to get past it.
process.env['DEPLOYMENT_MODE'] = 'dedicated';
