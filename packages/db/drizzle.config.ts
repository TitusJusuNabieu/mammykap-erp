import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './src/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env['DATABASE_MIGRATOR_URL'] ??
      process.env['DATABASE_URL'] ??
      'postgres://ledgera:ledgera_dev@localhost:5432/ledgera_dev',
  },
  verbose: true,
  strict: true,
});
