import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { subscriptions, branches, products, organizationUsers } from '@ledgera/db';
import { PlanLimitError, SubscriptionInactiveError } from '../utils/errors.js';

const EXEMPT_PREFIXES = ['/v1/billing', '/v1/auth'];
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const BLOCKED_STATUSES = new Set(['cancelled', 'paused']);

/**
 * Blocks writes once a SaaS org's subscription has lapsed. No-ops entirely
 * in `dedicated` deployments — those are billed by contract outside the
 * app, not gated by Monime subscription status. Reads status from the JWT
 * (set at login/refresh — see auth.routes.ts), so this costs zero extra
 * queries per request; the tradeoff is up to one token lifetime (15m) of
 * staleness after a webhook-driven status change, which is acceptable for
 * a billing gate.
 */
export async function checkSubscriptionAccess(request: FastifyRequest): Promise<void> {
  if (process.env['DEPLOYMENT_MODE'] === 'dedicated') return;
  if (!WRITE_METHODS.has(request.method)) return;
  if (EXEMPT_PREFIXES.some((p) => request.url.startsWith(p))) return;

  if (BLOCKED_STATUSES.has(request.user.subscriptionStatus)) {
    throw new SubscriptionInactiveError(request.user.subscriptionStatus);
  }
  // 'past_due' is intentionally allowed through here — the grace period
  // before hard blocking is enforced by a scheduled job transitioning
  // past_due -> cancelled after N days (see billing.routes.ts), not by
  // request-time math (the JWT doesn't carry currentPeriodEnd).
}

type LimitedResource = 'users' | 'branches' | 'products';

const LIMIT_COLUMN = {
  users: 'maxUsers',
  branches: 'maxBranches',
  products: 'maxProducts',
} as const satisfies Record<LimitedResource, keyof typeof subscriptions.$inferSelect>;

async function countUsage(
  db: FastifyRequest['db'],
  resource: LimitedResource,
  orgId: string,
): Promise<number> {
  const table = resource === 'users' ? organizationUsers : resource === 'branches' ? branches : products;
  const [row] = await db
    .select({ count: sql<string>`count(*)` })
    .from(table)
    .where(eq(table.organizationId, orgId));
  return Number(row?.count ?? 0);
}

/**
 * Opt-in preHandler (same factory pattern as requireMinRole) — wire it only
 * on the routes that actually consume a plan seat. No-ops in `dedicated`
 * mode. `subscriptions.maxUsers/maxBranches/maxProducts` are `text`
 * columns (pre-existing schema quirk), hence the Number() parse.
 */
export function enforcePlanLimit(resource: LimitedResource) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (process.env['DEPLOYMENT_MODE'] === 'dedicated') return;

    const { orgId, plan } = request.user;
    const [sub] = await request.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, orgId))
      .limit(1);

    const max = Number(sub?.[LIMIT_COLUMN[resource]] ?? Infinity);
    const current = await countUsage(request.db, resource, orgId);

    if (current >= max) throw new PlanLimitError(resource, current, max, plan);
  };
}
