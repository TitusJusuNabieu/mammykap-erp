import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { desc, eq, and, gte, lte, like } from 'drizzle-orm';
import { auditLogs, users } from '@ledgera/db';
import { authenticate, requireMinRole } from '../../middleware/auth.js';

const auditRoutes: FastifyPluginAsync = async (app) => {

  // ── GET /audit-logs ──────────────────────────────
  app.get('/audit-logs', { preHandler: [authenticate, requireMinRole('accountant')] }, async (req) => {
    const { orgId: organizationId } = req.user;

    const { page = '1', limit = '50', action, resourceType, from, to, search } = z.object({
      page:         z.string().optional(),
      limit:        z.string().optional(),
      action:       z.string().optional(),
      resourceType: z.string().optional(),
      from:         z.string().optional(),
      to:           z.string().optional(),
      search:       z.string().optional(),
    }).parse(req.query);

    const pageNum  = Math.max(1, Number(page));
    const pageSize = Math.min(100, Math.max(10, Number(limit)));
    const offset   = (pageNum - 1) * pageSize;

    const conditions = [eq(auditLogs.organizationId, organizationId)];

    if (action)       conditions.push(eq(auditLogs.action, action as never));
    if (resourceType) conditions.push(eq(auditLogs.resourceType, resourceType));
    if (from)         conditions.push(gte(auditLogs.createdAt, new Date(from)));
    if (to)           conditions.push(lte(auditLogs.createdAt, new Date(to)));
    if (search)       conditions.push(like(auditLogs.resourceNumber, `%${search}%`));

    const logs = await req.db
      .select({
        id:             auditLogs.id,
        action:         auditLogs.action,
        resourceType:   auditLogs.resourceType,
        resourceId:     auditLogs.resourceId,
        resourceNumber: auditLogs.resourceNumber,
        changes:        auditLogs.changes,
        metadata:       auditLogs.metadata,
        createdAt:      auditLogs.createdAt,
        userName:       users.fullName,
        userEmail:      users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset(offset);

    return { data: logs, page: pageNum, limit: pageSize };
  });
};

export default auditRoutes;
