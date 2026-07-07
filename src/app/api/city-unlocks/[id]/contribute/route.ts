import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/notifications';
import { recordFanEvent } from '@/lib/fanEvents';
import { GOAL_TYPE_MAP } from '@/lib/cityUnlocks';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
);

// POST /api/city-unlocks/[id]/contribute  { contributionType?, city?, region?, country? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: unlock } = await supabaseAdmin
    .from('city_unlocks').select('*, artist_profiles(user_id)').eq('id', id).single() as any;
  if (!unlock || unlock.status !== 'active') return NextResponse.json({ error: 'Not open' }, { status: 400 });
  if (unlock.deadline && new Date(unlock.deadline) < new Date()) {
    return NextResponse.json({ error: 'Deadline passed' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  // Default the contribution to whatever the goal counts
  const goalDef = GOAL_TYPE_MAP[unlock.goal_type];
  const contributionType = body.contributionType || goalDef?.contribution || 'support';

  // Resolve the fan's city: self-selected wins, else fall back to a known city from earnings
  let city = body.city?.trim() || null;
  let region = body.region || null;
  let country = body.country || null;
  if (!city) {
    const { data: e } = await supabaseAdmin
      .from('earnings').select('fan_city, fan_state, fan_country').eq('fan_id', user.id).eq('artist_id', unlock.artist_id)
      .not('fan_city', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
    city = e?.fan_city || null; region = e?.fan_state || region; country = e?.fan_country || country;
  }

  // Insert the contribution (idempotent per fan+type)
  await supabaseAdmin.from('city_unlock_contributions').upsert({
    city_unlock_id: id, fan_id: user.id, contribution_type: contributionType,
    value: contributionType === 'revenue' ? (parseInt(body.value) || 0) : 1,
    city, region, country,
  }, { onConflict: 'city_unlock_id,fan_id,contribution_type', ignoreDuplicates: true });

  await recordFanEvent(supabaseAdmin, {
    artistId: unlock.artist_id, fanId: user.id, eventType: 'city_contribution', source: 'city_unlock',
    refKind: 'city_unlock', refId: id, city, region, country,
  });

  // Recompute progress from the goal's contribution type
  const goalContribution = goalDef?.contribution || 'support';
  let current = unlock.current_value;
  if (unlock.goal_type === 'revenue') {
    const { data: rev } = await supabaseAdmin
      .from('city_unlock_contributions').select('value').eq('city_unlock_id', id).eq('contribution_type', 'revenue');
    current = (rev || []).reduce((s: number, r: any) => s + (r.value || 0), 0);
  } else {
    const { count } = await supabaseAdmin
      .from('city_unlock_contributions').select('id', { count: 'exact', head: true })
      .eq('city_unlock_id', id).eq('contribution_type', goalContribution);
    current = count || 0;
  }

  const reached = current >= unlock.goal_value;
  const patch: Record<string, any> = { current_value: current, updated_at: new Date().toISOString() };
  if (reached && unlock.status === 'active') patch.status = 'unlocked';
  await supabaseAdmin.from('city_unlocks').update(patch).eq('id', id);

  // Notify the artist when it unlocks
  if (reached && unlock.status === 'active') {
    const artistUserId = unlock.artist_profiles?.user_id;
    if (artistUserId) {
      await createNotification(
        supabaseAdmin, artistUserId, 'city_unlocked',
        `📍 ${unlock.target_city} unlocked ${unlock.title}`,
        `${unlock.target_city} hit its goal. Time to deliver.`,
        `/city-unlocks/${id}`,
      ).catch(() => {});
    }
  }

  return NextResponse.json({ current, goal: unlock.goal_value, unlocked: reached });
}
