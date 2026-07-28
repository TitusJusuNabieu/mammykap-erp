import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, gte, lte, asc } from 'drizzle-orm';
import { accounts, journalEntries, journalLines, fiscalPeriods, fiscalYears } from '@ledgera/db';
import { authenticate, requireMinRole } from '../../middleware/auth.js';
import { AccountingEngine } from './accounting.engine.js';
import { NotFoundError } from '../../utils/errors.js';

const accountingRoutes: FastifyPluginAsync = async (app) => {
  // ── Chart of Accounts ────────────────────────────

  app.get('/accounts', { preHandler: [authenticate] }, async (req) => {
    const { orgId } = req.user;
    const rows = await req.db
      .select()
      .from(accounts)
      .where(eq(accounts.organizationId, orgId))
      .orderBy(asc(accounts.code));

    return { data: buildAccountTree(rows) };
  });

  app.post('/accounts', { preHandler: [authenticate, requireMinRole('accountant')] }, async (req, reply) => {
    const body = z.object({
      code: z.string().min(1).max(20),
      name: z.string().min(1).max(255),
      accountType: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
      parentId: z.string().uuid().optional(),
      description: z.string().optional(),
    }).parse(req.body);

    const { orgId } = req.user;
    const [account] = await req.db
      .insert(accounts)
      .values({ ...body, organizationId: orgId })
      .returning();

    return reply.status(201).send({ data: account });
  });

  app.get('/accounts/:id', { preHandler: [authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId } = req.user;

    const [account] = await req.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.organizationId, orgId)));

    if (!account) throw new NotFoundError('Account');
    return { data: account };
  });

  app.patch('/accounts/:id', { preHandler: [authenticate, requireMinRole('accountant')] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId } = req.user;
    const body = z.object({
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      isActive: z.boolean().optional(),
    }).parse(req.body);

    const [updated] = await req.db
      .update(accounts)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(accounts.id, id), eq(accounts.organizationId, orgId)))
      .returning();

    if (!updated) throw new NotFoundError('Account');
    return { data: updated };
  });

  // ── Journal Entries ──────────────────────────────

  app.get('/journal', { preHandler: [authenticate, requireMinRole('accountant')] }, async (req) => {
    const { orgId } = req.user;
    const query = z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      status: z.enum(['draft', 'posted', 'voided']).optional(),
      limit: z.coerce.number().max(100).default(50),
    }).parse(req.query);

    const conditions = [eq(journalEntries.organizationId, orgId)];
    if (query.from) conditions.push(gte(journalEntries.date, query.from));
    if (query.to)   conditions.push(lte(journalEntries.date, query.to));
    if (query.status) conditions.push(eq(journalEntries.status, query.status));

    const rows = await req.db
      .select()
      .from(journalEntries)
      .where(and(...conditions))
      .orderBy(desc(journalEntries.date), desc(journalEntries.createdAt))
      .limit(query.limit);

    return { data: rows, meta: { count: rows.length } };
  });

  app.post('/journal', { preHandler: [authenticate, requireMinRole('accountant')] }, async (req, reply) => {
    const body = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      description: z.string().min(1),
      branchId: z.string().uuid().optional(),
      lines: z.array(z.object({
        accountId: z.string().uuid(),
        description: z.string().optional(),
        debit: z.number().min(0),
        credit: z.number().min(0),
      })).min(2),
    }).parse(req.body);

    const { orgId, userId } = req.user;
    const engine = new AccountingEngine(req.db);
    const entry = await engine.postJournal({
      organizationId: orgId,
      branchId: body.branchId,
      date: body.date,
      description: body.description,
      sourceType: 'manual',
      sourceId: userId,
      lines: body.lines,
      createdBy: userId,
    });

    return reply.status(201).send({ data: entry });
  });

  app.get('/journal/:id', { preHandler: [authenticate, requireMinRole('accountant')] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId } = req.user;

    const [entry] = await req.db
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.id, id), eq(journalEntries.organizationId, orgId)));

    if (!entry) throw new NotFoundError('Journal entry');

    const lines = await req.db
      .select()
      .from(journalLines)
      .where(eq(journalLines.journalEntryId, id))
      .orderBy(asc(journalLines.lineNumber));

    const totalDR = lines.reduce((s, l) => s + Number(l.debit), 0);
    const totalCR = lines.reduce((s, l) => s + Number(l.credit), 0);

    return { data: { ...entry, lines, totalDebit: totalDR, totalCredit: totalCR } };
  });

  app.post('/journal/:id/void', { preHandler: [authenticate, requireMinRole('accountant')] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId, userId } = req.user;
    const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);

    const engine = new AccountingEngine(req.db);
    await engine.voidJournal(id, orgId, reason, userId);
    return { data: { success: true } };
  });

  // ── Fiscal Periods ───────────────────────────────

  app.get('/fiscal-periods', { preHandler: [authenticate] }, async (req) => {
    const { orgId } = req.user;
    const rows = await req.db
      .select()
      .from(fiscalPeriods)
      .where(eq(fiscalPeriods.organizationId, orgId))
      .orderBy(asc(fiscalPeriods.startDate));

    return { data: rows };
  });

  app.get('/fiscal-years', { preHandler: [authenticate] }, async (req) => {
    const { orgId } = req.user;
    const rows = await req.db
      .select()
      .from(fiscalYears)
      .where(eq(fiscalYears.organizationId, orgId))
      .orderBy(desc(fiscalYears.startDate));

    return { data: rows };
  });
};

// Build nested account tree from flat list
function buildAccountTree(rows: Array<{ id: string; parentId: string | null; [key: string]: unknown }>) {
  const map = new Map(rows.map((r) => [r.id, { ...r, children: [] as typeof rows }]));
  const roots: typeof rows = [];
  for (const row of map.values()) {
    if (row.parentId && map.has(row.parentId)) {
      (map.get(row.parentId)!.children as typeof rows).push(row as (typeof rows)[0]);
    } else {
      roots.push(row as (typeof rows)[0]);
    }
  }
  return roots;
}

export default accountingRoutes;
