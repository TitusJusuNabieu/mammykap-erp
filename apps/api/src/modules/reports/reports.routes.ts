import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, gte, lte, asc, desc, inArray, sql } from 'drizzle-orm';
import type { Database } from '@ledgera/db';
import { journalLines, journalEntries, accounts, sales, saleLines, stockLevels, products, organizations } from '@ledgera/db';
import { authenticate, requireMinRole } from '../../middleware/auth.js';

const reportsRoutes: FastifyPluginAsync = async (app) => {
  async function getOrgCurrency(db: Database, orgId: string): Promise<string> {
    const [org] = await db
      .select({ baseCurrency: organizations.baseCurrency })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    return org?.baseCurrency ?? 'SLE';
  }

  // ── P&L Statement ─────────────────────────────────
  app.get('/profit-loss', { preHandler: [authenticate, requireMinRole('accountant')] }, async (req) => {
    const { orgId } = req.user;
    const query = z.object({
      from: z.string().default(() => `${new Date().getFullYear()}-01-01`),
      to:   z.string().default(() => new Date().toISOString().slice(0, 10)),
      branch_id: z.string().uuid().optional(),
    }).parse(req.query);

    const conditions = [
      eq(journalEntries.organizationId, orgId),
      eq(journalEntries.status, 'posted'),
      gte(journalEntries.date, query.from),
      lte(journalEntries.date, query.to),
    ];

    if (query.branch_id) conditions.push(eq(journalEntries.branchId, query.branch_id));

    // Aggregate by account
    const rows = await req.db
      .select({
        accountId: journalLines.accountId,
        accountCode: accounts.code,
        accountName: accounts.name,
        accountType: accounts.accountType,
        totalDebit: sql<string>`SUM(${journalLines.baseDebit})`,
        totalCredit: sql<string>`SUM(${journalLines.baseCredit})`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
      .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
      .where(and(...conditions))
      .groupBy(journalLines.accountId, accounts.code, accounts.name, accounts.accountType)
      .orderBy(asc(accounts.code));

    const revenue: typeof rows = [];
    const cogs: typeof rows = [];
    const expenses: typeof rows = [];

    for (const row of rows) {
      if (row.accountType === 'revenue') revenue.push(row);
      else if (row.accountType === 'expense' && row.accountCode === '5000') cogs.push(row);
      else if (row.accountType === 'expense') expenses.push(row);
    }

    const totalRevenue = revenue.reduce((s, r) => s + (Number(r.totalCredit) - Number(r.totalDebit)), 0);
    const totalCOGS    = cogs.reduce((s, r) => s + (Number(r.totalDebit) - Number(r.totalCredit)), 0);
    const grossProfit  = totalRevenue - totalCOGS;
    const totalExpenses = expenses.reduce((s, r) => s + (Number(r.totalDebit) - Number(r.totalCredit)), 0);
    const netProfit    = grossProfit - totalExpenses;
    const currency = await getOrgCurrency(req.db, orgId);

    return {
      data: {
        period: { from: query.from, to: query.to },
        currency,
        revenue: {
          total: totalRevenue.toFixed(2),
          lines: revenue.map((r) => ({
            accountCode: r.accountCode,
            accountName: r.accountName,
            amount: (Number(r.totalCredit) - Number(r.totalDebit)).toFixed(2),
          })),
        },
        cogs: {
          total: totalCOGS.toFixed(2),
          lines: cogs.map((r) => ({
            accountCode: r.accountCode,
            accountName: r.accountName,
            amount: (Number(r.totalDebit) - Number(r.totalCredit)).toFixed(2),
          })),
        },
        grossProfit: grossProfit.toFixed(2),
        grossProfitMargin: totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(2) : '0.00',
        expenses: {
          total: totalExpenses.toFixed(2),
          lines: expenses.map((r) => ({
            accountCode: r.accountCode,
            accountName: r.accountName,
            amount: (Number(r.totalDebit) - Number(r.totalCredit)).toFixed(2),
          })),
        },
        netProfit: netProfit.toFixed(2),
        netProfitMargin: totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(2) : '0.00',
      },
    };
  });

  // ── Balance Sheet ─────────────────────────────────
  app.get('/balance-sheet', { preHandler: [authenticate, requireMinRole('accountant')] }, async (req) => {
    const { orgId } = req.user;
    const { as_of } = z.object({
      as_of: z.string().default(() => new Date().toISOString().slice(0, 10)),
    }).parse(req.query);

    const rows = await req.db
      .select({
        accountId: journalLines.accountId,
        accountCode: accounts.code,
        accountName: accounts.name,
        accountType: accounts.accountType,
        totalDebit: sql<string>`SUM(${journalLines.baseDebit})`,
        totalCredit: sql<string>`SUM(${journalLines.baseCredit})`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
      .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
      .where(
        and(
          eq(journalEntries.organizationId, orgId),
          eq(journalEntries.status, 'posted'),
          lte(journalEntries.date, as_of),
          inArray(accounts.accountType, ['asset', 'liability', 'equity']),
        ),
      )
      .groupBy(journalLines.accountId, accounts.code, accounts.name, accounts.accountType)
      .orderBy(asc(accounts.code));

    const assets: typeof rows = [];
    const liabilities: typeof rows = [];
    const equity: typeof rows = [];

    for (const row of rows) {
      if (row.accountType === 'asset') assets.push(row);
      else if (row.accountType === 'liability') liabilities.push(row);
      else equity.push(row);
    }

    const calcBalance = (rows: typeof assets, type: string) =>
      rows.map((r) => {
        const balance = type === 'asset'
          ? Number(r.totalDebit) - Number(r.totalCredit)
          : Number(r.totalCredit) - Number(r.totalDebit);
        return { accountCode: r.accountCode, accountName: r.accountName, balance: balance.toFixed(2) };
      });

    const totalAssets      = assets.reduce((s, r) => s + Number(r.totalDebit) - Number(r.totalCredit), 0);
    const totalLiabilities = liabilities.reduce((s, r) => s + Number(r.totalCredit) - Number(r.totalDebit), 0);
    const totalEquity      = equity.reduce((s, r) => s + Number(r.totalCredit) - Number(r.totalDebit), 0);
    const currency = await getOrgCurrency(req.db, orgId);

    return {
      data: {
        asOf: as_of,
        currency,
        assets:      { total: totalAssets.toFixed(2),      lines: calcBalance(assets, 'asset') },
        liabilities: { total: totalLiabilities.toFixed(2), lines: calcBalance(liabilities, 'liability') },
        equity:      { total: totalEquity.toFixed(2),       lines: calcBalance(equity, 'equity') },
        totalLiabilitiesAndEquity: (totalLiabilities + totalEquity).toFixed(2),
        isBalanced: Math.abs(totalAssets - totalLiabilities - totalEquity) < 0.01,
      },
    };
  });

  // ── Trial Balance ─────────────────────────────────
  app.get('/trial-balance', { preHandler: [authenticate, requireMinRole('accountant')] }, async (req) => {
    const { orgId } = req.user;
    const { from, to } = z.object({
      from: z.string().default(() => `${new Date().getFullYear()}-01-01`),
      to: z.string().default(() => new Date().toISOString().slice(0, 10)),
    }).parse(req.query);

    const rows = await req.db
      .select({
        accountCode: accounts.code,
        accountName: accounts.name,
        accountType: accounts.accountType,
        totalDebit: sql<string>`SUM(${journalLines.baseDebit})`,
        totalCredit: sql<string>`SUM(${journalLines.baseCredit})`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
      .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
      .where(
        and(
          eq(journalEntries.organizationId, orgId),
          eq(journalEntries.status, 'posted'),
          gte(journalEntries.date, from),
          lte(journalEntries.date, to),
        ),
      )
      .groupBy(accounts.code, accounts.name, accounts.accountType)
      .orderBy(asc(accounts.code));

    const data = rows.map((r) => ({
      accountCode: r.accountCode,
      accountName: r.accountName,
      accountType: r.accountType,
      totalDebit: Number(r.totalDebit).toFixed(2),
      totalCredit: Number(r.totalCredit).toFixed(2),
      balance: (Number(r.totalDebit) - Number(r.totalCredit)).toFixed(2),
    }));

    const grandDebit  = data.reduce((s, r) => s + Number(r.totalDebit), 0);
    const grandCredit = data.reduce((s, r) => s + Number(r.totalCredit), 0);

    return {
      data: {
        period: { from, to },
        lines: data,
        totals: {
          debit: grandDebit.toFixed(2),
          credit: grandCredit.toFixed(2),
          isBalanced: Math.abs(grandDebit - grandCredit) < 0.01,
        },
      },
    };
  });

  // ── General Ledger (by account) ───────────────────
  app.get('/general-ledger', { preHandler: [authenticate, requireMinRole('accountant')] }, async (req) => {
    const { orgId } = req.user;
    const query = z.object({
      account_id: z.string().uuid(),
      from: z.string().default(() => `${new Date().getFullYear()}-01-01`),
      to: z.string().default(() => new Date().toISOString().slice(0, 10)),
    }).parse(req.query);

    const rows = await req.db
      .select({
        date: journalEntries.date,
        entryNumber: journalEntries.entryNumber,
        description: journalEntries.description,
        lineDesc: journalLines.description,
        debit: journalLines.baseDebit,
        credit: journalLines.baseCredit,
        sourceType: journalEntries.sourceType,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
      .where(
        and(
          eq(journalLines.accountId, query.account_id),
          eq(journalEntries.organizationId, orgId),
          eq(journalEntries.status, 'posted'),
          gte(journalEntries.date, query.from),
          lte(journalEntries.date, query.to),
        ),
      )
      .orderBy(asc(journalEntries.date), asc(journalEntries.entryNumber));

    let runningBalance = 0;
    const data = rows.map((r) => {
      runningBalance += Number(r.debit) - Number(r.credit);
      return {
        date: r.date,
        entryNumber: r.entryNumber,
        description: r.lineDesc ?? r.description,
        debit: Number(r.debit).toFixed(2),
        credit: Number(r.credit).toFixed(2),
        balance: runningBalance.toFixed(2),
      };
    });

    return { data: { account_id: query.account_id, period: { from: query.from, to: query.to }, lines: data } };
  });

  // ── Sales Summary ─────────────────────────────────
  app.get('/sales-summary', { preHandler: [authenticate, requireMinRole('branch_manager')] }, async (req) => {
    const { orgId } = req.user;
    const { from, to } = z.object({
      from: z.string().default(() => new Date().toISOString().slice(0, 10)),
      to: z.string().default(() => new Date().toISOString().slice(0, 10)),
    }).parse(req.query);

    const [result] = await req.db
      .select({
        totalSales: sql<string>`COUNT(*)`,
        totalRevenue: sql<string>`SUM(${sales.totalAmount})`,
        totalPaid: sql<string>`SUM(${sales.amountPaid})`,
        totalDue: sql<string>`SUM(${sales.amountDue})`,
      })
      .from(sales)
      .where(
        and(
          eq(sales.organizationId, orgId),
          gte(sales.date, from),
          lte(sales.date, to),
        ),
      );

    return { data: { period: { from, to }, ...result } };
  });

  // ── Inventory Valuation ───────────────────────────
  app.get('/inventory-valuation', { preHandler: [authenticate, requireMinRole('accountant')] }, async (req) => {
    const { orgId } = req.user;
    const { branch_id } = z.object({ branch_id: z.string().uuid().optional() }).parse(req.query);

    const conditions = [eq(stockLevels.organizationId, orgId)];
    if (branch_id) conditions.push(eq(stockLevels.branchId, branch_id));

    const rows = await req.db
      .select({
        productId: stockLevels.productId,
        branchId: stockLevels.branchId,
        quantity: stockLevels.quantity,
        avgCost: stockLevels.avgCost,
        productName: products.name,
        productSku: products.sku,
      })
      .from(stockLevels)
      .innerJoin(products, eq(products.id, stockLevels.productId))
      .where(and(...conditions))
      .orderBy(asc(products.name));

    const data = rows.map((r) => ({
      productId: r.productId,
      productName: r.productName,
      sku: r.productSku,
      branchId: r.branchId,
      quantity: Number(r.quantity).toFixed(3),
      avgCost: Number(r.avgCost).toFixed(4),
      totalValue: (Number(r.quantity) * Number(r.avgCost)).toFixed(2),
    }));

    const totalValue = data.reduce((s, r) => s + Number(r.totalValue), 0);

    return { data: { lines: data, totalValue: totalValue.toFixed(2), itemCount: data.length } };
  });
};

export default reportsRoutes;
