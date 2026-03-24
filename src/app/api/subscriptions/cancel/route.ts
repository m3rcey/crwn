import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export async function POST(req: NextRequest) {
  try {
    const { subscriptionId, reasons, freeform, context } = await req.json();

    if (!subscriptionId || !context || !Array.isArray(reasons)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (context === 'fan') {
      // Fan canceling an artist subscription
      const { data: sub } = await supabaseAdmin
        .from('subscriptions')
        .select('id, stripe_subscription_id, fan_id, artist_id')
        .eq('id', subscriptionId)
        .eq('fan_id', user.id)
        .eq('status', 'active')
        .single();

      if (!sub?.stripe_subscription_id) {
        return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
      }

      // Save cancellation reasons
      await supabaseAdmin.from('cancellation_reasons').insert({
        subscription_id: sub.id,
        user_id: user.id,
        reasons,
        freeform: freeform || null,
        context: 'fan',
      });

      // Cancel on Stripe (end of period)
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at_period_end: true,
      });

      // Update local status
      await supabaseAdmin
        .from('subscriptions')
        .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
        .eq('id', sub.id);

      return NextResponse.json({ success: true, cancelAtPeriodEnd: true });

    } else if (context === 'platform') {
      // Artist canceling platform subscription
      const { data: artist } = await supabaseAdmin
        .from('artist_profiles')
        .select('id, platform_stripe_subscription_id')
        .eq('user_id', user.id)
        .single();

      if (!artist?.platform_stripe_subscription_id) {
        return NextResponse.json({ error: 'No active platform subscription' }, { status: 404 });
      }

      // Save cancellation reasons
      await supabaseAdmin.from('cancellation_reasons').insert({
        artist_profile_id: artist.id,
        user_id: user.id,
        reasons,
        freeform: freeform || null,
        context: 'platform',
      });

      // Cancel on Stripe (end of period)
      await stripe.subscriptions.update(artist.platform_stripe_subscription_id, {
        cancel_at_period_end: true,
      });

      return NextResponse.json({ success: true, cancelAtPeriodEnd: true });

    } else {
      return NextResponse.json({ error: 'Invalid context' }, { status: 400 });
    }
  } catch (error: unknown) {
    console.error('Cancel subscription error:', error);
    const message = error instanceof Error ? error.message : 'Failed to cancel';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
