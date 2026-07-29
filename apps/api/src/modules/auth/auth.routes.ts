import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, gt, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { userSessions, organizations, organizationUsers, subscriptions } from '@ledgera/db';
import { AuthService } from './auth.service.js';
import { authenticate } from '../../middleware/auth.js';
import { UnauthorizedError, ValidationError, TooManyRequestsError, ForbiddenError } from '../../utils/errors.js';
import { logAudit } from '../../utils/audit.js';

const authRoutes: FastifyPluginAsync = async (app) => {
  // Pre-auth flows (register/login/verify/reset) have no tenant context —
  // must use the BYPASSRLS pool, not the RLS-restricted request pool.
  const svc = new AuthService(app.adminDb);

  // ── POST /auth/register ──────────────────────────
  // 3 registrations per IP per hour
  app.post('/register', { config: { rateLimit: { max: 3, timeWindow: '1 hour' } } }, async (req, reply) => {
    // A dedicated deployment is contractually one business, already
    // provisioned via db:seed-default-users — self-service signup would
    // just create unrelated, orphaned organizations in that instance's own
    // database. The frontend already hides the link for this mode (see
    // (auth)/login and (auth)/register), but that's UI-only; enforce it
    // here too since this endpoint is reachable directly.
    if (process.env['DEPLOYMENT_MODE'] === 'dedicated') {
      throw new ForbiddenError('Self-service registration is not available on this deployment.');
    }

    const body = z.object({
      email: z.string().email(),
      password: z.string().min(8).max(100),
      fullName: z.string().min(2).max(255),
      phone: z.string().optional(),
      orgName: z.string().min(2).max(255),
      branchName: z.string().optional(),
    }).parse(req.body);

    const result = await svc.register(body);

    // TODO: send verification email in background
    return reply.status(201).send({
      data: {
        user: result.user,
        organization: result.organization,
        message: 'Registration successful. Please verify your email.',
      },
    });
  });

  // ── POST /auth/login ─────────────────────────────
  // 10 attempts per IP per 15 minutes — stop brute-force
  app.post('/login', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const { email, password } = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }).parse(req.body);

    const emailKey = `auth:fail:${email.toLowerCase()}`;

    // Check if account is temporarily locked
    const lockTTL = await app.redis.ttl(`auth:lock:${email.toLowerCase()}`);
    if (lockTTL > 0) {
      const mins = Math.ceil(lockTTL / 60);
      throw new TooManyRequestsError(`Account locked due to too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
    }

    let result;
    try {
      result = await svc.login(email, password);
    } catch (err) {
      // Increment fail counter; lock after 5 consecutive failures for 15 minutes
      const fails = await app.redis.incr(emailKey);
      await app.redis.expire(emailKey, 900);
      if (fails >= 5) {
        await app.redis.setex(`auth:lock:${email.toLowerCase()}`, 900, '1');
        throw new TooManyRequestsError('Account locked for 15 minutes after too many failed attempts.');
      }
      throw err;
    }

    // Clear fail counter on success
    await app.redis.del(emailKey);

    if (result.user.totpEnabled) {
      // Issue a short-lived temp token for 2FA step
      const tempToken = app.jwt.sign(
        { sub: result.user.id, temp: true, step: '2fa' },
        { expiresIn: '10m' },
      );
      return reply.send({ data: { requires_2fa: true, temp_token: tempToken } });
    }

    const { accessToken, refreshToken } = await issueTokens(app, result, req.ip);

    reply.setCookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'lax',
      path: '/v1/auth/refresh',
      maxAge: 7 * 24 * 60 * 60,
    });

    return reply.send({
      data: {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 900,
        user: {
          id: result.user.id,
          full_name: result.user.fullName,
          email: result.user.email,
          avatar_url: result.user.avatarUrl,
          is_email_verified: result.user.isEmailVerified,
          organization: result.organization,
          role: result.membership.role,
          plan: result.membership.plan,
        },
      },
    });
  });

  // ── POST /auth/refresh ───────────────────────────
  app.post('/refresh', async (req, reply) => {
    const token = req.cookies['refresh_token'];
    if (!token) throw new UnauthorizedError('No refresh token');

    const [session] = await app.adminDb
      .select()
      .from(userSessions)
      .where(
        and(
          eq(userSessions.tokenHash, token),
          gt(userSessions.expiresAt, new Date()),
          isNull(userSessions.revokedAt),
        ),
      )
      .limit(1);

    if (!session) throw new UnauthorizedError('Session expired or invalid');
    if (!session.organizationId) throw new UnauthorizedError('Session has no organization context');

    // Re-fetch full claim set (role/branch/plan) — a token re-signed with only
    // sub/org_id silently degrades every requireMinRole/requireRole check
    // for the rest of its life.
    const [membership] = await app.adminDb
      .select({ role: organizationUsers.role, branchId: organizationUsers.branchId })
      .from(organizationUsers)
      .where(
        and(
          eq(organizationUsers.userId, session.userId),
          eq(organizationUsers.organizationId, session.organizationId),
          eq(organizationUsers.isActive, true),
        ),
      )
      .limit(1);

    if (!membership) throw new UnauthorizedError('No organization access');

    const [sub] = await app.adminDb
      .select({ plan: subscriptions.plan, status: subscriptions.status })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, session.organizationId))
      .limit(1);

    const accessToken = app.jwt.sign({
      sub: session.userId,
      org_id: session.organizationId,
      role: membership.role,
      branch_id: membership.branchId,
      plan: sub?.plan ?? 'starter',
      sub_status: sub?.status ?? 'trialing',
    });

    return reply.send({
      data: { access_token: accessToken, token_type: 'Bearer', expires_in: 900 },
    });
  });

  // ── POST /auth/logout ────────────────────────────
  app.post('/logout', { preHandler: [authenticate] }, async (req, reply) => {
    const { orgId, userId } = req.user;
    const token = req.cookies['refresh_token'];
    if (token) {
      await req.db
        .update(userSessions)
        .set({ revokedAt: new Date() })
        .where(eq(userSessions.tokenHash, token));
    }

    await logAudit(req.db, {
      organizationId: orgId,
      userId,
      action: 'logout',
      resourceType: 'user',
      resourceId: userId,
    });

    reply.clearCookie('refresh_token');
    return reply.send({ data: { success: true } });
  });

  // ── POST /auth/verify-email ──────────────────────
  app.post('/verify-email', async (req, reply) => {
    const { token } = z.object({ token: z.string() }).parse(req.body);
    const result = await svc.verifyEmail(token);
    return reply.send({ data: result });
  });

  // ── POST /auth/forgot-password ───────────────────
  app.post('/forgot-password', async (req, reply) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    await svc.requestPasswordReset(email);
    // Always success — prevents email enumeration
    return reply.send({ data: { success: true, message: 'If this email exists, a reset link was sent.' } });
  });

  // ── POST /auth/reset-password ────────────────────
  app.post('/reset-password', async (req, reply) => {
    const { token, password } = z.object({
      token: z.string(),
      password: z.string().min(8),
    }).parse(req.body);

    const result = await svc.resetPassword(token, password);
    return reply.send({ data: result });
  });

  // ── GET /auth/me ─────────────────────────────────
  app.get('/me', { preHandler: [authenticate] }, async (req) => {
    return { data: req.user };
  });

  // ── PATCH /auth/me ────────────────────────────────
  // Self-service name/email edit. Distinct from PATCH /org/users/:id
  // (org.routes.ts, org_owner-only — role/branch/active management for
  // OTHER members) — this is any logged-in user editing themselves, and
  // is what makes the org_owner role usable by an actual named person:
  // org_owner can't be invited (see POST /org/invite's role enum), so the
  // seeded default account (org-owner@ledgera.local, "Org Owner") is
  // otherwise stuck with those placeholder values forever.
  app.patch('/me', { preHandler: [authenticate] }, async (req) => {
    const { userId, orgId } = req.user;
    const body = z.object({
      fullName: z.string().min(2).max(255).optional(),
      email: z.string().email().optional(),
    }).parse(req.body);

    if (body.fullName === undefined && body.email === undefined) {
      throw new ValidationError('Nothing to update');
    }

    const result = await svc.updateProfile(userId, body);

    await logAudit(req.db, {
      organizationId: orgId,
      userId,
      action: 'update',
      resourceType: 'user',
      resourceId: userId,
      changes: body,
    });

    return { data: result };
  });

  // ── POST /auth/change-password ───────────────────
  // For a logged-in user changing their own password — distinct from the
  // forgot-password email flow above, which requires SMTP to be
  // configured. This needs nothing but the current session.
  app.post('/change-password', { preHandler: [authenticate] }, async (req) => {
    const { userId, orgId } = req.user;
    const { currentPassword, newPassword } = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).max(100),
    }).parse(req.body);

    const result = await svc.changePassword(userId, currentPassword, newPassword);

    await logAudit(req.db, {
      organizationId: orgId,
      userId,
      action: 'update',
      resourceType: 'user',
      resourceId: userId,
      changes: { field: 'password' },
    });

    return { data: result };
  });

  // ── GET /auth/org-brand?slug=acme ──────────────────
  // Public endpoint — no auth required. Returns minimal org branding for the
  // subdomain login page so visitors see the right logo + name.
  app.get('/org-brand', async (req, reply) => {
    const { slug } = z.object({ slug: z.string().min(1) }).parse(req.query);
    const [org] = await app.adminDb
      .select({ name: organizations.name, logoUrl: organizations.logoUrl, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);
    if (!org) return reply.status(404).send({ error: 'Organization not found' });
    return { data: org };
  });
};

// ── Token helper ────────────────────────────────────
async function issueTokens(
  app: Parameters<FastifyPluginAsync>[0],
  result: Awaited<ReturnType<AuthService['login']>>,
  ip: string,
) {
  const payload = {
    sub: result.user.id,
    org_id: result.organization?.id,
    role: result.membership.role,
    branch_id: result.membership.branchId,
    plan: result.membership.plan,
    sub_status: result.membership.status,
  };

  const accessToken = app.jwt.sign(payload);

  const refreshToken = nanoid(64);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  // Called only from /login, which runs pre-auth — must use the BYPASSRLS pool.
  await app.adminDb
    .insert(userSessions)
    .values({
      userId: result.user.id,
      organizationId: result.organization?.id,
      tokenHash: refreshToken,
      ipAddress: ip,
      expiresAt,
    });

  return { accessToken, refreshToken };
}

export default authRoutes;
