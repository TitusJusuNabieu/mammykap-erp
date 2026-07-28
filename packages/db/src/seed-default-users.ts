/**
 * Deploy-time bootstrap: creates one starter organization with a default
 * user for each of the 8 RBAC roles (see userRoleEnum), so a freshly
 * deployed instance is immediately usable for testing every permission
 * level — without leaving hardcoded credentials in the codebase.
 *
 * Guarded to run at most once: skips entirely if ANY organization already
 * exists (i.e. a real customer/tenant has registered), so it never
 * re-seeds or clutters a live instance on redeploy. Called from
 * scripts/deploy.sh after migrations.
 *
 * Passwords are generated fresh on the one run that creates them and
 * written to .ledgera-default-users.txt (gitignored, chmod 600) plus
 * stdout — nowhere else. Usage: pnpm db:seed-default-users
 */
import { randomBytes } from 'node:crypto';
import { writeFileSync, chmodSync } from 'node:fs';
import { hashSync } from 'bcryptjs';
import { adminDb as db } from './client.js';
import {
  organizations,
  subscriptions,
  branches,
  users,
  organizationUsers,
  organizationSettings,
  accounts,
  fiscalYears,
  fiscalPeriods,
  sequences,
} from './schema/index.js';

const ROLES = [
  'super_admin',
  'org_owner',
  'accountant',
  'branch_manager',
  'inventory_officer',
  'cashier',
  'employee',
  'viewer',
] as const;

const STARTER_COA = [
  { code: '1001', name: 'Cash on Hand', accountType: 'asset' as const, isSystem: true },
  { code: '1030', name: 'Bank Account', accountType: 'asset' as const, isSystem: true },
  { code: '1040', name: 'Accounts Receivable', accountType: 'asset' as const, isSystem: true },
  { code: '1100', name: 'Merchandise Inventory', accountType: 'asset' as const, isSystem: true },
  { code: '2000', name: 'Accounts Payable', accountType: 'liability' as const, isSystem: true },
  { code: '3000', name: "Owner's Capital", accountType: 'equity' as const, isSystem: true },
  { code: '4001', name: 'Product Sales', accountType: 'revenue' as const, isSystem: true },
  { code: '4002', name: 'Service Revenue', accountType: 'revenue' as const, isSystem: false },
  { code: '5000', name: 'Cost of Goods Sold', accountType: 'expense' as const, isSystem: true },
];

function genPassword(): string {
  return randomBytes(12).toString('base64url'); // 16 chars, URL-safe
}

async function seedDefaultUsers() {
  const existing = await db.select({ id: organizations.id }).from(organizations).limit(1);
  if (existing.length > 0) {
    console.log('Organizations already exist — skipping default-user seed (this only ever runs once, on a genuinely empty database).');
    return;
  }

  console.log('No organizations found — creating a starter org with one user per role...');

  const [org] = await db
    .insert(organizations)
    .values({
      name: 'LEDGERA Starter Org',
      slug: 'ledgera-starter',
      baseCurrency: 'SLE',
      timezone: 'Africa/Freetown',
      fiscalYearStart: `${new Date().getFullYear()}-01-01`,
    })
    .returning();
  if (!org) throw new Error('Failed to create starter organization');

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

  const [branch] = await db
    .insert(branches)
    .values({ organizationId: org.id, name: 'Main Branch', code: 'MAIN', isMainBranch: true })
    .returning();
  if (!branch) throw new Error('Failed to create branch');

  await db.insert(organizationSettings).values({ organizationId: org.id });
  await db.insert(accounts).values(STARTER_COA.map((a) => ({ ...a, organizationId: org.id })));

  const year = new Date().getFullYear();
  const [fy] = await db
    .insert(fiscalYears)
    .values({ organizationId: org.id, name: `FY ${year}`, startDate: `${year}-01-01`, endDate: `${year}-12-31` })
    .returning();
  if (fy) {
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const monthEnds = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const isLeap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    if (isLeap) monthEnds[1] = 29;
    await db.insert(fiscalPeriods).values(
      monthNames.map((name, i) => {
        const mm = String(i + 1).padStart(2, '0');
        return {
          organizationId: org.id,
          fiscalYearId: fy.id,
          name: `${name} ${year}`,
          startDate: `${year}-${mm}-01`,
          endDate: `${year}-${mm}-${monthEnds[i]}`,
        };
      }),
    );
  }

  const sequenceKeys = ['sale','receipt','purchase_order','grn','purchase_invoice','supplier_payment','expense','journal_entry','customer_payment','return','transfer','payroll'];
  await db.insert(sequences).values(sequenceKeys.map((k) => ({ organizationId: org.id, sequenceKey: k, currentValue: '0' })));

  const credentials: { role: string; email: string; password: string }[] = [];

  for (const role of ROLES) {
    const email = `${role.replace(/_/g, '-')}@ledgera.local`;
    const password = genPassword();
    const [user] = await db
      .insert(users)
      .values({
        email,
        passwordHash: hashSync(password, 12),
        fullName: role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        isEmailVerified: true,
      })
      .returning();
    if (!user) throw new Error(`Failed to create user for role ${role}`);

    await db.insert(organizationUsers).values({
      organizationId: org.id,
      userId: user.id,
      branchId: branch.id,
      role,
      joinedAt: new Date(),
    });

    credentials.push({ role, email, password });
  }

  const lines = [
    `LEDGERA starter org: ${org.name} (${org.id}), slug=${org.slug}`,
    `Branch: ${branch.name} (${branch.id})`,
    '',
    'Default users — one per role. Change these passwords (or deactivate',
    'these accounts entirely) before onboarding real users.',
    '',
    ...credentials.map((c) => `  ${c.role.padEnd(18)} ${c.email.padEnd(28)} ${c.password}`),
    '',
  ];

  const outFile = new URL('../../../.ledgera-default-users.txt', import.meta.url).pathname;
  writeFileSync(outFile, lines.join('\n'));
  chmodSync(outFile, 0o600);

  console.log(lines.join('\n'));
  console.log(`Credentials also saved to ${outFile} (chmod 600, gitignored).`);
}

seedDefaultUsers()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('seed-default-users failed:', err);
    process.exit(1);
  });
