import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { desc, eq, ilike } from 'drizzle-orm';
import { organizations, subscriptions } from '@ledgera/db';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { NotFoundError } from '../../utils/errors.js';

/**
 * Internal cross-org tooling for super_admin only. Uses app.adminDb
 * (BYPASSRLS) deliberately — this is the one legitimate place RLS should
 * be bypassed wholesale rather than scoped to a single org via
 * openTenantTransaction, because the whole point is cross-org visibility.
 */
const adminRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /admin/organizations ─────────────────────────
  app.get(
    '/organizations',
    { preHandler: [authenticate, requireRole('super_admin')] },
    async (req) => {
      const { search, limit = '50', offset = '0' } = z.object({
        search: z.string().optional(),
        limit: z.string().optional(),
        offset: z.string().optional(),
      }).parse(req.query);

      const rows = await app.adminDb
        .select({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          baseCurrency: organizations.baseCurrency,
          isActive: organizations.isActive,
          createdAt: organizations.createdAt,
          plan: subscriptions.plan,
          status: subscriptions.status,
        })
        .from(organizations)
        .leftJoin(subscriptions, eq(subscriptions.organizationId, organizations.id))
        .where(search ? ilike(organizations.name, `%${search}%`) : undefined)
        .orderBy(desc(organizations.createdAt))
        .limit(Number(limit))
        .offset(Number(offset));

      return { data: rows };
    },
  );

  // ── GET /admin/organizations/:id ──────────────────────
  app.get(
    '/organizations/:id',
    { preHandler: [authenticate, requireRole('super_admin')] },
    async (req) => {
      const { id } = req.params as { id: string };

      const [org] = await app.adminDb
        .select()
        .from(organizations)
        .where(eq(organizations.id, id))
        .limit(1);

      if (!org) throw new NotFoundError('Organization');

      const [sub] = await app.adminDb
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.organizationId, id))
        .limit(1);

      return { data: { ...org, subscription: sub ?? null } };
    },
  );
};

export default adminRoutes;
