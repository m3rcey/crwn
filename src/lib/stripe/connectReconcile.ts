// connectReconcile.ts — SERVER ONLY. The ONE place that verifies a Stripe
// Connect account against Stripe and persists the durable truth when charges
// are enabled: the stripe_connected activation milestone, the funnel event, and
// the tier-price backfill for wizard-created tiers.
//
// Why this exists (Josh's live test, 2026-07-31): Stripe finishes Connect
// verification ASYNCHRONOUSLY. The artist connects mid-wizard, Stripe enables
// charges minutes later, and until something called /api/stripe/connect/status
// again, the milestone was never written, so every milestone-derived surface
// (the roadmap's Connect Stripe step, the quest evaluator) said "not connected"
// while Stripe said connected. Shared by the status route AND the roadmap route
// (the post-launch landing), so the truth lands within one load instead of
// whenever a polling surface happens to be opened.

import type { SupabaseClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe/client';
import { recordActivationMilestone } from '@/lib/activationMilestones';
import { recordFunnelEvent } from '@/lib/analytics/funnelEvents';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export interface StripeConnectState {
  connected: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

export const NOT_CONNECTED: StripeConnectState = {
  connected: false,
  chargesEnabled: false,
  payoutsEnabled: false,
  detailsSubmitted: false,
};

/**
 * Backfill Stripe prices for paid tiers created before Stripe was connected
 * (the onboarding wizard defers Stripe on purpose). Idempotent: only touches
 * paid tiers still missing a price, so a priced/subscribed tier is never
 * re-created.
 */
export async function backfillTierPrices(db: Db, artistId: string): Promise<void> {
  const { data: tiers } = await db
    .from('subscription_tiers')
    .select('id, name, price, offers_annual, annual_discount_percent')
    .eq('artist_id', artistId)
    .gt('price', 0)
    .is('stripe_price_id', null);

  if (!tiers || tiers.length === 0) return;

  for (const t of tiers) {
    try {
      const product = await stripe.products.create({
        name: t.name,
        metadata: { artist_id: artistId },
      });
      const monthly = await stripe.prices.create({
        product: product.id,
        unit_amount: t.price,
        currency: 'usd',
        recurring: { interval: 'month' },
      });
      let annualId: string | null = null;
      if (t.offers_annual !== false) {
        const disc = Math.min(50, Math.max(0, Math.round(Number(t.annual_discount_percent) || 0)));
        const annualAmount = Math.round(t.price * 12 * (1 - disc / 100));
        const annual = await stripe.prices.create({
          product: product.id,
          unit_amount: annualAmount,
          currency: 'usd',
          recurring: { interval: 'year' },
        });
        annualId = annual.id;
      }
      await db
        .from('subscription_tiers')
        .update({ stripe_price_id: monthly.id, stripe_annual_price_id: annualId, stripe_product_id: product.id })
        .eq('id', t.id);
    } catch (err) {
      console.error('Tier price backfill failed for tier', t.id, err);
    }
  }
}

/**
 * Retrieve the account from Stripe and, when charges are enabled, persist the
 * durable state: milestone (deduped in the DB), funnel event (deduped per
 * artist), tier-price backfill. Throws on Stripe API errors; callers decide
 * whether that means "report unknown" (status route) or "skip silently"
 * (best-effort reconcile).
 */
export async function reconcileStripeConnect(
  db: Db,
  args: { artistId: string; userId: string; connectAccountId: string },
): Promise<StripeConnectState> {
  const account = await stripe.accounts.retrieve(args.connectAccountId);
  const chargesEnabled = !!account.charges_enabled;
  const payoutsEnabled = !!account.payouts_enabled;
  const detailsSubmitted = !!account.details_submitted;

  if (chargesEnabled) {
    recordActivationMilestone(args.artistId, 'stripe_connected').catch(() => {});
    await recordFunnelEvent(db, {
      stage: 'stripe_connected',
      artistId: args.artistId,
      userId: args.userId,
      dedupeKey: args.artistId,
    });
    await backfillTierPrices(db, args.artistId);
  }

  return { connected: chargesEnabled, chargesEnabled, payoutsEnabled, detailsSubmitted };
}
