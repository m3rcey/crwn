import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rateLimit';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  try {
    const { newTierId, artistId } = await req.json();

    const supabase = await createServerSupabaseClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowed = await checkRateLimit(authUser.id, 'subscription-update', 60, 3);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const fanId = authUser.id;

    // Find active subscription
    const { data: subs, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('fan_id', fanId)
      .eq('artist_id', artistId)
      .eq('status', 'active');

    if (subError || !subs || subs.length === 0) {
      return NextResponse.json({ error: 'No active subscription found', debug: { fanId, artistId, subError } }, { status: 404 });
    }

    const currentSubscription = subs[0];

    // Get current tier price
    const { data: currentTier } = await supabaseAdmin
      .from('subscription_tiers')
      .select('price, stripe_price_id')
      .eq('id', currentSubscription.tier_id)
      .single();

    // Get new tier
    const { data: newTier, error: tierError } = await supabaseAdmin
      .from('subscription_tiers')
      .select('id, name, price, stripe_price_id, stripe_product_id')
      .eq('id', newTierId)
      .eq('is_active', true)
      .single();

    if (tierError || !newTier) {
      return NextResponse.json({ error: 'New tier not found' }, { status: 404 });
    }

    const currentTierPrice = currentTier?.price || 0;

    // Get artist stripe connect id
    const { data: artistProfile } = await supabaseAdmin
      .from('artist_profiles')
      .select('stripe_connect_id')
      .eq('id', artistId)
      .single();

    if (!artistProfile?.stripe_connect_id) {
      return NextResponse.json({ error: 'Artist not connected to Stripe' }, { status: 404 });
    }

    const stripeSubscriptionId = currentSubscription.stripe_subscription_id;
    const artistStripeConnectId = artistProfile.stripe_connect_id;

    // Get subscription items
    const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);

    const subscriptionItemId = stripeSubscription.items.data[0]?.id;
    if (!subscriptionItemId) {
      return NextResponse.json({ error: 'Could not find subscription item' }, { status: 500 });
    }

    if (newTier.price > currentTierPrice) {
      // UPGRADE: immediate with prorations
      await stripe.subscriptions.update(
        stripeSubscriptionId,
        {
          items: [{ id: subscriptionItemId, price: newTier.stripe_price_id }],
          proration_behavior: 'create_prorations',
        }
      );

      await supabaseAdmin
        .from('subscriptions')
        .update({ tier_id: newTierId, updated_at: new Date().toISOString() })
        .eq('id', currentSubscription.id);

      return NextResponse.json({ success: true });
    } else {
      // DOWNGRADE: schedule at period end
      const periodEnd = new Date((stripeSubscription as any).current_period_end * 1000);

      await supabaseAdmin
        .from('subscriptions')
        .update({
          pending_tier_id: newTierId,
          pending_change_date: periodEnd.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentSubscription.id);

      return NextResponse.json({ success: true, effectiveDate: periodEnd.toISOString() });
    }
  } catch (error: any) {
    console.error('Subscription update error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update subscription' }, { status: 500 });
  }
}
