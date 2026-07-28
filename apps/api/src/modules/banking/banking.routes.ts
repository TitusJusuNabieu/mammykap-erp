import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  bankAccounts,
  bankTransactions,
  mobileMoneWallets,
  mobileMoenyTransactions,
  accounts,
} from '@ledgera/db';
import { authenticate, requireMinRole } from '../../middleware/auth.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { AccountingEngine } from '../accounting/accounting.engine.js';
import { nextSequence } from '../../utils/sequence.js';
import { logAudit } from '../../utils/audit.js';

const bankingRoutes: FastifyPluginAsync = async (app) => {

  // ═══════════════════════════════════════
  // BANK ACCOUNTS
  // ═══════════════════════════════════════

  app.get('/bank-accounts', { preHandler: [authenticate] }, async (req) => {
    const { orgId } = req.user;
    const rows = await req.db.select().from(bankAccounts)
      .where(eq(bankAccounts.organizationId, orgId))
      .orderBy(bankAccounts.name);
    return { data: rows };
  });

  app.post('/bank-accounts', { preHandler: [authenticate, requireMinRole('accountant')] }, async (req, reply) => {
    const { orgId, userId, branchId: userBranchId } = req.user;
    const body = z.object({
      name:           z.string().min(1).max(255),
      bankName:       z.string().min(1).max(255),
      accountNumber:  z.string().min(1).max(100),
      accountType:    z.enum(['current','savings','fixed_deposit']).default('current'),
      currency:       z.enum(['SLE','USD','EUR','GBP']).default('SLE'),
      accountId:      z.string().uuid(),
      branchId:       z.string().uuid().optional(),
      openingBalance: z.number().min(0).default(0),
    }).parse(req.body);

    const [bank] = await req.db.insert(bankAccounts).values({
      ...body,
      organizationId: orgId,
      branchId: body.branchId ?? userBranchId ?? undefined,
      currentBalance: String(body.openingBalance),
    }).returning();

    await logAudit(req.db, {
      organizationId: orgId,
      userId,
      action: 'create',
      resourceType: 'bank_account',
      resourceId: bank!.id,
      resourceNumber: bank!.accountNumber,
    });

    return reply.status(201).send({ data: bank });
  });

  app.get('/bank-accounts/:id', { preHandler: [authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId } = req.user;
    const [bank] = await req.db.select().from(bankAccounts)
      .where(and(eq(bankAccounts.id, id), eq(bankAccounts.organizationId, orgId)));
    if (!bank) throw new NotFoundError('Bank account');
    return { data: bank };
  });

  // ── Bank Transactions ─────────────────────────────
  app.get('/bank-accounts/:id/transactions', { preHandler: [authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId } = req.user;
    const rows = await req.db.select().from(bankTransactions)
      .where(and(eq(bankTransactions.bankAccountId, id), eq(bankTransactions.organizationId, orgId)))
      .orderBy(desc(bankTransactions.date))
      .limit(100);
    return { data: rows };
  });

  // POST deposit / withdrawal
  app.post('/bank-accounts/:id/transactions', { preHandler: [authenticate, requireMinRole('accountant')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { orgId, userId } = req.user;

    const body = z.object({
      date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      type:        z.enum(['deposit','withdrawal','charge','interest']),
      description: z.string().min(1),
      amount:      z.number().positive(),
      reference:   z.string().optional(),
    }).parse(req.body);

    const [bank] = await req.db.select().from(bankAccounts)
      .where(and(eq(bankAccounts.id, id), eq(bankAccounts.organizationId, orgId)));
    if (!bank) throw new NotFoundError('Bank account');

    const txnNumber = await nextSequence(req.db, orgId, 'journal_entry', 'BTX', 6);
    const isDeposit = ['deposit','interest'].includes(body.type);
    const newBalance = Number(bank.currentBalance) + (isDeposit ? body.amount : -body.amount);

    const [txn] = await req.db.insert(bankTransactions).values({
      organizationId: orgId,
      bankAccountId: id,
      txnNumber,
      date: body.date,
      type: body.type,
      description: body.description,
      amount: String(body.amount),
      balanceAfter: String(newBalance),
      createdBy: userId,
    }).returning();

    // Update bank account balance
    await req.db.update(bankAccounts)
      .set({ currentBalance: String(newBalance) })
      .where(eq(bankAccounts.id, id));

    // Post journal
    const accRows = await req.db.select().from(accounts).where(eq(accounts.organizationId, orgId));
    const accByCode = new Map(accRows.map((a) => [a.code, a]));
    const bankGLAccount = accRows.find((a) => a.id === bank.accountId);
    const chargesAccount = accByCode.get('5600');

    if (bankGLAccount) {
      const accounting = new AccountingEngine(req.db);
      let lines: Array<{ accountId: string; debit: number; credit: number; description?: string }>;

      if (isDeposit) {
        lines = [
          { accountId: bankGLAccount.id, debit: body.amount, credit: 0, description: body.description },
          // Counterpart needs to be specified — default to misc income for deposits
          ...(accByCode.get('4002') ? [{ accountId: accByCode.get('4002')!.id, debit: 0, credit: body.amount }] : []),
        ];
      } else if (body.type === 'charge' && chargesAccount) {
        lines = [
          { accountId: chargesAccount.id,  debit: body.amount, credit: 0, description: body.description },
          { accountId: bankGLAccount.id,    debit: 0, credit: body.amount },
        ];
      } else {
        lines = [
          { accountId: bankGLAccount.id, debit: 0, credit: body.amount, description: body.description },
          ...(accByCode.get('5800') ? [{ accountId: accByCode.get('5800')!.id, debit: body.amount, credit: 0 }] : []),
        ];
      }

      if (lines.length >= 2) {
        const je = await accounting.postJournal({
          organizationId: orgId,
          date: body.date,
          description: `Bank ${body.type}: ${body.description}`,
          sourceType: 'bank_transaction',
          sourceId: txn!.id,
          lines,
          createdBy: userId,
        });
        await req.db.update(bankTransactions)
          .set({ journalEntryId: je.id })
          .where(eq(bankTransactions.id, txn!.id));
      }
    }

    await logAudit(req.db, {
      organizationId: orgId,
      userId,
      action: 'create',
      resourceType: 'bank_transaction',
      resourceId: txn!.id,
      resourceNumber: txnNumber,
    });

    return reply.status(201).send({ data: txn });
  });

  // ═══════════════════════════════════════
  // MOBILE MONEY WALLETS
  // ═══════════════════════════════════════

  app.get('/momo-wallets', { preHandler: [authenticate] }, async (req) => {
    const { orgId } = req.user;
    const rows = await req.db.select().from(mobileMoneWallets)
      .where(eq(mobileMoneWallets.organizationId, orgId))
      .orderBy(mobileMoneWallets.provider);
    return { data: rows };
  });

  app.post('/momo-wallets', { preHandler: [authenticate, requireMinRole('accountant')] }, async (req, reply) => {
    const { orgId, userId, branchId: userBranchId } = req.user;
    const body = z.object({
      provider:     z.enum(['orange_money','afrimoney','qmoney']),
      walletNumber: z.string().min(1).max(50),
      name:         z.string().min(1).max(255),
      accountId:    z.string().uuid(),
      branchId:     z.string().uuid().optional(),
    }).parse(req.body);

    const [wallet] = await req.db.insert(mobileMoneWallets).values({
      ...body,
      organizationId: orgId,
      branchId: body.branchId ?? userBranchId ?? undefined,
    }).returning();

    await logAudit(req.db, {
      organizationId: orgId,
      userId,
      action: 'create',
      resourceType: 'momo_wallet',
      resourceId: wallet!.id,
      resourceNumber: wallet!.walletNumber,
    });

    return reply.status(201).send({ data: wallet });
  });

  app.get('/momo-wallets/:id/transactions', { preHandler: [authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId } = req.user;
    const rows = await req.db.select().from(mobileMoenyTransactions)
      .where(and(eq(mobileMoenyTransactions.walletId, id), eq(mobileMoenyTransactions.organizationId, orgId)))
      .orderBy(desc(mobileMoenyTransactions.date))
      .limit(100);
    return { data: rows };
  });

  // POST momo transaction (send / receive / fee)
  app.post('/momo-wallets/:id/transactions', { preHandler: [authenticate, requireMinRole('cashier')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { orgId, userId } = req.user;

    const body = z.object({
      date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      type:        z.enum(['receive','send','fee','cashout','cashin']),
      description: z.string().min(1),
      amount:      z.number().positive(),
      feeAmount:   z.number().min(0).default(0),
      externalRef: z.string().optional(),
    }).parse(req.body);

    const [wallet] = await req.db.select().from(mobileMoneWallets)
      .where(and(eq(mobileMoneWallets.id, id), eq(mobileMoneWallets.organizationId, orgId)));
    if (!wallet) throw new NotFoundError('MoMo wallet');

    const isInflow = ['receive','cashin'].includes(body.type);
    const netAmount = isInflow ? body.amount - body.feeAmount : -(body.amount + body.feeAmount);
    const txnNumber = await nextSequence(req.db, orgId, 'journal_entry', 'MTX', 6);

    const [txn] = await req.db.insert(mobileMoenyTransactions).values({
      organizationId: orgId,
      walletId: id,
      txnNumber,
      date: body.date,
      type: body.type,
      description: body.description,
      amount: String(body.amount),
      feeAmount: String(body.feeAmount),
      netAmount: String(Math.abs(netAmount)),
      externalRef: body.externalRef,
      createdBy: userId,
    }).returning();

    // Update wallet balance
    await req.db.update(mobileMoneWallets)
      .set({ currentBalance: sql`current_balance + ${netAmount}` })
      .where(eq(mobileMoneWallets.id, id));

    // Post journal
    const accRows = await req.db.select().from(accounts).where(eq(accounts.organizationId, orgId));
    const walletGLAccount = accRows.find((a) => a.id === wallet.accountId);
    const momoFeeAccount  = accRows.find((a) => a.code === '5610');

    if (walletGLAccount) {
      const accounting = new AccountingEngine(req.db);
      const lines: Array<{ accountId: string; debit: number; credit: number; description?: string }> = [];

      if (isInflow) {
        // DR MoMo wallet / CR Revenue (or AR)
        lines.push({ accountId: walletGLAccount.id, debit: body.amount, credit: 0, description: body.description });
        const contraId = accRows.find((a) => a.code === '4001')?.id ?? accRows.find((a) => a.code === '4002')?.id;
        if (contraId) lines.push({ accountId: contraId, debit: 0, credit: body.amount });
      } else {
        // CR MoMo wallet / DR Expense/AP
        lines.push({ accountId: walletGLAccount.id, debit: 0, credit: body.amount, description: body.description });
        const contraId = accRows.find((a) => a.code === '2000')?.id ?? accRows.find((a) => a.code === '5800')?.id;
        if (contraId) lines.push({ accountId: contraId, debit: body.amount, credit: 0 });
      }

      if (body.feeAmount > 0 && momoFeeAccount) {
        lines.push({ accountId: momoFeeAccount.id,  debit: body.feeAmount, credit: 0, description: 'MoMo fee' });
        lines.push({ accountId: walletGLAccount.id, debit: 0, credit: body.feeAmount });
      }

      if (lines.length >= 2) {
        await accounting.postJournal({
          organizationId: orgId,
          date: body.date,
          description: `MoMo ${body.type}: ${body.description}`,
          sourceType: 'momo_transaction',
          sourceId: txn!.id,
          lines,
          createdBy: userId,
        });
      }
    }

    await logAudit(req.db, {
      organizationId: orgId,
      userId,
      action: 'create',
      resourceType: 'momo_transaction',
      resourceId: txn!.id,
      resourceNumber: txnNumber,
    });

    return reply.status(201).send({ data: txn });
  });
};

export default bankingRoutes;
