import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, inArray, lte, gte, desc } from 'drizzle-orm';
import { storeRequests, sales, dailyCloses } from '@ledgera/db';
import type { Database } from '@ledgera/db';
import { authenticate, requireMinRole } from '../../middleware/auth.js';
import { ValidationError, ConflictError } from '../../utils/errors.js';
import { logAudit } from '../../utils/audit.js';

const MANAGER_ROLES = new Set(['branch_manager', 'org_owner', 'accountant', 'super_admin']);

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * "Unresolved" = a store request this user requested that's due (or
 * overdue) as of businessDate and still has goods outstanding. A store
 * request's status only stays pending/partially_supplied while some
 * quantity remains unresolved — see computeStatus in store-requests.routes.ts
 * — so filtering on status here (rather than re-deriving per-line
 * remainders) is sufficient and stays in sync with that logic.
 * Future-dated layaways (expectedCollectionDate > businessDate) don't
 * block today's close, by design — otherwise the daily-close gate would
 * contradict the layaway feature itself.
 */
async function findUnresolved(
  db: Database,
  orgId: string,
  branchId: string,
  userId: string,
  businessDate: string,
) {
  return db
    .select({
      storeRequestId: storeRequests.id,
      storeRequestNumber: storeRequests.storeRequestNumber,
      status: storeRequests.status,
      expectedCollectionDate: storeRequests.expectedCollectionDate,
      saleId: sales.id,
      saleNumber: sales.saleNumber,
      saleTotal: sales.totalAmount,
    })
    .from(storeRequests)
    .innerJoin(sales, eq(sales.id, storeRequests.saleId))
    .where(and(
      eq(storeRequests.organizationId, orgId),
      eq(storeRequests.branchId, branchId),
      eq(sales.createdBy, userId),
      inArray(storeRequests.status, ['pending', 'partially_supplied']),
      lte(storeRequests.expectedCollectionDate, businessDate),
    ))
    .orderBy(storeRequests.expectedCollectionDate);
}

const dailyCloseRoutes: FastifyPluginAsync = async (app) => {

  // ── GET /daily-close/status ────────────────────────
  app.get('/daily-close/status', { preHandler: [authenticate] }, async (req) => {
    const { orgId, userId, role, branchId: userBranch } = req.user;
    const query = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      branchId: z.string().uuid().optional(),
      userId: z.string().uuid().optional(),
    }).parse(req.query);

    const date = query.date ?? todayStr();
    const branchId = query.branchId ?? userBranch;
    if (!branchId) throw new ValidationError('Branch ID is required');

    const targetUserId = (query.userId && MANAGER_ROLES.has(role)) ? query.userId : userId;

    const [unresolved, [existingClose]] = await Promise.all([
      findUnresolved(req.db, orgId, branchId, targetUserId, date),
      req.db.select().from(dailyCloses).where(and(
        eq(dailyCloses.organizationId, orgId),
        eq(dailyCloses.branchId, branchId),
        eq(dailyCloses.userId, targetUserId),
        eq(dailyCloses.businessDate, date),
      )),
    ]);

    return {
      data: {
        businessDate: date,
        branchId,
        userId: targetUserId,
        alreadyClosed: !!existingClose,
        closedAt: existingClose?.closedAt,
        canClose: unresolved.length === 0 && !existingClose,
        unresolvedCount: unresolved.length,
        unresolvedRequests: unresolved,
      },
    };
  });

  // ── POST /daily-close ───────────────────────────────
  // Self-service only — no userId override on the write path (a manager
  // can inspect someone else's status via the query above, but cannot
  // close someone else's day for them).
  app.post('/daily-close', { preHandler: [authenticate, requireMinRole('cashier')] }, async (req, reply) => {
    const { orgId, userId, branchId: userBranch } = req.user;
    const body = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(todayStr),
      branchId: z.string().uuid().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const branchId = body.branchId ?? userBranch;
    if (!branchId) throw new ValidationError('Branch ID is required');

    // Recompute server-side — never trust a prior GET /status response.
    const unresolved = await findUnresolved(req.db, orgId, branchId, userId, body.date);
    if (unresolved.length > 0) {
      throw new ConflictError(
        `Cannot close: ${unresolved.length} sale(s) still awaiting goods supply`,
      );
    }

    const salesToday = await req.db.select().from(sales).where(and(
      eq(sales.organizationId, orgId),
      eq(sales.branchId, branchId),
      eq(sales.createdBy, userId),
      eq(sales.date, body.date),
    ));
    const salesTotal = salesToday.reduce((s, r) => s + Number(r.totalAmount), 0);

    let close;
    try {
      [close] = await req.db.insert(dailyCloses).values({
        organizationId: orgId,
        branchId,
        userId,
        businessDate: body.date,
        salesCount: salesToday.length,
        salesTotal: String(salesTotal),
        notes: body.notes,
        closedBy: userId,
      }).returning();
    } catch {
      throw new ConflictError('Already closed for this date');
    }
    if (!close) throw new Error('Failed to create daily close');

    await logAudit(req.db, {
      organizationId: orgId,
      userId,
      action: 'create',
      resourceType: 'daily_close',
      resourceId: close.id,
      resourceNumber: `${branchId}:${body.date}`,
    });

    return reply.status(201).send({ data: close });
  });

  // ── GET /daily-close — oversight listing ────────────
  app.get('/daily-close', { preHandler: [authenticate, requireMinRole('branch_manager')] }, async (req) => {
    const { orgId } = req.user;
    const query = z.object({
      branchId: z.string().uuid().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      limit: z.coerce.number().max(200).default(50),
    }).parse(req.query);

    const conditions = [eq(dailyCloses.organizationId, orgId)];
    if (query.branchId) conditions.push(eq(dailyCloses.branchId, query.branchId));
    if (query.from) conditions.push(gte(dailyCloses.businessDate, query.from));
    if (query.to) conditions.push(lte(dailyCloses.businessDate, query.to));

    const rows = await req.db.select().from(dailyCloses)
      .where(and(...conditions))
      .orderBy(desc(dailyCloses.businessDate))
      .limit(query.limit);

    return { data: rows, meta: { count: rows.length } };
  });
};

export default dailyCloseRoutes;
