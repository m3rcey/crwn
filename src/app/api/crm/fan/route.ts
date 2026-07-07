import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
);

// Resolve the authenticated caller to their artist_profiles.id, or null.
async function getCallerArtistId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();
  return artist?.id ?? null;
}

// GET /api/crm/fan?fanId=... — the fan detail bundle for the drawer.
export async function GET(req: NextRequest) {
  const artistId = await getCallerArtistId();
  if (!artistId) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  const fanId = req.nextUrl.searchParams.get('fanId');
  if (!fanId) return NextResponse.json({ error: 'Missing fanId' }, { status: 400 });

  // Notes + actions (artist-scoped)
  const [{ data: notes }, { data: actions }, { data: badges }, { data: events }] = await Promise.all([
    supabaseAdmin.from('fan_growth_notes')
      .select('*').eq('artist_id', artistId).eq('fan_id', fanId)
      .order('created_at', { ascending: false }),
    supabaseAdmin.from('fan_growth_actions')
      .select('*').eq('artist_id', artistId).eq('fan_id', fanId)
      .order('created_at', { ascending: false }).limit(30),
    supabaseAdmin.from('fan_badge_awards')
      .select('*').eq('fan_id', fanId).or(`artist_id.eq.${artistId},artist_id.is.null`)
      .order('awarded_at', { ascending: false }),
    supabaseAdmin.from('fan_events')
      .select('event_type, source, ref_kind, value, created_at')
      .eq('artist_id', artistId).eq('fan_id', fanId)
      .order('created_at', { ascending: false }).limit(20),
  ]);

  // Contribution snapshot from existing sources
  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('status, started_at, subscription_tiers(name)')
    .eq('artist_id', artistId).eq('fan_id', fanId)
    .order('started_at', { ascending: false }).limit(1).maybeSingle();

  const { count: referralCount } = await supabaseAdmin
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', artistId).eq('referrer_fan_id', fanId).eq('status', 'active');

  let subscriptionLengthDays: number | null = null;
  if (sub?.started_at) {
    subscriptionLengthDays = Math.floor(
      (Date.now() - new Date(sub.started_at).getTime()) / 86400000,
    );
  }

  return NextResponse.json({
    notes: notes || [],
    actions: actions || [],
    badges: badges || [],
    events: events || [],
    contribution: {
      subscriptionStatus: sub?.status || 'never',
      tierName: (sub as any)?.subscription_tiers?.name || null,
      subscriptionLengthDays,
      referralCount: referralCount || 0,
      badgeCount: (badges || []).length,
      eventCount: (events || []).length,
    },
  });
}
