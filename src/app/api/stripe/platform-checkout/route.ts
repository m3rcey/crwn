import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

export async function POST(request: NextRequest) {
  try {
    const { tierId, billingCycle = 'annual' } = await request.json();

    if (!tierId || !['pro', 'label', 'empire'].includes(tierId)) {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Must be logged in' }, { status: 401 });
    }

    // Get the user's artist profile
    const { data: artist } = await supabase
      .from('artist_profiles')
      .select('*, profile:profiles(*)')
      .eq('user_id', user.id)
      .single();

    if (!artist) {
      return NextResponse.json({ error: 'Artist profile not found' }, { status: 404 });
    }

    // Get or create Stripe customer
    let customerId = artist.platform_stripe_customer_id;

    if (!customerId) {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        name: artist.profile?.display_name || user.email,
        metadata: {
          artist_id: artist.id,
          user_id: user.id,
        },
      });
      customerId = customer.id;

      // Store customer ID on artist profile
      await supabase
        .from('artist_profiles')
        .update({ platform_stripe_customer_id: customerId })
        .eq('id', artist.id);
    }

    // Get price ID based on tier
    const priceId = tierId === 'pro' 
      ? process.env.STRIPE_CRWN_PRO_PRICE_ID 
      : process.env.STRIPE_CRWN_LABEL_PRICE_ID;

    if (!priceId) {
      return NextResponse.json({ error: 'Price ID not configured' }, { status: 500 });
    }

    // Create checkout session
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
      success_url: `${baseUrl}/profile/artist?tab=billing&upgrade=success`,
      cancel_url: `${baseUrl}/profile/artist?tab=billing&upgrade=cancelled`,
      metadata: {
        artist_id: artist.id,
        user_id: user.id,
        tier: tierId,
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error('Platform checkout error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Checkout failed' },
      { status: 500 }
    );
  }
}
