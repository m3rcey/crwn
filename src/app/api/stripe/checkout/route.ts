import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getArtistFeePercent } from '@/lib/platformTier';

export async function POST(req: NextRequest) {
  try {
    const { tierId, referralCode, interval } = await req.json();
    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const fanId = user.id;

    // Get tier details — only active tiers
    const { data: tier, error: tierError } = await supabase
      .from('subscription_tiers')
      .select('*, artist:artist_profiles(stripe_connect_id, user_id, slug, platform_tier), stripe_annual_price_id')
      .eq('id', tierId)
      .eq('is_active', true)
      .single();

    if (tierError || !tier) {
      return NextResponse.json({ error: 'Tier not found' }, { status: 404 });
    }

    // Get dynamic platform fee based on artist's founding status and platform tier
    const artistId = (tier.artist as unknown as { id?: string })?.id;
    const platformFeePercent = artistId ? await getArtistFeePercent(artistId) : 8;

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
    const fanEmail = user.email || '';

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

    // Get artist display name for statement descriptor
    const { data: artistNameData } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', tier.artist?.user_id)
      .single();
    const artistDisplayName = artistNameData?.display_name || '';
    // Stripe limit: 22 chars, alphanumeric + spaces only, uppercase
    const statementSuffix = artistDisplayName
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .trim()
      .substring(0, 22)
      .toUpperCase();

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [
        {
          price: interval === 'year' ? (tier.stripe_annual_price_id || tier.stripe_price_id) : tier.stripe_price_id,
          quantity: 1,
        },
      ],
      subscription_data: {
        application_fee_percent: platformFeePercent,
        transfer_data: tier.artist?.stripe_connect_id
          ? {
              destination: tier.artist.stripe_connect_id,
            }
          : undefined,
      },
      payment_intent_data: {
        ...(statementSuffix ? { statement_descriptor_suffix: statementSuffix } : {}),
      },
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/${artistSlug}?subscription=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/${artistSlug}?subscription=canceled`,
      metadata: {
        fan_id: fanId,
        artist_id: tier.artist_id,
        tier_id: tierId,
        type: 'subscription',
        referral_code: referralCode || '',
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
