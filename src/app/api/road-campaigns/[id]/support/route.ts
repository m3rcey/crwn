import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/notifications';
import { recordFanEvent } from '@/lib/fanEvents';
import { CAMPAIGN_GOAL_MAP } from '@/lib/roadCampaigns';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
);

// POST /api/road-campaigns/[id]/support — fan supports a NON-money campaign (tap-to-support).
// Money campaigns convert through checkout on the artist page, not here.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: campaign } = await supabaseAdmin
    .from('road_campaigns').select('*, artist_profiles(user_id)').eq('id', id).single() as any;
  if (!campaign || campaign.status !== 'active') return NextResponse.json({ error: 'Not open' }, { status: 400 });
  if (campaign.goal_type === 'money') return NextResponse.json({ error: 'Money campaigns support through checkout' }, { status: 400 });
  if (campaign.deadline && new Date(campaign.deadline) < new Date()) {
    return NextResponse.json({ error: 'Deadline passed' }, { status: 400 });
  }

  const contributionType = CAMPAIGN_GOAL_MAP[campaign.goal_type as keyof typeof CAMPAIGN_GOAL_MAP]?.contribution || 'support';

  await supabaseAdmin.from('road_campaign_contributions').upsert({
    campaign_id: id, fan_id: user.id, contribution_type: contributionType, value: 1,
  }, { onConflict: 'campaign_id,fan_id,contribution_type', ignoreDuplicates: true });

  await recordFanEvent(supabaseAdmin, {
    artistId: campaign.artist_id, fanId: user.id, eventType: 'custom', source: 'road_campaign', refKind: 'campaign', refId: id,
  });

  // Recompute: unique-fan count of the matching contribution type
  const { count } = await supabaseAdmin
    .from('road_campaign_contributions').select('id', { count: 'exact', head: true })
    .eq('campaign_id', id).eq('contribution_type', contributionType);
  const current = count || 0;
  const reached = current >= campaign.goal_value;

  const patch: Record<string, any> = { current_value: current, updated_at: new Date().toISOString() };
  if (reached && campaign.status === 'active') patch.status = 'reached';
  await supabaseAdmin.from('road_campaigns').update(patch).eq('id', id);

  if (reached && campaign.status === 'active') {
    const artistUserId = campaign.artist_profiles?.user_id;
    if (artistUserId) {
      await createNotification(
        supabaseAdmin, artistUserId, 'campaign_reached',
        `🎉 ${campaign.title} hit its goal!`,
        'Your fans got you there! Time to deliver.',
        `/campaigns/${id}`,
      ).catch(() => {});
    }
  }

  return NextResponse.json({ current, goal: campaign.goal_value, reached });
}
