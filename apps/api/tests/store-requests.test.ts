import { describe, it, expect, afterAll } from 'vitest';
import { eq, and, isNull } from 'drizzle-orm';
import { adminDb, stockLevels, journalEntries, storeRequests, sales } from '@ledgera/db';
import { seedOrg, authHeaders, setProductPrice, closeSharedApp, type SeededOrg } from './helpers.js';

const yesterday = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const todayStr = () => new Date().toISOString().slice(0, 10);

let ctx: SeededOrg | undefined;
afterAll(async () => {
  await closeSharedApp();
});

async function createSale(
  ctx: SeededOrg,
  opts: { quantity: number; unitPrice: number; date?: string; expectedCollectionDate?: string },
) {
  const total = opts.quantity * opts.unitPrice;
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/v1/sales',
    headers: authHeaders(ctx.token),
    payload: {
      branchId: ctx.branchId,
      date: opts.date ?? todayStr(),
      expectedCollectionDate: opts.expectedCollectionDate,
      isCreditSale: false,
      lines: [{ productId: ctx.productId, quantity: opts.quantity, unitPrice: opts.unitPrice }],
      payments: [{ method: 'cash', amount: total }],
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json().data as Record<string, unknown>;
}

async function findStoreRequest(ctx: SeededOrg, saleId: string) {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/v1/store-requests?status=pending`,
    headers: authHeaders(ctx.token),
  });
  const rows = res.json().data as Record<string, unknown>[];
  const found = rows.find((r) => r['saleId'] === saleId);
  expect(found).toBeDefined();
  return found!;
}

async function stockQty(ctx: SeededOrg) {
  const [row] = await adminDb.select().from(stockLevels)
    .where(and(eq(stockLevels.productId, ctx.productId), eq(stockLevels.branchId, ctx.branchId), isNull(stockLevels.variantId)));
  return Number(row?.quantity ?? 0);
}

describe('store request supply — full, within grace period', () => {
  it('does not decrement stock at sale time, decrements once on supply, no reprice', async () => {
    ctx = await seedOrg();
    const sale = await createSale(ctx, { quantity: 5, unitPrice: 20 });
    expect(await stockQty(ctx)).toBe(0);

    const sr = await findStoreRequest(ctx, sale['id'] as string);
    const res = await ctx!.app.inject({
      method: 'POST',
      url: `/v1/store-requests/${sr['id']}/supply`,
      headers: authHeaders(ctx!.token),
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.storeRequest.status).toBe('supplied');
    expect(body.supply.wasRepriced).toBe(false);
    expect(await stockQty(ctx!)).toBe(-5);

    const cogsEntries = await adminDb.select().from(journalEntries)
      .where(and(eq(journalEntries.sourceType, 'store_request_supply'), eq(journalEntries.sourceId, body.supply.id)));
    expect(cogsEntries.length).toBe(1);
  });
});

describe('reprice at collection, past the grace period', () => {
  it('reprices downward and reduces amountDue', async () => {
    ctx = await seedOrg({ depositGracePeriodDays: 0 });
    const sale = await createSale(ctx, { quantity: 4, unitPrice: 20, date: yesterday() });
    await setProductPrice(ctx.productId, '15.00');

    const sr = await findStoreRequest(ctx, sale['id'] as string);
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/v1/store-requests/${sr['id']}/supply`,
      headers: authHeaders(ctx.token),
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.supply.wasRepriced).toBe(true);

    const [updatedSale] = await adminDb.select().from(sales).where(eq(sales.id, sale['id'] as string));
    expect(Number(updatedSale!.totalAmount)).toBeCloseTo(60, 2); // 4 * 15
    expect(Number(updatedSale!.amountDue)).toBeCloseTo(-20, 2); // paid 80, now owed 60 -> credit
    expect(updatedSale!.status).toBe('paid');
  });

  it('reprices upward and increases amountDue', async () => {
    ctx = await seedOrg({ depositGracePeriodDays: 0 });
    const sale = await createSale(ctx, { quantity: 4, unitPrice: 20, date: yesterday() });
    await setProductPrice(ctx.productId, '25.00');

    const sr = await findStoreRequest(ctx, sale['id'] as string);
    await ctx.app.inject({
      method: 'POST',
      url: `/v1/store-requests/${sr['id']}/supply`,
      headers: authHeaders(ctx.token),
      payload: {},
    });

    const [updatedSale] = await adminDb.select().from(sales).where(eq(sales.id, sale['id'] as string));
    expect(Number(updatedSale!.totalAmount)).toBeCloseTo(100, 2); // 4 * 25
    expect(Number(updatedSale!.amountDue)).toBeCloseTo(20, 2); // paid 80, now owes 100
    expect(updatedSale!.status).toBe('partial');
  });
});

describe('partial fulfillment', () => {
  it('supplies in two batches, each priced independently, and accumulates correctly', async () => {
    ctx = await seedOrg({ depositGracePeriodDays: 0 });
    const sale = await createSale(ctx, { quantity: 10, unitPrice: 20, date: yesterday() });
    const sr = await findStoreRequest(ctx, sale['id'] as string);
    const detail = await ctx.app.inject({ method: 'GET', url: `/v1/store-requests/${sr['id']}`, headers: authHeaders(ctx.token) });
    const lineId = (detail.json().data.lines[0] as Record<string, unknown>)['id'] as string;

    await setProductPrice(ctx.productId, '22.00');
    const first = await ctx.app.inject({
      method: 'POST',
      url: `/v1/store-requests/${sr['id']}/supply`,
      headers: authHeaders(ctx.token),
      payload: { lines: [{ storeRequestLineId: lineId, quantity: 6 }] },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().data.storeRequest.status).toBe('partially_supplied');
    expect(await stockQty(ctx)).toBe(-6);

    await setProductPrice(ctx.productId, '18.00');
    const second = await ctx.app.inject({
      method: 'POST',
      url: `/v1/store-requests/${sr['id']}/supply`,
      headers: authHeaders(ctx.token),
      payload: {},
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().data.storeRequest.status).toBe('supplied');
    expect(await stockQty(ctx)).toBe(-10);

    // delta: (22-20)*6 + (18-20)*4 = 12 - 8 = 4
    const [updatedSale] = await adminDb.select().from(sales).where(eq(sales.id, sale['id'] as string));
    expect(Number(updatedSale!.totalAmount)).toBeCloseTo(204, 2);
    expect(Number(updatedSale!.amountDue)).toBeCloseTo(4, 2);

    const priceAdjustments = await adminDb.select().from(journalEntries)
      .where(eq(journalEntries.sourceType, 'sale_reprice'));
    expect(priceAdjustments.filter((j) => j.sourceId === (sale['id'] as string)).length).toBe(2);
  });
});

describe('void with mixed supplied/pending state', () => {
  it('restores only the actually-supplied quantity, not the full original quantity', async () => {
    ctx = await seedOrg();
    const sale = await createSale(ctx, { quantity: 10, unitPrice: 20 });
    const sr = await findStoreRequest(ctx, sale['id'] as string);
    const lineId = await ctx.app.inject({
      method: 'GET', url: `/v1/store-requests/${sr['id']}`, headers: authHeaders(ctx.token),
    }).then((r) => (r.json().data.lines[0] as Record<string, unknown>)['id'] as string);

    await ctx.app.inject({
      method: 'POST',
      url: `/v1/store-requests/${sr['id']}/supply`,
      headers: authHeaders(ctx.token),
      payload: { lines: [{ storeRequestLineId: lineId, quantity: 4 }] },
    });
    expect(await stockQty(ctx)).toBe(-4);

    const voidRes = await ctx.app.inject({
      method: 'POST',
      url: `/v1/sales/${sale['id']}/void`,
      headers: authHeaders(ctx.token),
      payload: { reason: 'customer cancelled' },
    });
    expect(voidRes.statusCode).toBe(200);

    // Only the 4 that actually left should come back — not the full 10.
    expect(await stockQty(ctx)).toBe(0);

    const [updatedSale] = await adminDb.select().from(sales).where(eq(sales.id, sale['id'] as string));
    expect(updatedSale!.status).toBe('cancelled');

    const [updatedSr] = await adminDb.select().from(storeRequests).where(eq(storeRequests.id, sr['id'] as string));
    expect(updatedSr!.status).toBe('cancelled');
  });
});

describe('daily close gate', () => {
  it('blocks close while an overdue store request is unresolved, then allows it once resolved', async () => {
    ctx = await seedOrg();
    const sale = await createSale(ctx, { quantity: 1, unitPrice: 20, expectedCollectionDate: yesterday() });

    const status1 = await ctx.app.inject({ method: 'GET', url: '/v1/daily-close/status', headers: authHeaders(ctx.token) });
    expect(status1.json().data.canClose).toBe(false);
    expect(status1.json().data.unresolvedCount).toBeGreaterThanOrEqual(1);

    const closeAttempt = await ctx.app.inject({ method: 'POST', url: '/v1/daily-close', headers: authHeaders(ctx.token), payload: {} });
    expect(closeAttempt.statusCode).toBe(409);

    const sr = await findStoreRequest(ctx, sale['id'] as string);
    await ctx.app.inject({ method: 'POST', url: `/v1/store-requests/${sr['id']}/supply`, headers: authHeaders(ctx.token), payload: {} });

    const status2 = await ctx.app.inject({ method: 'GET', url: '/v1/daily-close/status', headers: authHeaders(ctx.token) });
    expect(status2.json().data.canClose).toBe(true);

    const closeOk = await ctx.app.inject({ method: 'POST', url: '/v1/daily-close', headers: authHeaders(ctx.token), payload: {} });
    expect(closeOk.statusCode).toBe(201);

    const closeAgain = await ctx.app.inject({ method: 'POST', url: '/v1/daily-close', headers: authHeaders(ctx.token), payload: {} });
    expect(closeAgain.statusCode).toBe(409);
  });
});
