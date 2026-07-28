import cron from 'node-cron';
import { and, eq, lt } from 'drizzle-orm';
import { adminDb, subscriptions } from '@ledgera/db';

const GRACE_PERIOD_DAYS = 7;

/**
 * Transitions past_due -> cancelled once the grace period has elapsed.
 * This is where the actual grace-period business logic lives — the
 * request-time subscription check (middleware/subscription.ts) deliberately
 * lets `past_due` orgs keep working; only this job hard-cancels them.
 * No-op in `dedicated` deployments (billed by contract, not gated here).
 */
export async function runSubscriptionGracePeriodSweep(): Promise<void> {
  if (process.env['DEPLOYMENT_MODE'] === 'dedicated') return;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - GRACE_PERIOD_DAYS);

  const result = await adminDb
    .update(subscriptions)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(and(eq(subscriptions.status, 'past_due'), lt(subscriptions.updatedAt, cutoff)))
    .returning({ id: subscriptions.id, organizationId: subscriptions.organizationId });

  if (result.length > 0) {
    console.log(`[subscription-grace-period] cancelled ${result.length} subscription(s) past grace period`);
  }
}

/** Registers the daily sweep. Call once at server startup. */
export function scheduleSubscriptionGracePeriodSweep(): void {
  if (process.env['DEPLOYMENT_MODE'] === 'dedicated') return;
  cron.schedule('0 3 * * *', () => {
    runSubscriptionGracePeriodSweep().catch((err) => {
      console.error('[subscription-grace-period] sweep failed', err);
    });
  });
}
