import { eq, and, sql } from 'drizzle-orm';
import type { Database } from '@ledgera/db';
import { sequences } from '@ledgera/db';

/**
 * Atomically increments a sequence and returns the next formatted number.
 * Uses a FOR UPDATE lock to prevent race conditions.
 */
export async function nextSequence(
  db: Database,
  orgId: string,
  key: string,
  prefix: string,
  padLength = 6,
): Promise<string> {
  const result = await db
    .update(sequences)
    .set({
      currentValue: sql`${sequences.currentValue} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(sequences.organizationId, orgId), eq(sequences.sequenceKey, key)))
    .returning({ next: sequences.currentValue });

  const next = result[0]?.next;
  if (!next) {
    // Bootstrap the sequence if it doesn't exist
    const [inserted] = await db
      .insert(sequences)
      .values({ organizationId: orgId, sequenceKey: key, currentValue: '1' })
      .returning({ next: sequences.currentValue });
    return `${prefix}-${String(Number(inserted?.next ?? 1)).padStart(padLength, '0')}`;
  }

  return `${prefix}-${String(Number(next)).padStart(padLength, '0')}`;
}
