import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { expenses, expenseCategories, accounts } from '@ledgera/db';
import { authenticate, requireMinRole } from '../../middleware/auth.js';
import { NotFoundError, ForbiddenError } from '../../utils/errors.js';
import { AccountingEngine } from '../accounting/accounting.engine.js';
import { nextSequence } from '../../utils/sequence.js';
import { logAudit } from '../../utils/audit.js';

const expensesRoutes: FastifyPluginAsync = async (app) => {

  // ── Categories ────────────────────────────────────
  app.get('/expense-categories', { preHandler: [authenticate] }, async (req) => {
    const { orgId } = req.user;
    const rows = await req.db.select().from(expenseCategories)
      .where(eq(expenseCategories.organizationId, orgId))
      .orderBy(expenseCategories.name);
    return { data: rows };
  });

  app.post('/expense-categories', { preHandler: [authenticate, requireMinRole('accountant')] }, async (req, reply) => {
    const { orgId, userId } = req.user;
    const body = z.object({
      name: z.string().min(1).max(255),
      accountId: z.string().uuid().optional(),
    }).parse(req.body);

    const [cat] = await req.db.insert(expenseCategories)
      .values({ ...body, organizationId: orgId })
      .returning();

    await logAudit(req.db, {
      organizationId: orgId,
      userId,
      action: 'create',
      resourceType: 'expense_category',
      resourceId: cat!.id,
      resourceNumber: cat!.name,
    });

    return reply.status(201).send({ data: cat });
  });

  // ── Expenses ──────────────────────────────────────
  app.get('/expenses', { preHandler: [authenticate] }, async (req) => {
    const { orgId, role, branchId: userBranch } = req.user;
    const query = z.object({
      status: z.enum(['draft','submitted','approved','rejected','paid']).optional(),
      branch_id: z.string().uuid().optional(),
      limit: z.coerce.number().max(200).default(50),
    }).parse(req.query);

    const conditions = [eq(expenses.organizationId, orgId)];
    if (query.status) conditions.push(eq(expenses.status, query.status));
    if (role === 'branch_manager' && userBranch) {
      conditions.push(eq(expenses.branchId, userBranch));
    } else if (query.branch_id) {
      conditions.push(eq(expenses.branchId, query.branch_id));
    }

    const rows = await req.db.select().from(expenses)
      .where(and(...conditions))
      .orderBy(desc(expenses.date))
      .limit(query.limit);

    return { data: rows };
  });

  app.post('/expenses', { preHandler: [authenticate, requireMinRole('cashier')] }, async (req, reply) => {
    const { orgId, userId, branchId: userBranchId } = req.user;
    const body = z.object({
      branchId: z.string().uuid().optional(),
      date: z.string().default(() => new Date().toISOString().slice(0, 10)),
      categoryId: z.string().uuid().optional(),
      description: z.string().min(1),
      amount: z.number().positive(),
      taxAmount: z.number().min(0).default(0),
      paymentMethod: z.enum(['cash','bank','orange_money','afrimoney','qmoney','cheque']).default('cash'),
      accountId: z.string().uuid().optional(),
      attachmentUrl: z.string().optional(),
    }).parse(req.body);

    const branchId = body.branchId ?? userBranchId;
    const expenseNumber = await nextSequence(req.db, orgId, 'expense', 'EXP', 6);

    const [expense] = await req.db.insert(expenses).values({
      ...body,
      organizationId: orgId,
      branchId: branchId!,
      expenseNumber,
      amount: String(body.amount),
      taxAmount: String(body.taxAmount),
      totalAmount: String(body.amount + body.taxAmount),
      status: 'draft',
      createdBy: userId,
    }).returning();

    await logAudit(req.db, {
      organizationId: orgId,
      userId,
      action: 'create',
      resourceType: 'expense',
      resourceId: expense!.id,
      resourceNumber: expense!.expenseNumber,
    });

    return reply.status(201).send({ data: expense });
  });

  app.get('/expenses/:id', { preHandler: [authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId } = req.user;
    const [expense] = await req.db.select().from(expenses)
      .where(and(eq(expenses.id, id), eq(expenses.organizationId, orgId)));
    if (!expense) throw new NotFoundError('Expense');
    return { data: expense };
  });

  app.post('/expenses/:id/submit', { preHandler: [authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId, userId } = req.user;
    const [expense] = await req.db.select().from(expenses)
      .where(and(eq(expenses.id, id), eq(expenses.organizationId, orgId)));
    if (!expense) throw new NotFoundError('Expense');
    if (expense.createdBy !== userId) throw new ForbiddenError('Can only submit own expenses');

    const [updated] = await req.db.update(expenses)
      .set({ status: 'submitted', updatedAt: new Date() })
      .where(eq(expenses.id, id))
      .returning();

    await logAudit(req.db, {
      organizationId: orgId,
      userId,
      action: 'update',
      resourceType: 'expense',
      resourceId: id,
      resourceNumber: expense.expenseNumber,
    });

    return { data: updated };
  });

  app.post('/expenses/:id/approve', { preHandler: [authenticate, requireMinRole('branch_manager')] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId, userId } = req.user;

    const [expense] = await req.db.select().from(expenses)
      .where(and(eq(expenses.id, id), eq(expenses.organizationId, orgId)));
    if (!expense) throw new NotFoundError('Expense');

    // Post journal entry on approval
    const accRows = await req.db.select().from(accounts).where(eq(accounts.organizationId, orgId));
    const accByCode = new Map(accRows.map((a) => [a.code, a]));
    const cashAccount = accByCode.get('1001');

    // Get the expense category's account or fallback
    let expAccount = accByCode.get('5800'); // Miscellaneous
    if (expense.categoryId) {
      const [cat] = await req.db.select().from(expenseCategories)
        .where(eq(expenseCategories.id, expense.categoryId));
      if (cat?.accountId) {
        expAccount = accRows.find((a) => a.id === cat.accountId) ?? expAccount;
      }
    }

    if (expAccount && cashAccount) {
      const accounting = new AccountingEngine(req.db);
      const je = await accounting.postJournal({
        organizationId: orgId,
        branchId: expense.branchId,
        date: expense.date,
        description: `Expense ${expense.expenseNumber}: ${expense.description}`,
        sourceType: 'expense',
        sourceId: expense.id,
        lines: [
          { accountId: expAccount.id,  debit: Number(expense.totalAmount), credit: 0 },
          { accountId: cashAccount.id, debit: 0, credit: Number(expense.totalAmount) },
        ],
        createdBy: userId,
      });

      await req.db.update(expenses)
        .set({
          status: 'approved',
          approvedBy: userId,
          approvedAt: new Date(),
          journalEntryId: je.id,
          updatedAt: new Date(),
        })
        .where(eq(expenses.id, id));
    } else {
      await req.db.update(expenses)
        .set({ status: 'approved', approvedBy: userId, approvedAt: new Date(), updatedAt: new Date() })
        .where(eq(expenses.id, id));
    }

    await logAudit(req.db, {
      organizationId: orgId,
      userId,
      action: 'approve',
      resourceType: 'expense',
      resourceId: id,
      resourceNumber: expense.expenseNumber,
    });

    return { data: { success: true } };
  });

  app.post('/expenses/:id/reject', { preHandler: [authenticate, requireMinRole('branch_manager')] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId, userId } = req.user;
    const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);

    const [updated] = await req.db.update(expenses)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(and(eq(expenses.id, id), eq(expenses.organizationId, orgId)))
      .returning();

    await logAudit(req.db, {
      organizationId: orgId,
      userId,
      action: 'reject',
      resourceType: 'expense',
      resourceId: id,
      resourceNumber: updated?.expenseNumber,
      changes: { reason },
    });

    return { data: { success: true, reason } };
  });
};

export default expensesRoutes;
