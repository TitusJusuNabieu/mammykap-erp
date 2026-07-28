/**
 * AccountingEngine — the single entry point for all journal posting.
 * No module writes directly to journal_entries or journal_lines.
 */
import { eq, and, gte, lte, sql, inArray } from 'drizzle-orm';
import type { Database } from '@ledgera/db';
import {
  journalEntries,
  journalLines,
  fiscalPeriods,
  accounts,
  sequences,
} from '@ledgera/db';
import {
  AccountingError,
  PeriodClosedError,
  NotFoundError,
  ForbiddenError,
} from '../../utils/errors.js';
import { logAudit } from '../../utils/audit.js';

export interface JournalLineInput {
  accountId: string;
  description?: string | undefined;
  debit: number;
  credit: number;
  currency?: string | undefined;
  exchangeRate?: number;
}

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface JournalPayload {
  organizationId: string;
  branchId?: string | undefined;
  date: string;                   // 'YYYY-MM-DD'
  description: string;
  sourceType: string;
  sourceId: string;
  lines: JournalLineInput[];
  createdBy?: string;
}

export class AccountingEngine {
  constructor(private readonly db: Database) {}

  async postJournal(payload: JournalPayload): Promise<{ id: string; entryNumber: string }> {
    return this.db.transaction((tx) => this.postJournalInTx(tx, payload));
  }

  private async postJournalInTx(
    tx: Tx,
    payload: JournalPayload,
  ): Promise<{ id: string; entryNumber: string }> {
    this.assertBalanced(payload.lines);

    const period = await this.getOpenPeriod(payload.organizationId, payload.date, tx);
    await this.validateAccounts(payload.organizationId, payload.lines, tx);

    const entryNumber = await this.nextEntryNumber(payload.organizationId, tx);

    const [entry] = await tx
      .insert(journalEntries)
      .values({
        organizationId: payload.organizationId,
        branchId: payload.branchId,
        fiscalPeriodId: period.id,
        entryNumber,
        date: payload.date,
        description: payload.description,
        status: 'posted',
        sourceType: payload.sourceType,
        sourceId: payload.sourceId,
        postedAt: new Date(),
        createdBy: payload.createdBy,
      })
      .returning({ id: journalEntries.id, entryNumber: journalEntries.entryNumber });

    if (!entry) throw new AccountingError('Failed to create journal entry');

    const lines = payload.lines.map((line, i) => {
      const rate = line.exchangeRate ?? 1;
      return {
        journalEntryId: entry.id,
        organizationId: payload.organizationId,
        accountId: line.accountId,
        description: line.description,
        debit: String(line.debit),
        credit: String(line.credit),
        currency: (line.currency ?? 'SLE') as 'SLE',
        exchangeRate: String(rate),
        baseDebit: String(line.debit * rate),
        baseCredit: String(line.credit * rate),
        lineNumber: i + 1,
      };
    });

    await tx.insert(journalLines).values(lines);

    await logAudit(tx, {
      organizationId: payload.organizationId,
      userId: payload.createdBy,
      action: 'create',
      resourceType: 'journal_entry',
      resourceId: entry.id,
      resourceNumber: entry.entryNumber,
    });

    return entry;
  }

  async voidJournal(
    entryId: string,
    orgId: string,
    reason: string,
    userId: string,
  ): Promise<void> {
    // Single transaction: reversing entry + original-status update must
    // commit or roll back together — a crash between the two would
    // otherwise leave the original entry marked "posted" alongside an
    // already-posted reversing entry (a double-count window).
    await this.db.transaction(async (tx) => {
      const [entry] = await tx
        .select()
        .from(journalEntries)
        .where(and(eq(journalEntries.id, entryId), eq(journalEntries.organizationId, orgId)));

      if (!entry) throw new NotFoundError('Journal entry');
      if (entry.status === 'voided') throw new AccountingError('Entry is already voided');

      const lines = await tx
        .select()
        .from(journalLines)
        .where(eq(journalLines.journalEntryId, entryId));

      await this.postJournalInTx(tx, {
        organizationId: orgId,
        branchId: entry.branchId ?? undefined,
        date: new Date().toISOString().slice(0, 10),
        description: `VOID: ${entry.description} (Reason: ${reason})`,
        sourceType: 'void',
        sourceId: entryId,
        createdBy: userId,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          description: l.description ?? undefined,
          debit: Number(l.credit),
          credit: Number(l.debit),
          currency: l.currency ?? undefined,
          exchangeRate: Number(l.exchangeRate),
        })),
      });

      await tx
        .update(journalEntries)
        .set({ status: 'voided', voidedAt: new Date(), voidedBy: userId, voidReason: reason })
        .where(eq(journalEntries.id, entryId));

      await logAudit(tx, {
        organizationId: orgId,
        userId,
        action: 'void',
        resourceType: 'journal_entry',
        resourceId: entryId,
        resourceNumber: entry.entryNumber,
        changes: { reason },
      });
    });
  }

  // ── Helpers ─────────────────────────────────────────

  private assertBalanced(lines: JournalLineInput[]) {
    if (lines.length < 2) {
      throw new AccountingError('Journal entry must have at least 2 lines');
    }
    const totalDR = lines.reduce((s, l) => s + l.debit, 0);
    const totalCR = lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalDR - totalCR) > 0.005) {
      throw new AccountingError(
        `Journal entry does not balance: DR ${totalDR.toFixed(2)} ≠ CR ${totalCR.toFixed(2)}`,
      );
    }
  }

  private async getOpenPeriod(
    orgId: string,
    date: string,
    tx: Tx,
  ) {
    const [period] = await tx
      .select()
      .from(fiscalPeriods)
      .where(
        and(
          eq(fiscalPeriods.organizationId, orgId),
          lte(fiscalPeriods.startDate, date),
          gte(fiscalPeriods.endDate, date),
          eq(fiscalPeriods.isClosed, false),
        ),
      )
      .limit(1);

    if (!period) throw new PeriodClosedError(date);
    return period;
  }

  private async validateAccounts(
    orgId: string,
    lines: JournalLineInput[],
    tx: Tx,
  ) {
    const ids = [...new Set(lines.map((l) => l.accountId))];
    const found = await tx
      .select({ id: accounts.id, isActive: accounts.isActive, organizationId: accounts.organizationId })
      .from(accounts)
      .where(inArray(accounts.id, ids));

    const byId = new Map(found.map((a) => [a.id, a]));
    for (const id of ids) {
      const acc = byId.get(id);
      if (!acc || acc.organizationId !== orgId) {
        throw new NotFoundError(`Account ${id}`);
      }
      if (!acc.isActive) {
        throw new ForbiddenError(`Account ${id} is inactive`);
      }
    }
  }

  private async nextEntryNumber(orgId: string, tx: Tx): Promise<string> {
    const [result] = await tx
      .update(sequences)
      .set({
        currentValue: sql`${sequences.currentValue} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sequences.organizationId, orgId),
          eq(sequences.sequenceKey, 'journal_entry'),
        ),
      )
      .returning({ val: sequences.currentValue });

    let n: number;
    if (result) {
      n = Number(result.val);
    } else {
      // No row yet for this org (normally pre-seeded by
      // db:seed-default-users, but not guaranteed — e.g. a fresh org
      // created some other way) — bootstrap it, same fallback pattern as
      // utils/sequence.ts's nextSequence. Without this, every call here
      // silently returns "1" forever (never persisting anything), so the
      // second journal entry ever posted for that org collides on the
      // unique entry_number index.
      const [inserted] = await tx
        .insert(sequences)
        .values({ organizationId: orgId, sequenceKey: 'journal_entry', currentValue: '1' })
        .returning({ val: sequences.currentValue });
      n = Number(inserted?.val ?? 1);
    }
    return `JE-${new Date().getFullYear()}-${String(n).padStart(6, '0')}`;
  }
}
