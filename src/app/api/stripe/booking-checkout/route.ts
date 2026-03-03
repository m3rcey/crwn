import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

export async function POST(request: NextRequest) {
  try {
    const { sessionId, artistId } = await request.json();

    if (!sessionId || !artistId) {
      return NextResponse.json({ error: 'Missing sessionId or artistId' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();

    // Get booking session
    const { data: session, error: sessionError } = await supabase
      .from('booking_sessions')
      .select('*, artist:artist_profiles(*)')
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

    // Check if artist has Stripe Connect
    const artistStripeAccountId = (session.artist as unknown as { stripe_account_id?: string }).stripe_account_id;

    if (!artistStripeAccountId) {
      return NextResponse.json({ error: 'Artist not set up for payments' }, { status: 400 });
    }

    // Calculate platform fee (8%)
    const platformFee = Math.round(session.price * 0.08);

    // Create Stripe Checkout session
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://crwn-mauve.vercel.app';
    
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
      success_url: `${baseUrl}/artist/${session.artist.slug}/book/success?session_id={CHECKOUT_SESSION_ID}&booking_id=${session.id}`,
      cancel_url: `${baseUrl}/artist/${session.artist.slug}?tab=book`,
      metadata: {
        booking_session_id: session.id,
        buyer_id: user.id,
        artist_id: artistId,
      },
    });

    // Record purchase (pending)
    await supabase.from('booking_purchases').insert({
      booking_session_id: session.id,
      buyer_id: user.id,
      artist_id: artistId,
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
