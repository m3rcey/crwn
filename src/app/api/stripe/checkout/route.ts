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
      .select('*, artist:artist_profiles(stripe_connect_id, user_id, slug)')
      .eq('id', tierId)
      .single();

    if (tierError || !tier) {
      return NextResponse.json({ error: 'Tier not found' }, { status: 404 });
    }

    // Get fan profile
    const { data: fan } = await supabase
      .from('profiles')
      .select('id, display_name')
      .eq('id', fanId)
      .single();

    if (!fan) {
      return NextResponse.json({ error: 'Fan not found' }, { status: 404 });
    }

    // Get fan email from auth
    const { data: { user: authUser } } = await supabase.auth.admin.getUserById(fanId);
    const fanEmail = authUser?.email || '';

    // Create or retrieve Stripe customer
    const existingCustomers = await stripe.customers.list({
      email: fanEmail,
      limit: 1,
    });

    let customer;
    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: fanEmail,
        name: fan.display_name || undefined,
        metadata: {
          fan_id: fanId,
        },
      });
    }

    const artistSlug = tier.artist?.slug || tier.artist_id;

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customer.id,
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
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/artist/${artistSlug}?subscription=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/artist/${artistSlug}?subscription=canceled`,
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
