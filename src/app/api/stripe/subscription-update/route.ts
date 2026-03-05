import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

export async function POST(request: NextRequest) {
  try {
    const { newTierId, artistId } = await request.json();

    if (!newTierId || !artistId) {
      return NextResponse.json({ error: 'Missing newTierId or artistId' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Must be logged in' }, { status: 401 });
    }

    // Get user's current subscription
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*, tier:subscription_tiers(price)')
      .eq('fan_id', user.id)
      .eq('artist_id', artistId)
      .eq('status', 'active')
      .single();

    if (subError || !subscription) {
      return NextResponse.json({ error: 'No active subscription found' }, { status: 404 });
    }

    // Get new tier details
    const { data: newTier, error: tierError } = await supabase
      .from('subscription_tiers')
      .select('*, artist:artist_profiles(stripe_connect_id)')
      .eq('id', newTierId)
      .single();

    if (tierError || !newTier) {
      return NextResponse.json({ error: 'New tier not found' }, { status: 404 });
    }

    const artistStripeConnectId = (newTier.artist as unknown as { stripe_connect_id?: string })?.stripe_connect_id;

    if (!artistStripeConnectId) {
      return NextResponse.json({ error: 'Artist not connected to Stripe' }, { status: 400 });
    }

    // Get current tier price
    const currentTierPrice = (subscription.tier as unknown as { price: number })?.price || 0;
    const newTierPrice = newTier.price;

    // Determine upgrade vs downgrade
    const isUpgrade = newTierPrice > currentTierPrice;

    if (isUpgrade) {
      // Upgrade - apply immediately with proration
      const updatedSubscription = await stripe.subscriptions.update(
        subscription.stripe_subscription_id,
        {
          items: [{
            id: subscription.stripe_subscription_id, // This needs the subscription item ID
            price: newTier.stripe_price_id,
          }],
          proration_behavior: 'create_prorations',
        },
        { stripeAccount: artistStripeConnectId }
      );

      // Update DB
      await supabase
        .from('subscriptions')
        .update({ 
          tier_id: newTierId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscription.id);

      return NextResponse.json({ success: true });
    } else {
      // Downgrade - schedule for end of billing period
      // First get the subscription to find the item ID
      const stripeSub = await stripe.subscriptions.retrieve(
        subscription.stripe_subscription_id,
        { stripeAccount: artistStripeConnectId }
      ) as unknown as { items: { data: { id: string }[] }; current_period_end: number };

      const itemId = stripeSub.items?.data?.[0]?.id;

      // Update with cancel_at_period_end approach
      const updatedSubscription = await stripe.subscriptions.update(
        subscription.stripe_subscription_id,
        {
          items: itemId ? [{
            id: itemId,
            price: newTier.stripe_price_id,
          }] : undefined,
          proration_behavior: 'none',
        },
        { stripeAccount: artistStripeConnectId }
      ) as unknown as { current_period_end: number };

      const periodEnd = new Date(updatedSubscription.current_period_end * 1000).toISOString();

      // Update DB with pending change
      await supabase
        .from('subscriptions')
        .update({ 
          pending_tier_id: newTierId,
          pending_change_date: periodEnd,
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscription.id);

      return NextResponse.json({ 
        success: true, 
        effectiveDate: periodEnd 
      });
    }
  } catch (error) {
    console.error('Subscription update error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Update failed' },
      { status: 500 }
    );
  }
}
