import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import {
  organizations,
  branches,
  organizationUsers,
  subscriptions,
  organizationSettings,
  users,
  orgInvitations,
  fiscalPeriods,
} from '@ledgera/db';
import { authenticate, requireMinRole } from '../../middleware/auth.js';
import { enforcePlanLimit } from '../../middleware/subscription.js';
import { NotFoundError, ConflictError, ValidationError, PlanLimitError } from '../../utils/errors.js';
import { logAudit } from '../../utils/audit.js';

const orgRoutes: FastifyPluginAsync = async (app) => {

  // ── GET /org ─────────────────────────────────────
  app.get('/', { preHandler: [authenticate] }, async (req) => {
    const { orgId } = req.user;
    const [org] = await req.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!org) throw new NotFoundError('Organization');
    return { data: org };
  });

  // ── PATCH /org ───────────────────────────────────
  app.patch('/', { preHandler: [authenticate, requireMinRole('org_owner')] }, async (req) => {
    const { orgId } = req.user;
    const body = z.object({
      name:               z.string().min(2).optional(),
      address:            z.string().optional(),
      phone:              z.string().optional(),
      email:              z.string().email().optional(),
      website:            z.string().optional(),
      tin:                z.string().optional(),
      registrationNumber: z.string().optional(),
      logoUrl:            z.string().url().optional().or(z.literal('')),
      timezone:           z.string().optional(),
    }).parse(req.body);

    const [updated] = await req.db
      .update(organizations)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(organizations.id, orgId))
      .returning();

    return { data: updated };
  });

  // ── GET /org/settings ────────────────────────────
  app.get('/settings', { preHandler: [authenticate] }, async (req) => {
    const { orgId } = req.user;
    const [settings] = await req.db
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, orgId))
      .limit(1);
    return { data: settings ?? null };
  });

  // ── PATCH /org/settings ──────────────────────────
  app.patch('/settings', { preHandler: [authenticate, requireMinRole('org_owner')] }, async (req) => {
    const { orgId, userId } = req.user;
    const body = z.object({
      invoicePrefix: z.string().max(10).optional(),
      receiptPrefix: z.string().max(10).optional(),
      poPrefix: z.string().max(10).optional(),
      expensePrefix: z.string().max(10).optional(),
      enableTax: z.boolean().optional(),
      defaultTaxRate: z.number().min(0).max(100).optional(),
      taxName: z.string().optional(),
      taxNumber: z.string().optional(),
      enableMomo: z.boolean().optional(),
      allowNegativeStock: z.boolean().optional(),
      depositGracePeriodDays: z.number().int().min(0).optional(),
      whatsappReceipts: z.boolean().optional(),
      smsReceipts: z.boolean().optional(),
      posAutoPrint: z.boolean().optional(),
      // Receipt / Invoice customization
      receiptHeaderText:  z.string().optional(),
      receiptFooterText:  z.string().optional(),
      invoiceFooterText:  z.string().optional(),
      showLogoOnReceipt:  z.boolean().optional(),
      showLogoOnInvoice:  z.boolean().optional(),
      showTinOnReceipt:   z.boolean().optional(),
      showTinOnInvoice:   z.boolean().optional(),
      invoiceTerms:       z.string().optional(),
      invoiceBankDetails: z.string().optional(),
    }).parse(req.body);

    const { defaultTaxRate, ...restBody } = body;

    const [updated] = await req.db
      .update(organizationSettings)
      .set({
        ...restBody,
        ...(defaultTaxRate !== undefined ? { defaultTaxRate: String(defaultTaxRate) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(organizationSettings.organizationId, orgId))
      .returning();

    await logAudit(req.db, {
      organizationId: orgId,
      userId,
      action: 'update',
      resourceType: 'organization_settings',
      resourceId: updated?.id,
      changes: body,
    });

    return { data: updated };
  });

  // ── GET /org/subscription ────────────────────────
  app.get('/subscription', { preHandler: [authenticate] }, async (req) => {
    const { orgId } = req.user;
    const [sub] = await req.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, orgId))
      .limit(1);
    return { data: sub ?? null };
  });

  // ── GET /org/branches ────────────────────────────
  app.get('/branches', { preHandler: [authenticate] }, async (req) => {
    const { orgId } = req.user;
    const rows = await req.db
      .select()
      .from(branches)
      .where(eq(branches.organizationId, orgId));
    return { data: rows };
  });

  // ── POST /org/branches ───────────────────────────
  app.post('/branches', { preHandler: [authenticate, requireMinRole('org_owner'), enforcePlanLimit('branches')] }, async (req, reply) => {
    const { orgId, userId } = req.user;
    const body = z.object({
      name: z.string().min(1).max(255),
      code: z.string().min(1).max(20).toUpperCase(),
      address: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
    }).parse(req.body);

    const [branch] = await req.db
      .insert(branches)
      .values({ ...body, organizationId: orgId })
      .returning();

    await logAudit(req.db, {
      organizationId: orgId,
      userId,
      action: 'create',
      resourceType: 'branch',
      resourceId: branch!.id,
      resourceNumber: branch!.code,
    });

    return reply.status(201).send({ data: branch });
  });

  // ── PATCH /org/branches/:id ──────────────────────
  app.patch('/branches/:id', { preHandler: [authenticate, requireMinRole('org_owner')] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId, userId } = req.user;
    const body = z.object({
      name: z.string().optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      isActive: z.boolean().optional(),
    }).parse(req.body);

    const [updated] = await req.db
      .update(branches)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(branches.id, id), eq(branches.organizationId, orgId)))
      .returning();

    if (!updated) throw new NotFoundError('Branch');

    await logAudit(req.db, {
      organizationId: orgId,
      userId,
      action: 'update',
      resourceType: 'branch',
      resourceId: updated.id,
      resourceNumber: updated.code,
      changes: body,
    });

    return { data: updated };
  });

  // ── GET /org/users ───────────────────────────────
  app.get('/users', { preHandler: [authenticate, requireMinRole('org_owner')] }, async (req) => {
    const { orgId } = req.user;
    const rows = await req.db
      .select({
        id: organizationUsers.id,
        userId: organizationUsers.userId,
        role: organizationUsers.role,
        branchId: organizationUsers.branchId,
        isActive: organizationUsers.isActive,
        joinedAt: organizationUsers.joinedAt,
        fullName: users.fullName,
        email: users.email,
        avatarUrl: users.avatarUrl,
      })
      .from(organizationUsers)
      .innerJoin(users, eq(users.id, organizationUsers.userId))
      .where(eq(organizationUsers.organizationId, orgId));

    return { data: rows };
  });

  // ── PATCH /org/users/:id ─────────────────────────
  app.patch('/users/:id', { preHandler: [authenticate, requireMinRole('org_owner')] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId, userId } = req.user;
    const body = z.object({
      role: z.enum(['accountant','branch_manager','inventory_officer','cashier','employee','viewer']).optional(),
      isActive: z.boolean().optional(),
      branchId: z.string().uuid().nullable().optional(),
    }).parse(req.body);

    const [updated] = await req.db
      .update(organizationUsers)
      .set(body)
      .where(and(eq(organizationUsers.id, id), eq(organizationUsers.organizationId, orgId)))
      .returning();

    if (!updated) throw new NotFoundError('User');

    await logAudit(req.db, {
      organizationId: orgId,
      userId,
      action: 'update',
      resourceType: 'organization_user',
      resourceId: updated.id,
      changes: body,
    });

    return { data: updated };
  });
  // ── POST /org/invite ─────────────────────────────
  // Soft check at invite-send time (good UX — reject before the invite email
  // goes out). The seat is only actually consumed at /invite/accept, which
  // has no authenticate preHandler to hang enforcePlanLimit off, so that
  // route re-checks the same limit defensively right before its insert.
  app.post('/invite', { preHandler: [authenticate, requireMinRole('org_owner'), enforcePlanLimit('users')] }, async (req, reply) => {
    const { orgId, userId } = req.user;
    const body = z.object({
      email:    z.string().email(),
      role:     z.enum(['accountant','branch_manager','inventory_officer','cashier','employee','viewer']),
      branchId: z.string().uuid().optional(),
    }).parse(req.body);

    // Check if already a member
    const existing = await req.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, body.email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      const alreadyMember = await req.db
        .select()
        .from(organizationUsers)
        .where(and(eq(organizationUsers.organizationId, orgId), eq(organizationUsers.userId, existing[0]!.id)))
        .limit(1);
      if (alreadyMember.length > 0) throw new ConflictError('User is already a member of this organization');
    }

    const token = nanoid(48);
    const expires = new Date();
    expires.setDate(expires.getDate() + 7);

    const [inv] = await req.db.insert(orgInvitations).values({
      organizationId: orgId,
      email: body.email.toLowerCase(),
      role: body.role,
      branchId: body.branchId,
      token,
      invitedBy: userId,
      expiresAt: expires,
    }).returning();

    await logAudit(req.db, {
      organizationId: orgId,
      userId,
      action: 'create',
      resourceType: 'org_invitation',
      resourceId: inv!.id,
      resourceNumber: inv!.email,
    });

    // TODO: send invite email with token
    return reply.status(201).send({
      data: { id: inv!.id, email: inv!.email, role: inv!.role, expiresAt: inv!.expiresAt },
    });
  });

  // ── POST /org/invite/accept ───────────────────────
  app.post('/invite/accept', async (req, reply) => {
    const { token, password, fullName } = z.object({
      token:    z.string(),
      fullName: z.string().min(2),
      password: z.string().min(8),
    }).parse(req.body);

    const [inv] = await app.adminDb.select().from(orgInvitations)
      .where(eq(orgInvitations.token, token))
      .limit(1);

    if (!inv) throw new ValidationError('Invalid or expired invitation');
    if (inv.expiresAt < new Date()) throw new ValidationError('Invitation has expired');
    if (inv.acceptedAt) throw new ValidationError('Invitation already accepted');

    const { hashSync } = await import('bcryptjs');

    // Upsert user
    const existing = await app.adminDb.select().from(users)
      .where(eq(users.email, inv.email)).limit(1);

    let targetUserId: string;

    if (existing.length > 0) {
      targetUserId = existing[0]!.id;
    } else {
      const [newUser] = await app.adminDb.insert(users).values({
        email: inv.email,
        fullName,
        passwordHash: hashSync(password, 12),
        isEmailVerified: true,
      }).returning();
      targetUserId = newUser!.id;
    }

    // Defensive re-check: this is the route that actually consumes a seat
    // (POST /invite only did a soft check at send-time). No tenant
    // transaction exists here (no authenticate preHandler), so this can't
    // reuse the enforcePlanLimit preHandler — check inline instead.
    if (process.env['DEPLOYMENT_MODE'] !== 'dedicated') {
      const [sub] = await app.adminDb
        .select({ maxUsers: subscriptions.maxUsers })
        .from(subscriptions)
        .where(eq(subscriptions.organizationId, inv.organizationId))
        .limit(1);
      const max = Number(sub?.maxUsers ?? Infinity);
      const [row] = await app.adminDb
        .select({ count: sql<string>`count(*)` })
        .from(organizationUsers)
        .where(eq(organizationUsers.organizationId, inv.organizationId));
      const current = Number(row?.count ?? 0);
      if (current >= max) {
        throw new PlanLimitError('users', current, max, 'starter');
      }
    }

    await app.adminDb.insert(organizationUsers).values({
      organizationId: inv.organizationId,
      userId: targetUserId,
      role: inv.role,
      branchId: inv.branchId,
      invitedBy: inv.invitedBy,
      joinedAt: new Date(),
    });

    await app.adminDb.update(orgInvitations)
      .set({ acceptedAt: new Date() })
      .where(eq(orgInvitations.id, inv.id));

    await logAudit(app.adminDb, {
      organizationId: inv.organizationId,
      userId: targetUserId,
      action: 'create',
      resourceType: 'organization_user',
      resourceId: targetUserId,
      resourceNumber: inv.email,
    });

    return reply.send({ data: { success: true, message: 'Invitation accepted. You can now log in.' } });
  });

  // ── POST /fiscal-periods/:id/close ────────────────
  app.post('/fiscal-periods/:id/close', { preHandler: [authenticate, requireMinRole('accountant')] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId, userId } = req.user;

    const [period] = await req.db.select().from(fiscalPeriods)
      .where(and(eq(fiscalPeriods.id, id), eq(fiscalPeriods.organizationId, orgId)));

    if (!period) throw new NotFoundError('Fiscal period');
    if (period.isClosed) throw new ValidationError('Period is already closed');

    await req.db.update(fiscalPeriods)
      .set({ isClosed: true, closedAt: new Date(), closedBy: userId })
      .where(eq(fiscalPeriods.id, id));

    return { data: { success: true, period: period.name } };
  });
};

export default orgRoutes;
