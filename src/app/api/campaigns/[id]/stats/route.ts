import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Get campaign
  const { data: campaign } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

  // Verify ownership
  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('id', campaign.artist_id)
    .eq('user_id', user.id)
    .single();

  if (!artist) return NextResponse.json({ error: 'Not your campaign' }, { status: 403 });

  // Get all sends for this campaign
  const { data: sends } = await supabaseAdmin
    .from('campaign_sends')
    .select('id, fan_id, email, status, sent_at, opened_at, clicked_at')
    .eq('campaign_id', campaignId);

  const allSends = sends || [];
  const total = allSends.length;
  const sent = allSends.filter(s => s.status !== 'pending' && s.status !== 'failed').length;
  const opened = allSends.filter(s => s.opened_at).length;
  const clicked = allSends.filter(s => s.clicked_at).length;
  const bounced = allSends.filter(s => s.status === 'bounced').length;
  const failed = allSends.filter(s => s.status === 'failed').length;

  const openRate = sent > 0 ? Math.round((opened / sent) * 100) : 0;
  const clickRate = sent > 0 ? Math.round((clicked / sent) * 100) : 0;
  const clickToOpenRate = opened > 0 ? Math.round((clicked / opened) * 100) : 0;

  // Revenue attribution: two-tier approach
  // 1. Direct attribution: earnings with source_campaign_id matching this campaign (best signal)
  // 2. Inferred attribution: purchases within 48h by engaged fans, excluding those already attributed to another campaign
  const engagedFanIds = allSends
    .filter(s => s.opened_at || s.clicked_at)
    .map(s => s.fan_id);

  let directAttributedRevenue = 0;
  let inferredAttributedRevenue = 0;

  // Direct: earnings explicitly linked to this campaign via UTM/checkout metadata
  const { data: directEarnings } = await supabaseAdmin
    .from('earnings')
    .select('gross_amount')
    .eq('source_campaign_id', campaignId);

  directAttributedRevenue = (directEarnings || []).reduce((sum, e) => sum + e.gross_amount, 0);

  // Inferred: 48h window, engaged fans, but only earnings NOT already attributed to any campaign
  if (engagedFanIds.length > 0 && campaign.sent_at) {
    const attributionWindowEnd = new Date(new Date(campaign.sent_at).getTime() + 48 * 60 * 60 * 1000).toISOString();

    const { data: inferredEarnings } = await supabaseAdmin
      .from('earnings')
      .select('gross_amount')
      .eq('artist_id', campaign.artist_id)
      .in('fan_id', engagedFanIds)
      .gte('created_at', campaign.sent_at)
      .lte('created_at', attributionWindowEnd)
      .is('source_campaign_id', null); // Only unattributed earnings

    inferredAttributedRevenue = (inferredEarnings || []).reduce((sum, e) => sum + e.gross_amount, 0);
  }

  // Unsubscribe count for this campaign
  const { count: unsubscribeCount } = await supabaseAdmin
    .from('unsubscribe_events')
    .select('id', { count: 'exact', head: true })
    .eq('source_id', campaignId)
    .eq('source_type', 'campaign');

  const unsubscribeRate = sent > 0 ? Math.round(((unsubscribeCount || 0) / sent) * 100) : 0;

  // Opens over time (hourly for first 48h)
  const opensByHour: Record<number, number> = {};
  allSends.forEach(s => {
    if (s.opened_at) {
      const hour = new Date(s.opened_at).getHours();
      opensByHour[hour] = (opensByHour[hour] || 0) + 1;
    }
  });

  return NextResponse.json({
    campaign,
    stats: {
      total,
      sent,
      opened,
      clicked,
      bounced,
      failed,
      openRate,
      clickRate,
      clickToOpenRate,
      directAttributedRevenue,
      inferredAttributedRevenue,
      attributedRevenue: directAttributedRevenue + inferredAttributedRevenue,
      unsubscribes: unsubscribeCount || 0,
      unsubscribeRate,
      opensByHour,
    },
  });
}
