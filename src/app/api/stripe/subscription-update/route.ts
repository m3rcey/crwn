import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build';

// Admin client bypasses RLS for server-side queries
const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export async function POST(req: NextRequest) {
  try {
    const { newTierId, artistId } = await req.json();
    
    // Get authenticated user
    const supabase = await createServerSupabaseClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const fanId = authUser.id;
    console.log('[subscription-update] fanId:', fanId, 'artistId:', artistId);

    // Get the fan's current subscription using admin client (bypasses RLS)
    const { data: currentSubscription, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('*, tier:subscription_tiers(price)')
      .eq('fan_id', fanId)
      .eq('artist_id', artistId)
      .eq('status', 'active')
      .single();

    console.log('[subscription-update] Subscription query:', { fanId, artistId, currentSubscription, subError });

    if (subError || !currentSubscription) {
      return NextResponse.json({ error: 'No active subscription found' }, { status: 404 });
    }

    // Get the new tier details
    const { data: newTier, error: tierError } = await supabaseAdmin
      .from('subscription_tiers')
      .select('id, name, price, stripe_price_id, stripe_product_id')
      .eq('id', newTierId)
      .eq('is_active', true)
      .single();

    if (tierError || !newTier) {
      return NextResponse.json({ error: 'New tier not found or inactive' }, { status: 404 });
    }

    // Get current tier price
    const currentTierPrice = (currentSubscription.tier as unknown as { price: number })?.price || 0;

    // Get artist's stripe_connect_id
    const { data: artistProfile, error: artistError } = await supabaseAdmin
      .from('artist_profiles')
      .select('stripe_connect_id')
      .eq('id', artistId)
      .single();

    if (artistError || !artistProfile?.stripe_connect_id) {
      return NextResponse.json({ error: 'Artist not found or not connected to Stripe' }, { status: 404 });
    }

    const stripeSubscriptionId = currentSubscription.stripe_subscription_id;
    const artistStripeConnectId = artistProfile.stripe_connect_id;

    // Get subscription items to find the item ID to update
    const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
      stripeAccount: artistStripeConnectId,
    }) as unknown as {
      items: { data: Array<{ id: string }> };
      current_period_start: number;
      current_period_end: number;
    };

    const subscriptionItemId = stripeSubscription.items.data[0]?.id;
    if (!subscriptionItemId) {
      return NextResponse.json({ error: 'Could not find subscription item' }, { status: 500 });
    }

    // Determine if upgrade or downgrade
    if (newTier.price > currentTierPrice) {
      // UPGRADE: Apply immediately with prorations
      await stripe.subscriptions.update(
        stripeSubscriptionId,
        {
          items: [{ id: subscriptionItemId, price: newTier.stripe_price_id }],
          proration_behavior: 'create_prorations',
        },
        { stripeAccount: artistStripeConnectId }
      );

      // Update DB with new tier
      await supabaseAdmin
        .from('subscriptions')
        .update({
          tier_id: newTierId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentSubscription.id);

      return NextResponse.json({ success: true });
    } else {
      // DOWNGRADE: Schedule for end of billing period
      // First, get the current subscription to access period dates
      const currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
      const currentPeriodStart = new Date(stripeSubscription.current_period_start * 1000);

      // Create a subscription schedule to apply change at period end
      const schedule = await stripe.subscriptionSchedules.create(
        {
          from_subscription: stripeSubscriptionId,
        },
        { stripeAccount: artistStripeConnectId }
      );

      // Update the schedule with two phases: current tier until period end, then new tier
      await stripe.subscriptionSchedules.update(
        schedule.id,
        {
          phases: [
            {
              items: [{ price: currentSubscription.tier_id }],
              start_date: Math.floor(currentPeriodStart.getTime() / 1000),
              end_date: Math.floor(currentPeriodEnd.getTime() / 1000),
            },
            {
              items: [{ price: newTier.stripe_price_id }],
              start_date: Math.floor(currentPeriodEnd.getTime() / 1000),
            },
          ],
        },
        { stripeAccount: artistStripeConnectId }
      );

      // Update DB with pending tier change
      await supabaseAdmin
        .from('subscriptions')
        .update({
          pending_tier_id: newTierId,
          pending_change_date: currentPeriodEnd.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentSubscription.id);

      return NextResponse.json({ 
        success: true, 
        effectiveDate: currentPeriodEnd.toISOString() 
      });
    }
  } catch (error) {
    console.error('Subscription update error:', error);
    return NextResponse.json(
      { error: 'Failed to update subscription' },
      { status: 500 }
    );
  }
}
