import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { getArtistFeePercent } from '@/lib/platformTier';
import { reserveForSaleAtomic, reserveToStripeMetadata } from '@/lib/teamSplits/reserve';
import { teamSplitMoneyKey } from '@/lib/teamSplits/moneyKey';
import { checkRateLimit } from '@/lib/rateLimit';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy_key_for_build');

// Pre-sale / paid ticket for a live session. Buying grants the fan access to the
// live even without the required tier ("ticket = access"), enforced at the
// LiveKit token mint (src/app/api/live/token/route.ts). Mirrors booking-checkout:
// a pending live_ticket_purchases row is written now, flipped to 'paid' by the
// Stripe webhook.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
    }

    // Referral attribution (capture only, no payout for one-time purchases yet).
    const referralCode = body.referralCode || request.cookies.get('crwn_ref')?.value || '';
    const attributionSource = body.attributionSource || request.cookies.get('crwn_ref_src')?.value || '';

    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Must be logged in' }, { status: 401 });
    }

    const allowed = await checkRateLimit(user.id, 'live-checkout', 60, 5);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    // Load the live session + its artist.
    const { data: session, error: sessionError } = await supabase
      .from('live_sessions')
      // No stripe_connect_id here: SELECT on it is revoked from anon/authenticated
      // and one revoked name 42501s the whole statement, embedded joins included.
      .select('id, artist_id, title, price, status, is_active, artist:artist_profiles(id, slug)')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session || !session.is_active) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status === 'ended') {
      return NextResponse.json({ error: 'This live has already ended' }, { status: 400 });
    }

    const price = session.price;
    if (!price || price <= 0) {
      return NextResponse.json({ error: 'This live is not sold as a ticket' }, { status: 400 });
    }

    const artist = session.artist as unknown as { id?: string; slug?: string };

    // Transfer destination, service-role only: the caller is a fan.
    const svcConnect = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
      process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
    );
    const { data: connectRow } = await svcConnect
      .from('artist_profiles')
      .select('stripe_connect_id')
      .eq('id', artist?.id || session.artist_id)
      .maybeSingle();
    const artistStripeAccountId = connectRow?.stripe_connect_id as string | undefined;

    if (!artistStripeAccountId) {
      return NextResponse.json({ error: 'Artist not set up for payments' }, { status: 400 });
    }

    // Already holds a paid ticket? Don't double-charge.
    const { data: existingPaid } = await supabase
      .from('live_ticket_purchases')
      .select('id')
      .eq('session_id', session.id)
      .eq('buyer_id', user.id)
      .eq('status', 'paid')
      .maybeSingle();
    if (existingPaid) {
      return NextResponse.json({ error: 'You already have a ticket for this live' }, { status: 400 });
    }

    const platformFeePercent = await getArtistFeePercent(artist.id || '');
    const platformFee = Math.round(price * (platformFeePercent / 100));

    // TEAM SPLIT FUNDED RESERVE. Withhold the collaborator's share HERE, before Stripe settles the
    // artist's proceeds. Destination charges send everything but the application fee to the
    // artist's Connect account, which Stripe then sweeps automatically, so a reserve taken any
    // later would be CRWN's own money. ONE canonical calculation: this route does no split math.
    // Never throws, and returns 0 on any failure, so a checkout cannot fail because a split could
    // not be computed. Reserving nothing simply means nobody can accrue.
    // The reservation is bound to a canonical money identity so a retry or a redelivered
    // webhook resolves to the SAME grant instead of consuming the cap twice. The Checkout
    // Session id does not exist yet, so the key is server-minted here and written into the
    // session metadata, which settlement reads back.
    const tsMoneyKey = teamSplitMoneyKey();

    const reserve = await reserveForSaleAtomic(svcConnect, {
      artistId: session.artist_id,
      sourceType: 'live_session',
      sourceId: session.id,
      grossCents: price,
      platformFeePercent,
      attributedCutPercent: 0,
    }, { kind: 'checkout_session', id: tsMoneyKey });
    const applicationFeeAmount = platformFee + reserve.reserveCents;

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://thecrwn.app';

    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: price,
            product_data: {
              name: session.title,
              description: 'Live session ticket',
            },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: applicationFeeAmount,
        transfer_data: {
          destination: artistStripeAccountId,
        },
        metadata: {
          // The per-deal reserve rides WITH the charge so settlement records PROVEN funding on
          // the earnings row rather than recomputing what checkout merely intended.
          ...reserveToStripeMetadata(reserve.reservedByDeal),
          ...(reserve.reserveCents > 0 ? { team_split_money_key: tsMoneyKey } : {}),
          live_session_id: session.id,
          buyer_id: user.id,
          artist_id: session.artist_id,
          type: 'live_ticket',
          referral_code: referralCode,
          attribution_source: attributionSource,
        },
      },
      mode: 'payment',
      success_url: `${baseUrl}/${artist.slug}/live/${session.id}?ticket=success`,
      cancel_url: `${baseUrl}/${artist.slug}?tab=live`,
      metadata: {
        live_session_id: session.id,
        buyer_id: user.id,
        artist_id: session.artist_id,
        type: 'live_ticket',
        referral_code: referralCode,
        attribution_source: attributionSource,
      },
    });

    // Record the pending ticket.
    await supabase.from('live_ticket_purchases').insert({
      session_id: session.id,
      buyer_id: user.id,
      artist_id: session.artist_id,
      stripe_checkout_session_id: checkoutSession.id,
      amount: price,
      platform_fee: platformFee,
      status: 'pending',
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error('Live checkout error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Checkout failed' },
      { status: 500 }
    );
  }
}
