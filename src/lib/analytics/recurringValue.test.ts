import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  monthlyValueCents,
  billingFactsFromStripe,
  attachBillingFacts,
  recordSubscriptionBilling,
} from './recurringValue';

describe('monthlyValueCents: what one paying membership is worth a month', () => {
  it("an annual member counts at a twelfth of what they pay (Prince Dre's Platinum: $444/yr is $37, not $50)", () => {
    expect(monthlyValueCents({ billing_interval: 'year', billed_amount_cents: 44400 }, 5000)).toBe(3700);
  });

  it('a monthly member counts at what Stripe bills, even after the artist raised the tier', () => {
    expect(monthlyValueCents({ billing_interval: 'month', billed_amount_cents: 1000 }, 1200)).toBe(1000);
  });

  it('with nothing recorded it is exactly the old list-price number', () => {
    expect(monthlyValueCents({}, 2500)).toBe(2500);
    expect(monthlyValueCents({ billing_interval: null, billed_amount_cents: null }, 2500)).toBe(2500);
  });

  it('an unrecognized or half-recorded fact falls back rather than guessing', () => {
    expect(monthlyValueCents({ billing_interval: 'week', billed_amount_cents: 500 }, 2500)).toBe(2500);
    expect(monthlyValueCents({ billing_interval: 'year', billed_amount_cents: null }, 2500)).toBe(2500);
    expect(monthlyValueCents({ billing_interval: 'month', billed_amount_cents: 0 }, 2500)).toBe(2500);
    expect(monthlyValueCents({ billing_interval: 'month', billed_amount_cents: Number.NaN }, 2500)).toBe(2500);
  });
});

describe("billingFactsFromStripe: Stripe's own price object, nothing else", () => {
  it('reads the two shapes CRWN sells', () => {
    expect(billingFactsFromStripe({ unit_amount: 44400, recurring: { interval: 'year', interval_count: 1 } }, 1))
      .toEqual({ billing_interval: 'year', billed_amount_cents: 44400 });
    expect(billingFactsFromStripe({ unit_amount: 1000, recurring: { interval: 'month' } }))
      .toEqual({ billing_interval: 'month', billed_amount_cents: 1000 });
  });

  it('multiplies by quantity', () => {
    expect(billingFactsFromStripe({ unit_amount: 1000, recurring: { interval: 'month' } }, 2)?.billed_amount_cents).toBe(2000);
  });

  it('refuses shapes it would mis-normalize', () => {
    expect(billingFactsFromStripe({ unit_amount: 3000, recurring: { interval: 'month', interval_count: 3 } })).toBeNull();
    expect(billingFactsFromStripe({ unit_amount: 300, recurring: { interval: 'week' } })).toBeNull();
    expect(billingFactsFromStripe({ unit_amount: 1000, recurring: null })).toBeNull();
    expect(billingFactsFromStripe({ unit_amount: null, recurring: { interval: 'month' } })).toBeNull();
    expect(billingFactsFromStripe(null)).toBeNull();
  });
});

function fakeDb(result: { data?: unknown; error?: unknown }) {
  const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: result.error ?? null })) }));
  const select = vi.fn(() => ({ in: vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null })) }));
  const from = vi.fn(() => ({ select, update }));
  return { db: { from }, from, select, update };
}

describe('attachBillingFacts: tolerant by construction', () => {
  it('merges the facts onto the rows the reader already has', async () => {
    const { db } = fakeDb({ data: [{ id: 'a', billing_interval: 'year', billed_amount_cents: 44400 }] });
    const rows = await attachBillingFacts(db, [{ id: 'a', tier_id: 't' }, { id: 'b', tier_id: 't' }]);
    expect(rows[0]).toMatchObject({ id: 'a', tier_id: 't', billing_interval: 'year', billed_amount_cents: 44400 });
    expect(rows[1]).toEqual({ id: 'b', tier_id: 't' });
  });

  it('returns the rows untouched when the columns do not exist yet (migration pending)', async () => {
    const { db } = fakeDb({ error: { code: '42703', message: 'column does not exist' } });
    const input = [{ id: 'a', tier_id: 't' }];
    expect(await attachBillingFacts(db, input)).toEqual(input);
  });

  it('asks nothing when there is nothing to ask about', async () => {
    const { db, from } = fakeDb({});
    expect(await attachBillingFacts(db, [])).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });
});

describe('recordSubscriptionBilling: never costs the fan their membership', () => {
  it('writes the facts', async () => {
    const { db, update } = fakeDb({});
    await recordSubscriptionBilling(db, 'sub_1', { billing_interval: 'year', billed_amount_cents: 44400 });
    expect(update).toHaveBeenCalledWith({ billing_interval: 'year', billed_amount_cents: 44400 });
  });

  it("CLEARS on null, so a rejoining fan's row cannot keep the previous subscription's facts", async () => {
    const { db, update } = fakeDb({});
    await recordSubscriptionBilling(db, 'sub_1', null);
    expect(update).toHaveBeenCalledWith({ billing_interval: null, billed_amount_cents: null });
  });

  it('swallows a pending migration and never throws', async () => {
    const { db } = fakeDb({ error: { code: '42703', message: 'missing' } });
    await expect(recordSubscriptionBilling(db, 'sub_1', null)).resolves.toBeUndefined();
    const throwing = { from: () => { throw new Error('boom'); } };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(recordSubscriptionBilling(throwing, 'sub_1', null)).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------------------------
// Wiring. Comments stripped, so prose explaining the old bug is not read as the bug.
// ---------------------------------------------------------------------------------------------
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const read = (p: string) => strip(readFileSync(p, 'utf8'));

describe('every MRR reader uses the ONE rule', () => {
  const readers: Record<string, string> = {
    assembler: read('src/lib/constraint/assembler.ts'),
    roadmap: read('src/app/api/artist/roadmap/route.ts'),
    analytics: read('src/app/api/analytics/route.ts'),
    revenueRamp: read('src/lib/revenueRampSeed.ts'),
  };

  for (const [name, src] of Object.entries(readers)) {
    it(`${name}: who pays comes from countsAsPaying, what they are worth from monthlyValueCents`, () => {
      expect(src).toContain('countsAsPaying(');
      expect(src).toContain('monthlyValueCents(');
      expect(src).toContain('attachBillingFacts(');
    });
  }

  it('no reader sums a raw tier price into MRR any more', () => {
    expect(readers.assembler).not.toMatch(/mrrCents = paid\.reduce\(\(sum, s\) => sum \+ priceOf\(s\)/);
    expect(readers.roadmap).not.toMatch(/mrrCents \+= price;/);
    expect(readers.analytics).not.toMatch(/sum \+ \(tierMap\[s\.tier_id\]\?\.price \|\| 0\), 0\)/);
  });

  it('no reader names the new columns in its OWN select (42703 would blank its whole read)', () => {
    for (const src of Object.values(readers)) {
      expect(src).not.toMatch(/select\([^)]*billing_interval/);
    }
  });
});

describe('the webhook records what Stripe bills without risking the grant', () => {
  const wh = read('src/lib/webhookHandlers.ts');
  const checkout = wh.slice(wh.indexOf('export async function handleCheckoutCompleted'), wh.indexOf('export async function', wh.indexOf('export async function handleCheckoutCompleted') + 10));
  const updated = wh.slice(wh.indexOf('export async function handleSubscriptionUpdated'), wh.indexOf('export async function handleSubscriptionDeleted'));

  it('the subscription upsert never names the billing columns', () => {
    const insert = checkout.slice(checkout.indexOf('const insertData'), checkout.indexOf("from('subscriptions').upsert"));
    expect(insert).not.toMatch(/billing_interval|billed_amount_cents/);
  });

  it('checkout records billing AFTER the upsert, from a Stripe retrieve', () => {
    const upsertAt = checkout.indexOf("from('subscriptions').upsert");
    const recordAt = checkout.indexOf('recordSubscriptionBilling(');
    expect(upsertAt).toBeGreaterThan(-1);
    expect(recordAt).toBeGreaterThan(upsertAt);
    expect(checkout).toContain('stripe.subscriptions.retrieve(');
  });

  it('every subscription update records billing before its early return', () => {
    const recordAt = updated.indexOf('recordSubscriptionBilling(');
    const firstReturn = updated.indexOf('return;');
    expect(recordAt).toBeGreaterThan(-1);
    expect(recordAt).toBeLessThan(firstReturn);
  });
});
