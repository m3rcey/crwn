import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Finds campaigns with scheduled_at <= now and status='draft', then triggers their send endpoint
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date().toISOString();

  // Find campaigns that are scheduled and due
  const { data: dueCampaigns } = await supabaseAdmin
    .from('campaigns')
    .select('id, artist_id')
    .eq('status', 'draft')
    .not('scheduled_at', 'is', null)
    .lte('scheduled_at', now);

  if (!dueCampaigns || dueCampaigns.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  let sent = 0;
  let failed = 0;

  for (const campaign of dueCampaigns) {
    try {
      // Get the artist's user_id so we can call the send endpoint with proper auth context
      const { data: artist } = await supabaseAdmin
        .from('artist_profiles')
        .select('user_id, platform_tier')
        .eq('id', campaign.artist_id)
        .single();

      if (!artist) {
        console.error('Artist not found for scheduled campaign:', campaign.id);
        failed++;
        continue;
      }

      // Get artist display name
      const { data: artistProfile } = await supabaseAdmin
        .from('profiles')
        .select('display_name')
        .eq('id', artist.user_id)
        .single();

      const artistName = artistProfile?.display_name || 'Artist';

      // Get campaign details
      const { data: campaignData } = await supabaseAdmin
        .from('campaigns')
        .select('*')
        .eq('id', campaign.id)
        .single();

      if (!campaignData) {
        failed++;
        continue;
      }

      // Mark as sending
      await supabaseAdmin
        .from('campaigns')
        .update({ status: 'sending' })
        .eq('id', campaign.id);

      // Import and use the same send logic inline (avoid HTTP self-call on serverless)
      const { resolveAudienceAndSend } = await import('@/lib/campaignSender');
      const result = await resolveAudienceAndSend(
        supabaseAdmin,
        campaignData,
        artist.user_id,
        artistName,
        artist.platform_tier || 'starter',
      );

      if (result.sent > 0) {
        sent++;
      } else {
        failed++;
      }

      console.log(`Scheduled campaign ${campaign.id} sent:`, result);
    } catch (err) {
      console.error(`Scheduled campaign ${campaign.id} failed:`, err);
      await supabaseAdmin
        .from('campaigns')
        .update({ status: 'failed', stats: { error: 'Cron send failed' } })
        .eq('id', campaign.id);
      failed++;
    }
  }

  return NextResponse.json({ processed: dueCampaigns.length, sent, failed });
}
