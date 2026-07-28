import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  adminDb, organizations, branches, accounts, fiscalYears, fiscalPeriods,
  organizationSettings, users, organizationUsers, products,
} from '@ledgera/db';
import { buildServer } from '../src/server.js';

export interface SeededOrg {
  app: FastifyInstance;
  token: string;
  orgId: string;
  branchId: string;
  userId: string;
  productId: string;
  accounts: { cash: string; ar: string; revenue: string; tax: string; cogs: string; inventory: string };
}

let sharedApp: FastifyInstance | undefined;

/**
 * One Fastify instance for the whole test process (built lazily, closed via
 * closeSharedApp in a global afterAll) — matches how the real server runs
 * (one long-lived instance handling many requests) rather than spinning up
 * a fresh app + Redis connection per test, which is both slower and was
 * observed to cause flaky cross-test state under rapid sequential creation.
 */
async function getSharedApp(): Promise<FastifyInstance> {
  if (!sharedApp) {
    sharedApp = await buildServer();
    await sharedApp.ready();
  }
  return sharedApp;
}

export async function closeSharedApp(): Promise<void> {
  if (sharedApp) {
    await sharedApp.close();
    sharedApp = undefined;
  }
}

/**
 * Seeds one fully-isolated org (org, branch, chart of accounts, an
 * open-ended fiscal period, org settings, a single org_owner user, and one
 * taxable-free product) directly via adminDb (BYPASSRLS — this is fixture
 * setup, not a tenant-scoped operation under test). A single org_owner user
 * is used throughout since it clears every requireMinRole gate exercised
 * by these tests (cashier/inventory_officer/branch_manager) — role-specific
 * RBAC denial isn't what these tests are about.
 */
export async function seedOrg(opts: { depositGracePeriodDays?: number } = {}): Promise<SeededOrg> {
  const app = await getSharedApp();

  const suffix = randomUUID().slice(0, 8);

  const [org] = await adminDb.insert(organizations).values({
    name: `Test Org ${suffix}`,
    slug: `test-org-${suffix}`,
    baseCurrency: 'SLE',
  }).returning();
  const orgId = org!.id;

  const [branch] = await adminDb.insert(branches).values({
    organizationId: orgId,
    name: 'Main',
    code: 'MAIN',
    isMainBranch: true,
  }).returning();
  const branchId = branch!.id;

  const [fy] = await adminDb.insert(fiscalYears).values({
    organizationId: orgId,
    name: 'Test FY',
    startDate: '2020-01-01',
    endDate: '2035-12-31',
  }).returning();

  await adminDb.insert(fiscalPeriods).values({
    organizationId: orgId,
    fiscalYearId: fy!.id,
    name: 'Test Period',
    startDate: '2020-01-01',
    endDate: '2035-12-31',
  });

  const accountDefs = [
    { code: '1001', name: 'Cash', accountType: 'asset' as const },
    { code: '1040', name: 'Accounts Receivable', accountType: 'asset' as const },
    { code: '1100', name: 'Inventory', accountType: 'asset' as const },
    { code: '2300', name: 'Tax Payable', accountType: 'liability' as const },
    { code: '4001', name: 'Revenue', accountType: 'revenue' as const },
    { code: '5000', name: 'COGS', accountType: 'expense' as const },
  ];
  const insertedAccounts = await adminDb.insert(accounts).values(
    accountDefs.map((a) => ({ ...a, organizationId: orgId })),
  ).returning();
  const acctByCode = new Map(insertedAccounts.map((a) => [a.code, a.id]));

  // allowNegativeStock avoids needing a separate goods-received step just
  // to test sales/supply/reprice/void behavior.
  await adminDb.insert(organizationSettings).values({
    organizationId: orgId,
    allowNegativeStock: true,
    enableTax: false,
    depositGracePeriodDays: opts.depositGracePeriodDays ?? 60,
  });

  const [user] = await adminDb.insert(users).values({
    email: `owner-${suffix}@test.local`,
    fullName: 'Test Owner',
    isEmailVerified: true,
  }).returning();
  const userId = user!.id;

  await adminDb.insert(organizationUsers).values({
    organizationId: orgId,
    userId,
    branchId,
    role: 'org_owner',
    joinedAt: new Date(),
  });

  const [product] = await adminDb.insert(products).values({
    organizationId: orgId,
    name: 'Test Product',
    sku: `SKU-${suffix}`,
    costPrice: '10.00',
    sellingPrice: '20.00',
    isTaxable: false,
    trackInventory: true,
  }).returning();

  const token = app.jwt.sign({
    sub: userId,
    org_id: orgId,
    role: 'org_owner',
    branch_id: branchId,
    plan: 'business',
    sub_status: 'active',
  });

  return {
    app,
    token,
    orgId,
    branchId,
    userId,
    productId: product!.id,
    accounts: {
      cash: acctByCode.get('1001')!,
      ar: acctByCode.get('1040')!,
      inventory: acctByCode.get('1100')!,
      tax: acctByCode.get('2300')!,
      revenue: acctByCode.get('4001')!,
      cogs: acctByCode.get('5000')!,
    },
  };
}

export function authHeaders(token: string) {
  return { authorization: `Bearer ${token}` };
}

/** Directly updates a product's selling price (bypassing the API) to set up a reprice scenario. */
export async function setProductPrice(productId: string, sellingPrice: string) {
  const { eq } = await import('drizzle-orm');
  await adminDb.update(products).set({ sellingPrice }).where(eq(products.id, productId));
}
