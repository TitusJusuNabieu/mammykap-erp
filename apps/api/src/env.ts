import { z } from 'zod';

/**
 * Validated at process startup (see server.ts) so a missing/malformed env
 * var fails fast with a clear message, instead of surfacing as an
 * `undefined` deep inside some handler at first use.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),

  // Three roles — see scripts/postgres-init.sql and packages/db/src/client.ts
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (ledgera_app, RLS-restricted)'),
  DATABASE_ADMIN_URL: z.string().min(1, 'DATABASE_ADMIN_URL is required (ledgera_bypass, BYPASSRLS)'),
  DATABASE_MIGRATOR_URL: z.string().optional(),

  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be a strong random value — see .env.example')
    .refine((v) => v !== 'CHANGE_ME_IN_PRODUCTION_USE_RS256_IN_PROD', {
      message: 'JWT_SECRET is still the placeholder value from .env.example',
    }),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),

  APP_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:3001'),

  DEPLOYMENT_MODE: z.enum(['saas', 'dedicated']).default('saas'),

  MONIME_API_KEY: z.string().optional(),
  MONIME_WEBHOOK_SECRET: z.string().optional(),
  MONIME_ENV: z.enum(['sandbox', 'production']).default('sandbox'),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  LOCAL_STORAGE_PATH: z.string().default('./uploads'),
  AWS_REGION: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\n\nSee apps/api/.env.example.`);
  }
  return result.data;
}
