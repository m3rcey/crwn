import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { getArtistFeePercent } from '@/lib/platformTier';
import { checkRateLimit } from '@/lib/rateLimit';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy_key_for_build');

// stripe_connect_id is not readable by anon/authenticated (it is withheld by
// column grant), and it must not be — a fan's session has no business reading the
// artist's Stripe account id. The transfer destination is looked up server-side.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // SEC-005: the request body used to carry an `artistId` that was written straight into the
    // Stripe metadata and the booking_purchases row. The money destination was never at risk (the
    // transfer always used the artist derived from the booking session), but the LEDGER was: the
    // webhook trusts that metadata into `earnings`, milestone awards and first_paid_conversion, so
    // a fan could pay artist A and credit artist B. The artist is now derived server-side from the
    // booking session, and only from there. Clients may still send the field; it is ignored.
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
    }

    // Referral attribution (capture only, no payout for one-time purchases yet).
    // Body param takes priority; fall back to the first-party crwn_ref cookie.
    const referralCode = body.referralCode || request.cookies.get('crwn_ref')?.value || '';
    const attributionSource = body.attributionSource || request.cookies.get('crwn_ref_src')?.value || '';

    const supabase = await createServerSupabaseClient();

    // Get booking session
    const { data: session, error: sessionError } = await supabase
      .from('booking_sessions')
      .select('*, artist:artist_profiles(id, slug)')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Get user's auth token from cookie
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Must be logged in' }, { status: 401 });
    }

    const allowed = await checkRateLimit(user.id, 'booking-checkout', 60, 5);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    // Check if artist has Stripe Connect. Read the account id with the admin
    // client: the caller is a fan, and fans hold no grant on that column.
    // SEC-005: this is the ONLY artist identity in this route. It comes from the booking session
    // row, so it is the artist who actually owns the session being paid for.
    const artistIdFromArtist = (session.artist as unknown as { id?: string }).id || '';

    if (!artistIdFromArtist) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const { data: connectRow } = await supabaseAdmin
      .from('artist_profiles')
      .select('stripe_connect_id')
      .eq('id', artistIdFromArtist)
      .maybeSingle();
    const artistStripeAccountId = connectRow?.stripe_connect_id;

    if (!artistStripeAccountId) {
      return NextResponse.json({ error: 'Artist not set up for payments' }, { status: 400 });
    }

    // Platform fee comes from the artist's plan (Launch 12 / Pro 8 / Scale 5)
    const platformFeePercent = await getArtistFeePercent(artistIdFromArtist);
    const platformFee = Math.round(session.price * (platformFeePercent / 100));

    // Create Stripe Checkout session
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://thecrwn.app';
    
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: session.price,
            product_data: {
              name: session.title,
              description: `${session.duration_minutes} min 1-on-1 session`,
            },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: platformFee,
        transfer_data: {
          destination: artistStripeAccountId,
        },
      },
      mode: 'payment',
      success_url: `${baseUrl}/${session.artist.slug}/book/success?session_id={CHECKOUT_SESSION_ID}&booking_id=${session.id}`,
      cancel_url: `${baseUrl}/${session.artist.slug}?tab=book`,
      metadata: {
        booking_session_id: session.id,
        buyer_id: user.id,
        // SEC-005: server-derived, never the request body.
        artist_id: artistIdFromArtist,
        referral_code: referralCode,
        attribution_source: attributionSource,
      },
    });

    // Record purchase (pending)
    await supabase.from('booking_purchases').insert({
      booking_session_id: session.id,
      buyer_id: user.id,
      // SEC-005: server-derived, never the request body.
      artist_id: artistIdFromArtist,
      stripe_checkout_session_id: checkoutSession.id,
      amount: session.price,
      platform_fee: platformFee,
      status: 'pending',
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error('Booking checkout error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Checkout failed' },
      { status: 500 }
    );
  }
}
