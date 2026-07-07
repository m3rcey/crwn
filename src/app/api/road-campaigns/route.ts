import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { CAMPAIGN_GOAL_MAP, type CampaignGoalType } from '@/lib/roadCampaigns';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
);

async function getUserAndArtist() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, artistId: null };
  const { data: artist } = await supabase.from('artist_profiles').select('id').eq('user_id', user.id).single();
  return { user, artistId: artist?.id ?? null };
}

// Live progress: money = revenue since started_at; else = denormalized current_value.
async function liveCurrent(campaign: any): Promise<number> {
  if (campaign.goal_type !== 'money') return campaign.current_value || 0;
  const { data: earn } = await supabaseAdmin
    .from('earnings').select('gross_amount').eq('artist_id', campaign.artist_id).gte('created_at', campaign.started_at);
  return (earn || []).reduce((s: number, e: any) => s + (e.gross_amount || 0), 0);
}

// GET /api/road-campaigns (artist list)
export async function GET() {
  const { artistId } = await getUserAndArtist();
  if (!artistId) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });
  const { data: campaigns } = await supabaseAdmin
    .from('road_campaigns').select('*').eq('artist_id', artistId).order('created_at', { ascending: false });
  const withCurrent = await Promise.all((campaigns || []).map(async c => ({ ...c, current_value: await liveCurrent(c) })));
  return NextResponse.json({ campaigns: withCurrent });
}

// POST /api/road-campaigns (create)
export async function POST(req: NextRequest) {
  const { user, artistId } = await getUserAndArtist();
  if (!artistId) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  const b = await req.json();
  if (!b.title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  const goalType = (CAMPAIGN_GOAL_MAP[b.goalType as CampaignGoalType] ? b.goalType : 'supporters') as CampaignGoalType;
  const def = CAMPAIGN_GOAL_MAP[goalType];

  const { data, error } = await supabaseAdmin.from('road_campaigns').insert({
    artist_id: artistId,
    title: b.title.trim(),
    description: b.description || null,
    cover_image_url: b.coverImageUrl || null,
    goal_type: goalType,
    goal_value: Math.max(1, parseInt(b.goalValue) || (goalType === 'money' ? 100000 : 100)),
    status: b.status === 'draft' ? 'draft' : 'active',
    deadline: b.deadline || null,
    linked_tier_id: b.linkedTierId || null,
    linked_product_id: b.linkedProductId || null,
    cta_label: b.ctaLabel || def.cta,
    reached_message: b.reachedMessage || null,
    created_by: user!.id,
  }).select('*').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: data });
}
