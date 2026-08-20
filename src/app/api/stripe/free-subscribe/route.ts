import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { notifyNewSubscriber } from '@/lib/notifications';
import { checkRateLimit } from '@/lib/rateLimit';
import { joinFreeTier } from '@/lib/subscriptions/freeJoin';

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

    // Canonical free enrollment (validates tier, checks existing membership, upserts with
    // the synthetic free_ subscription id production's NOT NULL column requires).
    const result = await joinFreeTier(supabaseAdmin, user.id, tierId);

    if (result.status === 'error') {
      if (result.reason === 'tier_not_found') {
        return NextResponse.json({ error: 'Tier not found' }, { status: 404 });
      }
      if (result.reason === 'tier_not_free') {
        return NextResponse.json({ error: 'This tier requires payment' }, { status: 400 });
      }
      return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
    }

    if (result.status === 'already_member') {
      return NextResponse.json({ error: 'Already subscribed', tierId: result.tierId }, { status: 409 });
    }

    // Send notification to artist
    try {
      const [{ data: artistProfile }, { data: fanProfile }, { data: tierRow }] = await Promise.all([
        supabaseAdmin.from('artist_profiles').select('user_id').eq('id', result.artistId).single(),
        supabaseAdmin.from('profiles').select('display_name').eq('id', user.id).single(),
        supabaseAdmin.from('subscription_tiers').select('name').eq('id', result.tierId).single(),
      ]);

      if (artistProfile?.user_id) {
        await notifyNewSubscriber(
          supabaseAdmin,
          artistProfile.user_id,
          fanProfile?.display_name || 'A fan',
          tierRow?.name || 'Free'
        );
      }
    } catch (e) {
      console.error('Notification error (non-fatal):', e);
    }

    return NextResponse.json({ success: true, tierId: result.tierId });
  } catch (error) {
    console.error('Free subscribe error:', error);
    return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
  }
}
