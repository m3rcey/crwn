// recurringValue.ts - what ONE paying membership is worth per month. The ONE rule behind MRR.
//
// THE BUG THIS FIXES (found 2026-10-03). Every MRR reader (constraint assembler, roadmap stats,
// /api/analytics, the Revenue Ramp bar) summed each paying member's TIER LIST PRICE. The tier
// price is the MONTHLY price, so an annual member was counted at the monthly sticker: Prince
// Dre's annual Platinum fan pays $444 a year ($37 a month) and was counted as $50. Annual is the
// default on his checkout, so the first annual sale would have overstated his MRR on Home,
// Analytics and the Constraint Engine's depth signal. A member kept on an old price after an
// artist raises a tier was overstated the same way.
//
// THE RULE. A membership is worth what Stripe actually bills for it, normalized to a month:
//   billing_interval 'month' -> billed_amount_cents
//   billing_interval 'year'  -> billed_amount_cents / 12
// Both columns are raw facts copied from Stripe's own price object by the webhook (checkout
// completed, and every customer.subscription.updated). Nothing derived is stored. When CRWN has
// not recorded them (rows from before the columns existed, or the migration not yet applied) the
// value falls back to the tier price, which is exactly the old behaviour, so this can only make
// a number more true, never break one.
//
// Deliberately NOT here: who counts as paying. That is `countsAsPaying` (prizeState.ts), which
// every reader still calls first. This module only answers "how much is a paying one worth".
// Discount codes are not netted: the billed amount is the recurring PRICE, the same basis the
// list-price rule used, and a once-off coupon must not shrink every later month.

import type { SupabaseClient } from '@supabase/supabase-js';

export type BillingInterval = 'month' | 'year';

/** The two raw facts, as they sit on a `subscriptions` row. Both optional: they may not exist. */
export interface BillingFacts {
  billing_interval?: string | null;
  billed_amount_cents?: number | null;
}

/** Per-month value of one PAYING membership, in cents. Call countsAsPaying first. */
export function monthlyValueCents(s: BillingFacts, tierPriceCents: number): number {
  const billed = s.billed_amount_cents;
  if (typeof billed === 'number' && Number.isFinite(billed) && billed > 0) {
    if (s.billing_interval === 'month') return Math.round(billed);
    if (s.billing_interval === 'year') return Math.round(billed / 12);
  }
  return tierPriceCents;
}

/** Stripe's price + quantity -> the two facts, or null when they cannot be stated honestly. */
export function billingFactsFromStripe(
  price: { unit_amount?: number | null; recurring?: { interval?: string | null; interval_count?: number | null } | null } | null | undefined,
  quantity?: number | null,
): { billing_interval: BillingInterval; billed_amount_cents: number } | null {
  if (!price) return null;
  const interval = price.recurring?.interval;
  const count = price.recurring?.interval_count ?? 1;
  const unit = price.unit_amount;
  // Only the two shapes CRWN sells. A 3-month or weekly price would be mis-normalized, so it is
  // left unrecorded and the reader falls back to the tier price.
  if ((interval !== 'month' && interval !== 'year') || count !== 1) return null;
  if (typeof unit !== 'number' || !Number.isFinite(unit) || unit < 0) return null;
  const qty = typeof quantity === 'number' && quantity > 0 ? quantity : 1;
  return { billing_interval: interval, billed_amount_cents: Math.round(unit * qty) };
}

// Structural, so both a SupabaseClient and the narrow `{ from }` clients some modules pass work.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = Pick<SupabaseClient<any, any, any>, 'from'> | { from: (table: string) => any };

/**
 * Adds the billing facts to rows a reader already loaded, in ONE extra query. Tolerant on
 * purpose: if the columns do not exist yet (migration pending) or the read fails, the rows come
 * back unchanged and every value falls back to the tier price. It is a SEPARATE query rather than
 * two more names in each reader's own select because naming a missing column fails the whole
 * statement (42703), and several readers treat a failed read as "no subscriptions".
 */
export async function attachBillingFacts<T extends { id?: string | null }>(db: Db, rows: T[]): Promise<(T & BillingFacts)[]> {
  const ids = [...new Set(rows.map((r) => r.id).filter((v): v is string => typeof v === 'string' && v.length > 0))];
  if (ids.length === 0) return rows;
  try {
    const facts = new Map<string, BillingFacts>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await db
        .from('subscriptions')
        .select('id, billing_interval, billed_amount_cents')
        .in('id', ids.slice(i, i + 200));
      if (error) return rows;
      for (const r of (data ?? []) as Array<{ id: string } & BillingFacts>) {
        facts.set(r.id, { billing_interval: r.billing_interval ?? null, billed_amount_cents: r.billed_amount_cents ?? null });
      }
    }
    return rows.map((r) => (r.id && facts.has(r.id) ? { ...r, ...facts.get(r.id) } : r));
  } catch {
    return rows;
  }
}

/**
 * Webhook-side writer. A SEPARATE update from the handler's own, so a pending migration (42703)
 * can never fail the subscription upsert that grants the fan access. Never throws.
 *
 * `null` facts CLEAR the columns rather than skip the write. A rejoining fan's row is upserted in
 * place, so skipping would leave the PREVIOUS subscription's interval and amount on it; cleared,
 * the reader falls back to the tier price, which is never worse than today.
 */
export async function recordSubscriptionBilling(
  db: Db,
  stripeSubscriptionId: string | null | undefined,
  facts: { billing_interval: BillingInterval; billed_amount_cents: number } | null,
): Promise<void> {
  if (!stripeSubscriptionId) return;
  try {
    const { error } = await db
      .from('subscriptions')
      .update({
        billing_interval: facts?.billing_interval ?? null,
        billed_amount_cents: facts?.billed_amount_cents ?? null,
      })
      .eq('stripe_subscription_id', stripeSubscriptionId);
    // 42703: the columns do not exist yet. Expected until the migration runs; the reader falls
    // back to the tier price meanwhile.
    if (error && error.code !== '42703') {
      console.error('recordSubscriptionBilling failed:', error.code, error.message);
    }
  } catch (err) {
    console.error('recordSubscriptionBilling threw:', err);
  }
}
