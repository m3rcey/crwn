import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
);

// GET /api/road-campaigns/active?artistId= — the current campaign for the Movement
// hero (most recent active/reached), with live money progress + supporter count.
export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get('artistId');
  if (!artistId) return NextResponse.json({ campaign: null });

  const { data: campaign } = await supabaseAdmin
    .from('road_campaigns').select('*').eq('artist_id', artistId)
    .in('status', ['active', 'reached']).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!campaign) return NextResponse.json({ campaign: null });

  // Live progress for money goals
  let current = campaign.current_value || 0;
  if (campaign.goal_type === 'money') {
    const { data: earn } = await supabaseAdmin
      .from('earnings').select('gross_amount').eq('artist_id', artistId).gte('created_at', campaign.started_at);
    current = (earn || []).reduce((s: number, e: any) => s + (e.gross_amount || 0), 0);
  }

  // Supporter count + whether the caller already supported
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: contribs } = await supabaseAdmin
    .from('road_campaign_contributions').select('fan_id').eq('campaign_id', campaign.id);
  const supporterCount = new Set((contribs || []).map((c: any) => c.fan_id)).size;
  const alreadySupported = user ? (contribs || []).some((c: any) => c.fan_id === user.id) : false;

  return NextResponse.json({ campaign: { ...campaign, current_value: current }, supporterCount, alreadySupported });
}
