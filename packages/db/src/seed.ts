/**
 * Seed script: creates a demo organization with default chart of accounts.
 * Usage: pnpm db:seed (from packages/db)
 */
// Seeding writes across orgs with no per-request tenant context, so it must
// run through the BYPASSRLS pool, not the RLS-restricted runtime pool.
import { adminDb as db } from './client.js';
import {
  organizations,
  subscriptions,
  branches,
  users,
  organizationUsers,
  accounts,
  fiscalYears,
  fiscalPeriods,
  organizationSettings,
  sequences,
} from './schema/index.js';
import { hashSync } from 'bcryptjs';

async function seed() {
  console.log('Seeding database...');

  // 1. Create demo user
  const [owner] = await db
    .insert(users)
    .values({
      email: 'owner@koromatraders.sl',
      passwordHash: hashSync('Demo@1234', 12),
      fullName: 'Alhaji Koroma',
      phone: '+23276000001',
      isEmailVerified: true,
    })
    .returning();

  if (!owner) throw new Error('Failed to create owner');

  // 2. Create organization
  const [org] = await db
    .insert(organizations)
    .values({
      name: 'Koroma General Traders',
      slug: 'koroma-traders',
      baseCurrency: 'SLE',
      timezone: 'Africa/Freetown',
      fiscalYearStart: '2025-01-01',
    })
    .returning();

  if (!org) throw new Error('Failed to create org');

  // 3. Subscription (trialing)
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);

  await db.insert(subscriptions).values({
    organizationId: org.id,
    plan: 'starter',
    status: 'trialing',
    trialEndsAt: trialEnd,
    currentPeriodStart: new Date(),
    currentPeriodEnd: trialEnd,
  });

  // 4. Main branch
  const [branch] = await db
    .insert(branches)
    .values({
      organizationId: org.id,
      name: 'Main Branch',
      code: 'MAIN',
      address: '23 Siaka Stevens St, Freetown',
      isMainBranch: true,
    })
    .returning();

  if (!branch) throw new Error('Failed to create branch');

  // 5. Link owner to org
  await db.insert(organizationUsers).values({
    organizationId: org.id,
    userId: owner.id,
    role: 'org_owner',
    joinedAt: new Date(),
  });

  // 6. Org settings
  await db.insert(organizationSettings).values({
    organizationId: org.id,
  });

  // 7. Default Chart of Accounts
  const coaData = [
    // Assets
    { code: '1000', name: 'Cash & Cash Equivalents',     accountType: 'asset' as const,     isSystem: true },
    { code: '1001', name: 'Cash on Hand',                accountType: 'asset' as const,     isSystem: true },
    { code: '1010', name: 'Petty Cash',                  accountType: 'asset' as const,     isSystem: true },
    { code: '1020', name: 'Orange Money Wallet',         accountType: 'asset' as const,     isSystem: false },
    { code: '1021', name: 'Afrimoney Wallet',            accountType: 'asset' as const,     isSystem: false },
    { code: '1022', name: 'QMoney Wallet',               accountType: 'asset' as const,     isSystem: false },
    { code: '1030', name: 'Bank Account',                accountType: 'asset' as const,     isSystem: true },
    { code: '1040', name: 'Accounts Receivable',         accountType: 'asset' as const,     isSystem: true },
    { code: '1100', name: 'Merchandise Inventory',       accountType: 'asset' as const,     isSystem: true },
    { code: '1103', name: 'Goods in Transit',            accountType: 'asset' as const,     isSystem: true },
    { code: '1200', name: 'Prepaid Expenses',            accountType: 'asset' as const,     isSystem: false },
    { code: '1300', name: 'Equipment',                   accountType: 'asset' as const,     isSystem: false },
    // Liabilities
    { code: '2000', name: 'Accounts Payable',            accountType: 'liability' as const, isSystem: true },
    { code: '2200', name: 'Salary Payable',              accountType: 'liability' as const, isSystem: true },
    { code: '2210', name: 'NASSIT Payable',              accountType: 'liability' as const, isSystem: true },
    { code: '2220', name: 'PAYE Tax Payable',            accountType: 'liability' as const, isSystem: true },
    { code: '2300', name: 'GST/VAT Payable',             accountType: 'liability' as const, isSystem: true },
    { code: '2400', name: 'Loans Payable',               accountType: 'liability' as const, isSystem: false },
    // Equity
    { code: '3000', name: "Owner's Capital",             accountType: 'equity' as const,    isSystem: true },
    { code: '3100', name: 'Retained Earnings',           accountType: 'equity' as const,    isSystem: true },
    { code: '3300', name: "Owner's Drawings",            accountType: 'equity' as const,    isSystem: false },
    // Revenue
    { code: '4001', name: 'Product Sales',               accountType: 'revenue' as const,   isSystem: true },
    { code: '4002', name: 'Service Revenue',             accountType: 'revenue' as const,   isSystem: false },
    { code: '4100', name: 'Other Revenue',               accountType: 'revenue' as const,   isSystem: false },
    // Expenses
    { code: '5000', name: 'Cost of Goods Sold',          accountType: 'expense' as const,   isSystem: true },
    { code: '5100', name: 'Salary & Wages Expense',      accountType: 'expense' as const,   isSystem: true },
    { code: '5110', name: 'NASSIT Expense (Employer)',   accountType: 'expense' as const,   isSystem: true },
    { code: '5200', name: 'Rent Expense',                accountType: 'expense' as const,   isSystem: false },
    { code: '5210', name: 'Electricity Expense',         accountType: 'expense' as const,   isSystem: false },
    { code: '5220', name: 'Water Expense',               accountType: 'expense' as const,   isSystem: false },
    { code: '5230', name: 'Internet Expense',            accountType: 'expense' as const,   isSystem: false },
    { code: '5240', name: 'Airtime Expense',             accountType: 'expense' as const,   isSystem: false },
    { code: '5300', name: 'Fuel & Transport Expense',    accountType: 'expense' as const,   isSystem: false },
    { code: '5310', name: 'Repairs & Maintenance',       accountType: 'expense' as const,   isSystem: false },
    { code: '5400', name: 'Office Supplies',             accountType: 'expense' as const,   isSystem: false },
    { code: '5500', name: 'Marketing & Advertising',     accountType: 'expense' as const,   isSystem: false },
    { code: '5600', name: 'Bank Charges & Fees',         accountType: 'expense' as const,   isSystem: false },
    { code: '5610', name: 'Mobile Money Fees',           accountType: 'expense' as const,   isSystem: false },
    { code: '5800', name: 'Miscellaneous Expenses',      accountType: 'expense' as const,   isSystem: false },
  ];

  await db.insert(accounts).values(
    coaData.map((a) => ({ ...a, organizationId: org.id })),
  );

  // 8. Fiscal year 2025
  const [fy] = await db
    .insert(fiscalYears)
    .values({
      organizationId: org.id,
      name: 'FY 2025',
      startDate: '2025-01-01',
      endDate: '2025-12-31',
    })
    .returning();

  if (!fy) throw new Error('Failed to create fiscal year');

  // 9. Monthly periods Jan–Dec 2025
  const months = [
    { name: 'January 2025',   start: '2025-01-01', end: '2025-01-31' },
    { name: 'February 2025',  start: '2025-02-01', end: '2025-02-28' },
    { name: 'March 2025',     start: '2025-03-01', end: '2025-03-31' },
    { name: 'April 2025',     start: '2025-04-01', end: '2025-04-30' },
    { name: 'May 2025',       start: '2025-05-01', end: '2025-05-31' },
    { name: 'June 2025',      start: '2025-06-01', end: '2025-06-30' },
    { name: 'July 2025',      start: '2025-07-01', end: '2025-07-31' },
    { name: 'August 2025',    start: '2025-08-01', end: '2025-08-31' },
    { name: 'September 2025', start: '2025-09-01', end: '2025-09-30' },
    { name: 'October 2025',   start: '2025-10-01', end: '2025-10-31' },
    { name: 'November 2025',  start: '2025-11-01', end: '2025-11-30' },
    { name: 'December 2025',  start: '2025-12-01', end: '2025-12-31' },
  ];

  await db.insert(fiscalPeriods).values(
    months.map((m) => ({
      organizationId: org.id,
      fiscalYearId: fy.id,
      name: m.name,
      startDate: m.start,
      endDate: m.end,
    })),
  );

  // 10. Sequences
  await db.insert(sequences).values([
    { organizationId: org.id, sequenceKey: 'sale',             currentValue: '0' },
    { organizationId: org.id, sequenceKey: 'receipt',          currentValue: '0' },
    { organizationId: org.id, sequenceKey: 'purchase_order',   currentValue: '0' },
    { organizationId: org.id, sequenceKey: 'grn',              currentValue: '0' },
    { organizationId: org.id, sequenceKey: 'purchase_invoice', currentValue: '0' },
    { organizationId: org.id, sequenceKey: 'supplier_payment', currentValue: '0' },
    { organizationId: org.id, sequenceKey: 'expense',          currentValue: '0' },
    { organizationId: org.id, sequenceKey: 'journal_entry',    currentValue: '0' },
    { organizationId: org.id, sequenceKey: 'customer_payment', currentValue: '0' },
    { organizationId: org.id, sequenceKey: 'return',           currentValue: '0' },
    { organizationId: org.id, sequenceKey: 'transfer',         currentValue: '0' },
    { organizationId: org.id, sequenceKey: 'payroll',          currentValue: '0' },
  ]);

  console.log(`✅ Seed complete for org: ${org.name} (${org.id})`);
  console.log(`   Owner: ${owner.email} / Demo@1234`);
  console.log(`   Branch: ${branch.name} (${branch.id})`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
