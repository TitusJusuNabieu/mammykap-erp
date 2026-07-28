import { eq, and, isNull } from 'drizzle-orm';
import { compareSync, hashSync } from 'bcryptjs';
import { nanoid } from 'nanoid';
import type { Database } from '@ledgera/db';
import {
  users,
  organizationUsers,
  organizations,
  subscriptions,
  branches,
  userSessions,
  emailVerifications,
  passwordResets,
  organizationSettings,
  sequences,
  auditLogs,
  accounts,
  fiscalYears,
  fiscalPeriods,
} from '@ledgera/db';
import {
  UnauthorizedError,
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../../utils/errors.js';

const DEFAULT_COA = [
  { code: '1001', name: 'Cash on Hand',             accountType: 'asset'     as const, isSystem: true  },
  { code: '1010', name: 'Petty Cash',               accountType: 'asset'     as const, isSystem: true  },
  { code: '1020', name: 'Orange Money Wallet',      accountType: 'asset'     as const, isSystem: false },
  { code: '1030', name: 'Bank Account',             accountType: 'asset'     as const, isSystem: true  },
  { code: '1040', name: 'Accounts Receivable',      accountType: 'asset'     as const, isSystem: true  },
  { code: '1100', name: 'Merchandise Inventory',    accountType: 'asset'     as const, isSystem: true  },
  { code: '1103', name: 'Goods in Transit',         accountType: 'asset'     as const, isSystem: true  },
  { code: '2000', name: 'Accounts Payable',         accountType: 'liability' as const, isSystem: true  },
  { code: '2200', name: 'Salary Payable',           accountType: 'liability' as const, isSystem: true  },
  { code: '2210', name: 'NASSIT Payable',           accountType: 'liability' as const, isSystem: true  },
  { code: '2220', name: 'PAYE Tax Payable',         accountType: 'liability' as const, isSystem: true  },
  { code: '2300', name: 'GST/VAT Payable',          accountType: 'liability' as const, isSystem: true  },
  { code: '3000', name: "Owner's Capital",          accountType: 'equity'    as const, isSystem: true  },
  { code: '3100', name: 'Retained Earnings',        accountType: 'equity'    as const, isSystem: true  },
  { code: '4001', name: 'Product Sales',            accountType: 'revenue'   as const, isSystem: true  },
  { code: '4002', name: 'Service Revenue',          accountType: 'revenue'   as const, isSystem: false },
  { code: '5000', name: 'Cost of Goods Sold',       accountType: 'expense'   as const, isSystem: true  },
  { code: '5100', name: 'Salary & Wages Expense',   accountType: 'expense'   as const, isSystem: true  },
  { code: '5110', name: 'NASSIT Expense (Employer)',accountType: 'expense'   as const, isSystem: true  },
  { code: '5200', name: 'Rent Expense',             accountType: 'expense'   as const, isSystem: false },
  { code: '5210', name: 'Electricity Expense',      accountType: 'expense'   as const, isSystem: false },
  { code: '5300', name: 'Fuel & Transport Expense', accountType: 'expense'   as const, isSystem: false },
  { code: '5400', name: 'Office Supplies',          accountType: 'expense'   as const, isSystem: false },
  { code: '5600', name: 'Bank Charges & Fees',      accountType: 'expense'   as const, isSystem: false },
  { code: '5610', name: 'Mobile Money Fees',        accountType: 'expense'   as const, isSystem: false },
  { code: '5800', name: 'Miscellaneous Expenses',   accountType: 'expense'   as const, isSystem: false },
];

const SEQUENCE_KEYS = [
  'sale', 'receipt', 'purchase_order', 'grn', 'purchase_invoice',
  'supplier_payment', 'expense', 'journal_entry', 'customer_payment',
  'return', 'transfer', 'payroll',
];

export class AuthService {
  constructor(private readonly db: Database) {}

  async register(input: {
    email: string;
    password: string;
    fullName: string;
    phone?: string | undefined;
    orgName: string;
    branchName?: string | undefined;
    timezone?: string;
  }) {
    // Check duplicate email
    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictError('An account with this email already exists');
    }

    return this.db.transaction(async (tx) => {
      // 1. Create user
      const [user] = await tx
        .insert(users)
        .values({
          email: input.email.toLowerCase(),
          passwordHash: hashSync(input.password, 12),
          fullName: input.fullName,
          phone: input.phone,
          isEmailVerified: false,
        })
        .returning();

      if (!user) throw new Error('Failed to create user');

      // 2. Create organization (slug from org name)
      const slug = this.slugify(input.orgName);
      const [org] = await tx
        .insert(organizations)
        .values({
          name: input.orgName,
          slug,
          baseCurrency: 'SLE',
          timezone: input.timezone ?? 'Africa/Freetown',
          fiscalYearStart: `${new Date().getFullYear()}-01-01`,
        })
        .returning();

      if (!org) throw new Error('Failed to create organization');

      // 3. Subscription (14-day trial)
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 14);
      await tx.insert(subscriptions).values({
        organizationId: org.id,
        plan: 'starter',
        status: 'trialing',
        trialEndsAt: trialEnd,
        currentPeriodStart: new Date(),
        currentPeriodEnd: trialEnd,
      });

      // 4. Main branch
      const [branch] = await tx
        .insert(branches)
        .values({
          organizationId: org.id,
          name: input.branchName ?? 'Main Branch',
          code: 'MAIN',
          isMainBranch: true,
        })
        .returning();

      if (!branch) throw new Error('Failed to create branch');

      // 5. Link user as org_owner
      await tx.insert(organizationUsers).values({
        organizationId: org.id,
        userId: user.id,
        role: 'org_owner',
        joinedAt: new Date(),
      });

      // 6. Default org settings
      await tx.insert(organizationSettings).values({ organizationId: org.id });

      // 7. Default chart of accounts
      await tx.insert(accounts).values(
        DEFAULT_COA.map((a) => ({ ...a, organizationId: org.id })),
      );

      // 8. Fiscal year + 12 monthly periods
      const year = new Date().getFullYear();
      const [fy] = await tx
        .insert(fiscalYears)
        .values({
          organizationId: org.id,
          name: `FY ${year}`,
          startDate: `${year}-01-01`,
          endDate: `${year}-12-31`,
        })
        .returning();

      if (fy) {
        const monthEnds = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        const monthNames = ['January','February','March','April','May','June',
                            'July','August','September','October','November','December'];
        const isLeap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        if (isLeap) monthEnds[1] = 29;

        await tx.insert(fiscalPeriods).values(
          monthNames.map((name, i) => {
            const mm = String(i + 1).padStart(2, '0');
            const endDay = monthEnds[i] ?? 30;
            return {
              organizationId: org.id,
              fiscalYearId: fy.id,
              name: `${name} ${year}`,
              startDate: `${year}-${mm}-01`,
              endDate: `${year}-${mm}-${endDay}`,
            };
          }),
        );
      }

      // 9. Sequences
      await tx.insert(sequences).values(
        SEQUENCE_KEYS.map((k) => ({ organizationId: org.id, sequenceKey: k, currentValue: '0' })),
      );

      // 10. Email verification token
      const verifyToken = nanoid(32);
      const verifyExpiry = new Date();
      verifyExpiry.setHours(verifyExpiry.getHours() + 24);
      await tx.insert(emailVerifications).values({
        userId: user.id,
        token: verifyToken,
        expiresAt: verifyExpiry,
      });

      return {
        user: { id: user.id, email: user.email, fullName: user.fullName },
        organization: { id: org.id, name: org.name, slug: org.slug },
        branch: { id: branch.id, name: branch.name },
        verifyToken,
      };
    });
  }

  async login(email: string, password: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (!user?.passwordHash) throw new UnauthorizedError('Invalid email or password');
    if (!compareSync(password, user.passwordHash)) throw new UnauthorizedError('Invalid email or password');
    if (!user.isActive) throw new UnauthorizedError('Account is deactivated');

    // Get org membership (first org)
    const [membership] = await this.db
      .select({
        orgId: organizationUsers.organizationId,
        role: organizationUsers.role,
        branchId: organizationUsers.branchId,
      })
      .from(organizationUsers)
      .where(
        and(eq(organizationUsers.userId, user.id), eq(organizationUsers.isActive, true)),
      )
      .limit(1);

    if (!membership) throw new UnauthorizedError('No organization access');

    // Fetch org + subscription
    const [org] = await this.db
      .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, membership.orgId))
      .limit(1);

    const [sub] = await this.db
      .select({ plan: subscriptions.plan, status: subscriptions.status })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, membership.orgId))
      .limit(1);

    // Update last login + write audit entry
    await this.db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    await this.db.insert(auditLogs).values({
      organizationId: membership.orgId,
      userId: user.id,
      action: 'login',
      resourceType: 'user',
      resourceId: user.id,
      resourceNumber: user.email,
    }).catch(() => {});

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        isEmailVerified: user.isEmailVerified,
        totpEnabled: user.totpEnabled,
      },
      organization: org,
      membership: {
        role: membership.role,
        branchId: membership.branchId,
        plan: sub?.plan ?? 'starter',
        status: sub?.status ?? 'trialing',
      },
    };
  }

  async verifyEmail(token: string) {
    const [record] = await this.db
      .select()
      .from(emailVerifications)
      .where(eq(emailVerifications.token, token))
      .limit(1);

    if (!record) throw new ValidationError('Invalid or expired verification link');
    if (record.usedAt) throw new ValidationError('Verification link already used');
    if (record.expiresAt < new Date()) throw new ValidationError('Verification link has expired');

    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ isEmailVerified: true }).where(eq(users.id, record.userId));
      await tx.update(emailVerifications).set({ usedAt: new Date() }).where(eq(emailVerifications.id, record.id));
    });

    return { success: true };
  }

  async requestPasswordReset(email: string) {
    const [user] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    // Always return success to prevent email enumeration
    if (!user) return { success: true };

    const token = nanoid(48);
    const tokenHash = hashSync(token, 10);
    const expires = new Date();
    expires.setHours(expires.getHours() + 2);

    await this.db.insert(passwordResets).values({
      userId: user.id,
      tokenHash,
      expiresAt: expires,
    });

    return { success: true, _token: token }; // In prod: only send via email
  }

  async resetPassword(token: string, newPassword: string) {
    // Find all active tokens and compare
    const records = await this.db
      .select()
      .from(passwordResets)
      .where(isNull(passwordResets.usedAt));

    const record = records.find((r) => {
      try { return compareSync(token, r.tokenHash); } catch { return false; }
    });

    if (!record || record.expiresAt < new Date()) {
      throw new ValidationError('Invalid or expired reset link');
    }

    await this.db.transaction(async (tx) => {
      await tx.update(users)
        .set({ passwordHash: hashSync(newPassword, 12) })
        .where(eq(users.id, record.userId));
      await tx.update(passwordResets)
        .set({ usedAt: new Date() })
        .where(eq(passwordResets.id, record.id));
    });

    return { success: true };
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80)
      + '-' + nanoid(6).toLowerCase();
  }
}
