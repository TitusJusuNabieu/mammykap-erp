import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { accessLogs } from '@ledgera/db';

import databasePlugin from './plugins/database.js';
import redisPlugin from './plugins/redis.js';

import authRoutes from './modules/auth/auth.routes.js';
import organizationRoutes from './modules/organizations/org.routes.js';
import accountingRoutes from './modules/accounting/accounting.routes.js';
import inventoryRoutes from './modules/inventory/inventory.routes.js';
import storeRequestsRoutes from './modules/inventory/store-requests.routes.js';
import salesRoutes from './modules/sales/sales.routes.js';
import purchasesRoutes from './modules/purchases/purchases.routes.js';
import expensesRoutes from './modules/expenses/expenses.routes.js';
import payrollRoutes from './modules/payroll/payroll.routes.js';
import bankingRoutes from './modules/banking/banking.routes.js';
import reportsRoutes from './modules/reports/reports.routes.js';
import billingRoutes from './modules/billing/billing.routes.js';
import quotesRoutes from './modules/quotes/quotes.routes.js';
import dailyCloseRoutes from './modules/daily-close/daily-close.routes.js';
import auditRoutes from './modules/audit/audit.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';

import { AppError } from './utils/errors.js';
import { scheduleSubscriptionGracePeriodSweep } from './jobs/subscription-grace-period.js';
import { loadEnv } from './env.js';

// Fail fast on a bad/missing env var — before anything else runs, and in
// every environment, not just production (an unset NODE_ENV must never
// fall through to a hardcoded dev secret).
const env = loadEnv();

const PORT = env.PORT;
const HOST = env.HOST;

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'warn' : 'info',
      ...(env.NODE_ENV !== 'production'
        ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
        : {}),
    },
    trustProxy: true,
  });

  // ── Security headers ──────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc:     ["'self'"],
        scriptSrc:      ["'self'"],
        styleSrc:       ["'self'", "'unsafe-inline'"],
        imgSrc:         ["'self'", 'data:', 'https:'],
        connectSrc:     ["'self'"],
        fontSrc:        ["'self'", 'https://fonts.gstatic.com'],
        objectSrc:      ["'none'"],
        frameSrc:       ["'none'"],
        upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cors, {
    origin: env.APP_URL,
    credentials: true,
  });
  await app.register(cookie, {
    secret: env.JWT_SECRET,
  });

  // ── Rate limiting ─────────────────────────────────
  await app.register(rateLimit, {
    max: 1000,
    timeWindow: '1 minute',
    keyGenerator: (req) =>
      (req.headers['x-forwarded-for'] as string) ?? req.ip,
  });

  // ── JWT ───────────────────────────────────────────
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_ACCESS_EXPIRES_IN },
  });

  // ── Infrastructure plugins ────────────────────────
  await app.register(databasePlugin);
  await app.register(redisPlugin);

  // ── Health check ──────────────────────────────────
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  }));

  // ── Global access log ──────────────────────────────
  // "Log every action by every user" safety net: every request is recorded
  // here regardless of whether the route also writes a richer entry to
  // auditLogs via logAudit() (see utils/audit.ts) — that table stays a
  // clean business-event trail; this one is a forensic every-request log
  // (also covers pre-auth/failed requests, e.g. failed logins). Uses
  // app.adminDb (BYPASSRLS, its own connection) rather than req.db so it
  // still fires even if the request's own transaction rolled back, and
  // works before request.user exists.
  app.addHook('onResponse', async (request, reply) => {
    if (request.url === '/health') return;
    await app.adminDb.insert(accessLogs).values({
      organizationId: request.user?.orgId,
      userId: request.user?.userId,
      method: request.method,
      path: request.routeOptions?.url ?? request.url,
      statusCode: reply.statusCode,
      durationMs: Math.round(reply.elapsedTime),
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    }).catch(() => {});
  });

  // ── API routes ────────────────────────────────────
  await app.register(authRoutes,         { prefix: '/v1/auth' });
  await app.register(organizationRoutes, { prefix: '/v1/org' });
  await app.register(accountingRoutes,   { prefix: '/v1' });
  await app.register(inventoryRoutes,    { prefix: '/v1' });
  await app.register(storeRequestsRoutes, { prefix: '/v1' });
  await app.register(salesRoutes,        { prefix: '/v1' });
  await app.register(purchasesRoutes,    { prefix: '/v1' });
  await app.register(expensesRoutes,     { prefix: '/v1' });
  await app.register(payrollRoutes,      { prefix: '/v1' });
  await app.register(bankingRoutes,      { prefix: '/v1' });
  await app.register(reportsRoutes,      { prefix: '/v1/reports' });
  await app.register(billingRoutes,      { prefix: '/v1/billing' });
  await app.register(quotesRoutes,       { prefix: '/v1' });
  await app.register(dailyCloseRoutes,   { prefix: '/v1' });
  await app.register(auditRoutes,        { prefix: '/v1' });
  await app.register(adminRoutes,        { prefix: '/v1/admin' });

  // ── Global error handler ──────────────────────────
  app.setErrorHandler((error: FastifyError, _req, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
        details: error.details,
      });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.flatten().fieldErrors,
      });
    }

    // JWT errors
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return reply.status(401).send({ code: 'UNAUTHORIZED', message: error.message });
    }

    // Rate limit
    if (error.statusCode === 429) {
      return reply.status(429).send({ code: 'RATE_LIMITED', message: error.message });
    }

    app.log.error(error);
    return reply.status(500).send({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  });

  return app;
}

async function start() {
  const app = await buildServer();
  try {
    await app.listen({ port: PORT, host: HOST });
    scheduleSubscriptionGracePeriodSweep();
    app.log.info({ mode: env.DEPLOYMENT_MODE }, 'Deployment mode');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Only auto-start when run directly (tsx/node), not when imported by tests
// via buildServer() — otherwise every test run would also open a listening
// socket and schedule the grace-period cron.
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}
