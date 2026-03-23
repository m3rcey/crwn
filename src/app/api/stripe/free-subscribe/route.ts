import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { notifyNewSubscriber } from '@/lib/notifications';
import { checkRateLimit } from '@/lib/rateLimit';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  try {
    const { tierId } = await req.json();
    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowed = await checkRateLimit(user.id, 'free-subscribe', 60, 10);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    // Verify tier exists, is active, and is free
    const { data: tier, error: tierError } = await supabaseAdmin
      .from('subscription_tiers')
      .select('id, name, price, artist_id')
      .eq('id', tierId)
      .eq('is_active', true)
      .single();

    if (tierError || !tier) {
      return NextResponse.json({ error: 'Tier not found' }, { status: 404 });
    }

    if (tier.price > 0) {
      return NextResponse.json({ error: 'This tier requires payment' }, { status: 400 });
    }

    // Check if already subscribed to this artist
    const { data: existing } = await supabaseAdmin
      .from('subscriptions')
      .select('id, tier_id')
      .eq('fan_id', user.id)
      .eq('artist_id', tier.artist_id)
      .eq('status', 'active')
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'Already subscribed', tierId: existing.tier_id }, { status: 409 });
    }

    // Create subscription record (upsert for resubscribes)
    const { error: insertError } = await supabaseAdmin
      .from('subscriptions')
      .upsert({
        fan_id: user.id,
        artist_id: tier.artist_id,
        tier_id: tier.id,
        status: 'active',
        started_at: new Date().toISOString(),
      }, { onConflict: 'fan_id,artist_id' });

    if (insertError) {
      console.error('Free subscribe error:', insertError);
      return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
    }

    // Send notification to artist
    try {
      const { data: artistProfile } = await supabaseAdmin
        .from('artist_profiles')
        .select('user_id')
        .eq('id', tier.artist_id)
        .single();

      const { data: fanProfile } = await supabaseAdmin
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single();

      if (artistProfile?.user_id) {
        await notifyNewSubscriber(
          supabaseAdmin,
          artistProfile.user_id,
          fanProfile?.display_name || 'A fan',
          tier.name
        );
      }
    } catch (e) {
      console.error('Notification error (non-fatal):', e);
    }

    return NextResponse.json({ success: true, tierId: tier.id });
  } catch (error) {
    console.error('Free subscribe error:', error);
    return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
  }
}
