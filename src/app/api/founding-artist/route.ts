import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
const FOUNDING_LIMIT = 50;
export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // Look up artist profile
    const { data: artist } = await supabaseAdmin
      .from('artist_profiles')
      .select('id, is_founding_artist, founding_artist_number, user_id')
      .eq('user_id', userId)
      .single();

    if (!artist) {
      return NextResponse.json({ error: 'Artist profile not found' }, { status: 404 });
    }

    if (artist.is_founding_artist) {
      return NextResponse.json({
        isFoundingArtist: true,
        number: artist.founding_artist_number,
      });
    }

    // Count current founding artists
    const { count } = await supabaseAdmin
      .from('artist_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('is_founding_artist', true);

    const currentCount = count || 0;

    if (currentCount >= FOUNDING_LIMIT) {
      return NextResponse.json({ isFoundingArtist: false, spotsLeft: 0 });
    }

    const foundingNumber = currentCount + 1;

    // Get user email for Stripe customer
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .single();

    const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = user?.email || '';

    // Get or create Stripe customer
    let customerId: string | undefined;
    const { data: existingArtist } = await supabaseAdmin
      .from('artist_profiles')
      .select('platform_stripe_customer_id')
      .eq('id', artist.id)
      .single();

    customerId = existingArtist?.platform_stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        name: profile?.display_name || email,
        metadata: {
          artist_id: artist.id,
          user_id: userId,
        },
      });
      customerId = customer.id;

      await supabaseAdmin
        .from('artist_profiles')
        .update({ platform_stripe_customer_id: customerId })
        .eq('id', artist.id);
    }

    // Create Stripe Checkout with 3-month trial
    const priceId = process.env.STRIPE_CRWN_PRO_PRICE_ID;
    if (!priceId) {
      return NextResponse.json({ error: 'Pro price ID not configured' }, { status: 500 });
    }

    const trialEnd = new Date();
    trialEnd.setMonth(trialEnd.getMonth() + 1);

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://thecrwn.app';

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_end: Math.floor(trialEnd.getTime() / 1000),
      },
      success_url: `${baseUrl}/home?founding=success`,
      cancel_url: `${baseUrl}/home?founding=cancelled`,
      metadata: {
        artist_id: artist.id,
        user_id: userId,
        tier: 'pro',
        founding_artist: 'true',
        founding_number: foundingNumber.toString(),
      },
    });

    return NextResponse.json({
      url: checkoutSession.url,
      foundingNumber,
      spotsLeft: FOUNDING_LIMIT - foundingNumber,
    });
  } catch (error) {
    console.error('Founding artist checkout error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Checkout failed' },
      { status: 500 }
    );
  }
}

// GET endpoint for artist count (used by homepage)
export async function GET() {
  const { count } = await supabaseAdmin
    .from('artist_profiles')
    .select('id', { count: 'exact', head: true });

  const { count: foundingCount } = await supabaseAdmin
    .from('artist_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('is_founding_artist', true);

  return NextResponse.json({
    totalArtists: count || 0,
    foundingArtists: foundingCount || 0,
    spotsLeft: Math.max(0, FOUNDING_LIMIT - (foundingCount || 0)),
    limit: FOUNDING_LIMIT,
  });
}
