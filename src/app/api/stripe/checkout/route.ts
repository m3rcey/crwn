import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const PLATFORM_FEE_PERCENT = 0.08; // 8%

export async function POST(req: NextRequest) {
  try {
    const { tierId, fanId } = await req.json();

    const supabase = await createServerSupabaseClient();

    // Get tier details
    const { data: tier, error: tierError } = await supabase
      .from('subscription_tiers')
      .select('*, artist:artist_profiles(stripe_connect_id, user_id)')
      .eq('id', tierId)
      .single();

    if (tierError || !tier) {
      return NextResponse.json({ error: 'Tier not found' }, { status: 404 });
    }

    // Get fan profile for customer email
    const { data: fan } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', fanId)
      .single();

    if (!fan) {
      return NextResponse.json({ error: 'Fan not found' }, { status: 404 });
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: tier.stripe_price_id,
          quantity: 1,
        },
      ],
      subscription_data: {
        application_fee_percent: PLATFORM_FEE_PERCENT * 100,
        transfer_data: tier.artist?.stripe_connect_id
          ? {
              destination: tier.artist.stripe_connect_id,
            }
          : undefined,
      },
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/artist/${tier.artist_id}?subscription=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/artist/${tier.artist_id}?subscription=canceled`,
      metadata: {
        fan_id: fanId,
        artist_id: tier.artist_id,
        tier_id: tierId,
      },
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
