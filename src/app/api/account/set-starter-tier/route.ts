import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Only allow setting starter tier — paid tiers go through Stripe checkout
  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('platform_tier, platform_subscription_status, platform_stripe_subscription_id')
    .eq('user_id', user.id)
    .single();

  if (!artist) {
    return NextResponse.json({ error: 'Artist profile not found' }, { status: 404 });
  }

  // The check this route always CLAIMED to make, and never did. Flipping the row
  // to 'starter' does not cancel anything in Stripe, so an artist on Pro who
  // picked "Start Free" kept being billed $49/mo while the product treated them
  // as free. Cancellation has to go through the cancel route, which actually
  // tells Stripe. Downgrade only happens here on the customer.subscription.deleted
  // webhook, never from a button.
  const hasPaidPlan =
    (artist.platform_tier && artist.platform_tier !== 'starter') ||
    !!artist.platform_stripe_subscription_id ||
    artist.platform_subscription_status === 'active';

  if (hasPaidPlan) {
    return NextResponse.json(
      {
        error:
          'You have a paid plan. Cancel it from Manage Subscription so billing actually stops, otherwise you would keep being charged.',
        requiresCancel: true,
      },
      { status: 409 },
    );
  }

  // artist_profiles is the single source of truth for the plan. There is no
  // profiles.platform_tier mirror: that column does not exist in production and
  // nothing reads it, so the old write here failed silently every time.
  const { error: e1 } = await supabaseAdmin
    .from('artist_profiles')
    .update({ platform_tier: 'starter' })
    .eq('user_id', user.id);

  if (e1) {
    return NextResponse.json({ error: 'Failed to set tier' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
