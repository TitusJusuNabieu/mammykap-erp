import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { subscriptions, organizations } from '@ledgera/db';
import { authenticate, requireMinRole } from '../../middleware/auth.js';
import { monimeService, type MonimeNetwork, type MonimeWebhookPayload } from '../../services/monime.service.js';
import { ValidationError, NotFoundError } from '../../utils/errors.js';
import { logAudit } from '../../utils/audit.js';

const PLAN_PRICES: Record<string, number> = {
  starter:    500_000,
  growth:   1_200_000,
  business: 2_500_000,
};

const billingRoutes: FastifyPluginAsync = async (app) => {
  // `config: { rawBody: true }` on /webhook below does nothing by itself —
  // Fastify has no built-in raw-body capture, and none was wired up here.
  // Without this parser, the code fell back to re-serializing the already-
  // parsed body (JSON.stringify(req.body)), which can byte-for-byte mismatch
  // what Monime actually signed (key order, whitespace, unicode escaping),
  // silently breaking signature verification for real webhooks. Scoped to
  // this plugin's encapsulation context only — every other route keeps
  // Fastify's default JSON parsing untouched.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    (req as unknown as { rawBody: string }).rawBody = body as string;
    try {
      done(null, body ? JSON.parse(body as string) : {});
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // ── GET /billing/subscription ────────────────────────
  app.get('/subscription', { preHandler: [authenticate] }, async (req) => {
    const { orgId } = req.user;
    const [sub] = await req.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, orgId))
      .limit(1);
    return { data: sub ?? null };
  });

  // ── POST /billing/initiate ────────────────────────────
  // Starts a Monime payment request to collect a subscription fee
  app.post('/initiate', { preHandler: [authenticate, requireMinRole('org_owner')] }, async (req, reply) => {
    const { orgId, userId } = req.user;

    const body = z.object({
      plan:        z.enum(['starter', 'growth', 'business']),
      phoneNumber: z.string().min(9, 'Valid phone number required'),
      network:     z.enum(['orange_money', 'afrimoney', 'qmoney']),
    }).parse(req.body);

    const [org] = await req.db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!org) throw new NotFoundError('Organization');

    const amount = PLAN_PRICES[body.plan];
    if (!amount) throw new ValidationError('Invalid plan');

    const reference = `SUB-${orgId.slice(0, 8).toUpperCase()}-${nanoid(8)}`;

    const payment = await monimeService.collectPayment({
      amount,
      currency: 'SLE',
      phoneNumber: body.phoneNumber,
      network: body.network as MonimeNetwork,
      description: `LEDGERA ${body.plan.charAt(0).toUpperCase() + body.plan.slice(1)} — ${org.name}`,
      reference,
      callbackUrl: `${process.env['API_URL'] ?? 'http://localhost:3001'}/v1/billing/webhook`,
      metadata: { org_id: orgId, plan: body.plan },
    });

    await logAudit(req.db, {
      organizationId: orgId,
      userId,
      action: 'create',
      resourceType: 'billing_payment',
      resourceId: payment.id,
      resourceNumber: reference,
    });

    return reply.status(201).send({
      data: {
        paymentId: payment.id,
        status:    payment.status,
        reference,
        amount,
        network:   body.network,
        message:   'Payment request sent to your phone. Approve the prompt to activate your subscription.',
      },
    });
  });

  // ── GET /billing/payment/:id ──────────────────────────
  // Check status of a pending payment
  app.get('/payment/:id', { preHandler: [authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const payment = await monimeService.getPaymentStatus(id);
    return { data: payment };
  });

  // ── POST /billing/webhook ─────────────────────────────
  // Monime calls this when a payment completes. Runs before authenticate()
  // (no user session), and writes to an arbitrary org from the (signature-
  // verified) webhook payload by design — must use the BYPASSRLS pool.
  app.post('/webhook', {
    config: { rawBody: true },
  }, async (req, reply) => {
    const signature = (req.headers['x-monime-signature'] as string) ?? '';
    const rawBody   = (req as unknown as { rawBody: string }).rawBody ?? JSON.stringify(req.body);

    if (!monimeService.verifyWebhookSignature(rawBody, signature)) {
      return reply.status(401).send({ error: 'Invalid signature' });
    }

    const payload = req.body as MonimeWebhookPayload;

    if (payload.event === 'payment.successful') {
      const meta = payload.data.metadata as Record<string, string> | undefined;
      const orgId = meta?.['org_id'];
      const plan  = meta?.['plan'] as 'starter' | 'growth' | 'business' | undefined;

      if (orgId && plan) {
        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);

        const [existing] = await app.adminDb
          .select({ id: subscriptions.id })
          .from(subscriptions)
          .where(eq(subscriptions.organizationId, orgId))
          .limit(1);

        if (existing) {
          await app.adminDb
            .update(subscriptions)
            .set({
              plan,
              status: 'active',
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
              updatedAt: now,
            })
            .where(and(eq(subscriptions.organizationId, orgId), eq(subscriptions.id, existing.id)));
        } else {
          await app.adminDb.insert(subscriptions).values({
            organizationId: orgId,
            plan,
            status: 'active',
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          });
        }

        app.log.info({ orgId, plan }, 'Subscription activated via Monime');
      }
    }

    if (payload.event === 'payment.failed' || payload.event === 'payment.cancelled') {
      const meta = payload.data.metadata as Record<string, string> | undefined;
      const orgId = meta?.['org_id'];

      // Only demote a subscription that was actively relying on this
      // payment (i.e. not still on/returning to a trial) — a failed
      // one-off POS payment (metadata carries sale_id, not a renewal)
      // must not affect the org's subscription at all.
      if (orgId && meta?.['plan']) {
        await app.adminDb
          .update(subscriptions)
          .set({ status: 'past_due', updatedAt: new Date() })
          .where(and(eq(subscriptions.organizationId, orgId), eq(subscriptions.status, 'active')));

        app.log.info({ orgId, event: payload.event }, 'Subscription marked past_due after failed payment');
      }
    }

    return reply.status(200).send({ received: true });
  });

  // ── POST /billing/pos-payment ─────────────────────────
  // Initiate a Monime payment for a POS transaction (customer pays via MoMo prompt)
  app.post('/pos-payment', { preHandler: [authenticate] }, async (req, reply) => {
    const body = z.object({
      amount:      z.number().positive(),
      phoneNumber: z.string().min(9),
      network:     z.enum(['orange_money', 'afrimoney', 'qmoney']),
      saleId:      z.string().uuid().optional(),
      description: z.string().default('Payment to LEDGERA merchant'),
    }).parse(req.body);

    const { orgId, userId } = req.user;
    const reference = `POS-${orgId.slice(0, 6).toUpperCase()}-${nanoid(10)}`;

    const payment = await monimeService.collectPayment({
      amount:      body.amount,
      currency:    'SLE',
      phoneNumber: body.phoneNumber,
      network:     body.network as MonimeNetwork,
      description: body.description,
      reference,
      callbackUrl: `${process.env['API_URL'] ?? 'http://localhost:3001'}/v1/billing/webhook`,
      metadata:    { org_id: orgId, sale_id: body.saleId ?? '' },
    });

    await logAudit(req.db, {
      organizationId: orgId,
      userId,
      action: 'create',
      resourceType: 'pos_payment',
      resourceId: payment.id,
      resourceNumber: reference,
    });

    return reply.status(201).send({
      data: {
        paymentId: payment.id,
        status:    payment.status,
        reference,
        message:   'Payment request sent. Ask customer to approve the prompt.',
      },
    });
  });
};

export default billingRoutes;
