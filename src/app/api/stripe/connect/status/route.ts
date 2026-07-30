import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getConnectAccountByUserId } from '@/lib/stripe/connectAccount';
import { stripe } from '@/lib/stripe/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { recordActivationMilestone } from '@/lib/activationMilestones';
import { recordFunnelEvent } from '@/lib/analytics/funnelEvents';

// funnel_events revokes INSERT from `authenticated`, so the funnel write below needs the
// service role. Build-safe fallbacks per CLAUDE.md.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Backfill Stripe prices for paid tiers created before Stripe was connected (e.g.
// in the onboarding wizard, which defers Stripe). Runs only once charges are
// enabled; idempotent — only touches paid tiers still missing a price, so a
// priced/subscribed tier is never re-created.
async function backfillTierPrices(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  artistId: string
) {
  const { data: tiers } = await supabase
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
      await supabase
        .from('subscription_tiers')
        .update({ stripe_price_id: monthly.id, stripe_annual_price_id: annualId, stripe_product_id: product.id })
        .eq('id', t.id);
    } catch (err) {
      console.error('Tier price backfill failed for tier', t.id, err);
    }
  }
}

// Returns the artist's real Stripe Connect status (charges_enabled), and records the
// `stripe_connected` activation milestone ONLY when the account can actually take money.
// This replaces the old behaviour of marking "connected" the instant the account object
// was created — which falsely activated artists who abandoned Stripe's onboarding and left
// the tier form unlocked on accounts that cannot receive a payment.
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: artist } = await supabase
      .from('artist_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    // The account id is read service-side: SELECT on stripe_connect_id is revoked
    // from `authenticated`, so naming it here 42501s the query above and this
    // route answered "not connected" for every artist who is.
    const connectAccountId = artist ? await getConnectAccountByUserId(user.id) : null;

    if (!connectAccountId) {
      return NextResponse.json({ connected: false, chargesEnabled: false, detailsSubmitted: false });
    }

    // Platform retrieves the Express account it owns by id (no stripeAccount param).
    const account = await stripe.accounts.retrieve(connectAccountId);
    const chargesEnabled = !!account.charges_enabled;
    const detailsSubmitted = !!account.details_submitted;

    // Only a charges-enabled account is a real, monetizable connection.
    if (chargesEnabled && artist) {
      recordActivationMilestone(artist.id, 'stripe_connected').catch(() => {});
      // Funnel: Stripe Connected. Deduped per artist at the DB, so polling this status
      // endpoint records the milestone exactly once.
      await recordFunnelEvent(supabaseAdmin, {
        stage: 'stripe_connected',
        artistId: artist.id,
        userId: user.id,
        dedupeKey: artist.id,
      });
      // Activate any onboarding-created paid tiers that are still missing Stripe prices.
      await backfillTierPrices(supabase, artist.id);
    }

    return NextResponse.json({
      connected: chargesEnabled,
      chargesEnabled,
      detailsSubmitted,
    });
  } catch (error) {
    console.error('Stripe connect status error:', error);
    return NextResponse.json(
      { connected: false, chargesEnabled: false, detailsSubmitted: false, error: 'status_check_failed' },
      { status: 200 }
    );
  }
}
