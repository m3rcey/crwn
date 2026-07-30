// The ONE code path that turns a recommended-ladder rung into a real tier.
//
// Shared by Rise Mode Level 3 (TierLadderTemplate) and the setup wizard's
// ladder-confirm screen (Launch Wizard Stage 2), so tier creation and the
// Promise Calendar seeding can never drift apart:
//  - paid tiers get Stripe prices now when connected, else null ids that
//    backfillTierPrices() fills when the artist connects Stripe
//  - structured benefits route through /api/tier-benefits, which also runs
//    syncTierObligations to create the recurring fulfillment obligations
//    (Gold's monthly Vault unlock, Platinum's quarterly listening event)

import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { structuredBenefits, type TierTemplateDef } from '@/lib/tierTemplate';

type Supa = ReturnType<typeof createBrowserSupabaseClient>;

export interface ApplyTierInput {
  artistId: string;
  stripeConnected: boolean;
  def: TierTemplateDef;
  /** Possibly artist-edited name/price/description/benefits (defaults = the template). */
  name: string;
  priceCents: number;
  description: string;
  benefits: string[];
}

export async function applyTemplateTier(supabase: Supa, input: ApplyTierInput): Promise<{ error?: string }> {
  const { artistId, stripeConnected, def, name, priceCents, description, benefits } = input;
  const isPaid = priceCents > 0;

  try {
    let stripePriceId: string | null = null;
    let stripeAnnualPriceId: string | null = null;
    let stripeProductId: string | null = null;

    if (isPaid && stripeConnected) {
      const res = await fetch('/api/stripe/create-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          price: priceCents,
          description,
          artistId,
          offersAnnual: true,
          annualDiscountPercent: 25,
        }),
      });
      const data = await res.json();
      stripePriceId = data.stripePriceId ?? null;
      stripeAnnualPriceId = data.stripeAnnualPriceId ?? null;
      stripeProductId = data.stripeProductId ?? null;
    }

    const { data: created, error } = await supabase
      .from('subscription_tiers')
      .insert({
        artist_id: artistId,
        name,
        price: priceCents,
        description,
        access_config: { benefits: benefits.filter((b) => b.trim() !== '') },
        stripe_price_id: stripePriceId,
        stripe_annual_price_id: stripeAnnualPriceId,
        stripe_product_id: stripeProductId,
        offers_annual: true,
        annual_discount_percent: 25,
      })
      .select('id')
      .single();

    if (error) throw error;

    const structured = structuredBenefits(def);
    if (created && structured.length > 0) {
      // Best-effort: a benefits/calendar hiccup must not undo the tier.
      try {
        await fetch('/api/tier-benefits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tier_id: created.id,
            benefits: structured.map((b, i) => ({
              benefit_type: b.benefit_type,
              config: b.config || {},
              sort_order: i,
            })),
          }),
        });
      } catch (benefitErr) {
        console.error('Tier benefits/calendar sync failed (tier still created):', benefitErr);
      }
    }

    fetch('/api/admin/milestone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ milestone: 'tiers_created' }),
    }).catch(() => {});

    return {};
  } catch (err) {
    console.error('Apply tier failed:', err);
    return { error: err instanceof Error ? err.message : 'Could not add that tier. Please try again.' };
  }
}
