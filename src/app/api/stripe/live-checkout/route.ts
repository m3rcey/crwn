import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Stripe from 'stripe';
import { getArtistFeePercent } from '@/lib/platformTier';
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
      .select('id, artist_id, title, price, status, is_active, artist:artist_profiles(id, slug, stripe_connect_id)')
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

    const artist = session.artist as unknown as { id?: string; slug?: string; stripe_connect_id?: string };
    if (!artist?.stripe_connect_id) {
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
        application_fee_amount: platformFee,
        transfer_data: {
          destination: artist.stripe_connect_id,
        },
        metadata: {
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
