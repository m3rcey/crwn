import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Stripe from 'stripe';
import { getArtistFeePercent } from '@/lib/platformTier';
import { checkRateLimit } from '@/lib/rateLimit';
import { isLiveTipsEnabled, normalizeTipAmount, normalizeTipMessage } from '@/lib/live/tips';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy_key_for_build');

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// A tip on a live session. One-time Connect charge, same shape as the pre-sale
// ticket (src/app/api/stripe/live-checkout/route.ts): a pending live_tips row is
// written now and the Stripe webhook flips it to 'paid'. Only paid tips move the
// goal bar, so an abandoned checkout leaves no trace on stream.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
    }

    const amount = normalizeTipAmount(body.amount);
    if (amount === null) {
      return NextResponse.json({ error: 'Enter an amount between $1 and $500' }, { status: 400 });
    }
    const message = normalizeTipMessage(body.message);

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Must be logged in' }, { status: 401 });
    }

    // Dark launch: refuse before charging anyone if the flag is off.
    if (!(await isLiveTipsEnabled(supabaseAdmin))) {
      return NextResponse.json({ error: 'Tipping is not available yet' }, { status: 403 });
    }

    const allowed = await checkRateLimit(user.id, 'live-tip', 60, 5);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { data: session, error: sessionError } = await supabase
      .from('live_sessions')
      .select('id, artist_id, title, status, is_active, artist:artist_profiles(id, slug, user_id, stripe_connect_id)')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session || !session.is_active) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    if (session.status === 'ended') {
      return NextResponse.json({ error: 'This live has already ended' }, { status: 400 });
    }

    const artist = session.artist as unknown as {
      id?: string; slug?: string; user_id?: string; stripe_connect_id?: string;
    };
    if (!artist?.stripe_connect_id) {
      return NextResponse.json({ error: 'Artist not set up for payments' }, { status: 400 });
    }
    // An artist tipping their own stream would round-trip money through Stripe
    // and inflate their own goal bar. Block it.
    if (artist.user_id === user.id) {
      return NextResponse.json({ error: 'You cannot tip your own live' }, { status: 400 });
    }

    const platformFeePercent = await getArtistFeePercent(artist.id || '');
    const platformFee = Math.round(amount * (platformFeePercent / 100));

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://thecrwn.app';
    const metadata = {
      type: 'live_tip',
      live_session_id: session.id,
      buyer_id: user.id,
      artist_id: session.artist_id,
      tip_amount: String(amount),
    };

    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amount,
            product_data: {
              name: `Tip: ${session.title}`,
              description: 'Live tip',
            },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: platformFee,
        transfer_data: { destination: artist.stripe_connect_id },
        metadata,
      },
      mode: 'payment',
      success_url: `${baseUrl}/${artist.slug}/live/${session.id}?tip=success`,
      cancel_url: `${baseUrl}/${artist.slug}/live/${session.id}`,
      metadata,
    });

    // Record the pending tip. The message is stored now so the webhook does not
    // have to carry it through Stripe metadata (which caps at 500 chars/key).
    await supabase.from('live_tips').insert({
      session_id: session.id,
      artist_id: session.artist_id,
      fan_id: user.id,
      amount,
      platform_fee: platformFee,
      message,
      status: 'pending',
      stripe_checkout_session_id: checkoutSession.id,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error('Live tip checkout error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Checkout failed' },
      { status: 500 }
    );
  }
}
