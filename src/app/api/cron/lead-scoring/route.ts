import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

// Lead scoring weights
const WEIGHTS = {
  smart_link_capture: 15,
  email_open: 3,
  email_click: 10,
  track_play: 2,
  community_comment: 8,
  page_visit: 5,
  purchase: 50,
  subscription: 100,
  // Decay: halve score contribution for activity older than 30 days
  DECAY_DAYS: 30,
};

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = Date.now();
  const decayCutoff = new Date(now - WEIGHTS.DECAY_DAYS * 86400000).toISOString();

  // Get all artists who have fan_contacts
  const { data: artists } = await supabaseAdmin
    .from('fan_contacts')
    .select('artist_id')
    .limit(1000);

  if (!artists || artists.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  const uniqueArtistIds = [...new Set(artists.map(a => a.artist_id))];
  let totalUpdated = 0;

  for (const artistId of uniqueArtistIds) {
    try {
      // Get all contacts for this artist
      const { data: contacts } = await supabaseAdmin
        .from('fan_contacts')
        .select('id, email')
        .eq('artist_id', artistId);

      if (!contacts || contacts.length === 0) continue;

      // Get artist's track IDs for play history
      const { data: artistTracks } = await supabaseAdmin
        .from('tracks')
        .select('id')
        .eq('artist_id', artistId)
        .eq('is_active', true);
      const trackIds = (artistTracks || []).map(t => t.id);

      // Get campaign send data (opens + clicks) for this artist's campaigns
      const { data: campaigns } = await supabaseAdmin
        .from('campaigns')
        .select('id')
        .eq('artist_id', artistId);
      const campaignIds = (campaigns || []).map(c => c.id);

      // Collect email-based activity from campaign_sends
      const emailScores: Record<string, number> = {};
      if (campaignIds.length > 0) {
        const { data: sends } = await supabaseAdmin
          .from('campaign_sends')
          .select('email, status, opened_at, clicked_at')
          .in('campaign_id', campaignIds);

        (sends || []).forEach(s => {
          const email = s.email?.toLowerCase();
          if (!email) return;
          if (!emailScores[email]) emailScores[email] = 0;

          const isRecent = (dateStr: string | null) =>
            dateStr ? dateStr > decayCutoff : false;

          if (s.status === 'opened' || s.opened_at) {
            emailScores[email] += isRecent(s.opened_at) ? WEIGHTS.email_open : Math.floor(WEIGHTS.email_open / 2);
          }
          if (s.status === 'clicked' || s.clicked_at) {
            emailScores[email] += isRecent(s.clicked_at) ? WEIGHTS.email_click : Math.floor(WEIGHTS.email_click / 2);
          }
        });
      }

      // Get smart link captures for this artist
      const { data: smartLinks } = await supabaseAdmin
        .from('smart_links')
        .select('id')
        .eq('artist_id', artistId);
      const linkIds = (smartLinks || []).map(l => l.id);

      const captureScores: Record<string, number> = {};
      if (linkIds.length > 0) {
        const { data: captures } = await supabaseAdmin
          .from('smart_link_captures')
          .select('email, created_at')
          .in('smart_link_id', linkIds);

        (captures || []).forEach(c => {
          const email = c.email?.toLowerCase();
          if (!email) return;
          if (!captureScores[email]) captureScores[email] = 0;
          const isRecent = c.created_at > decayCutoff;
          captureScores[email] += isRecent ? WEIGHTS.smart_link_capture : Math.floor(WEIGHTS.smart_link_capture / 2);
        });
      }

      // Get subscriptions for this artist (by email lookup)
      const { data: subscriptions } = await supabaseAdmin
        .from('subscriptions')
        .select('fan_id, status')
        .eq('artist_id', artistId);

      // Get purchases for this artist
      const { data: purchases } = await supabaseAdmin
        .from('purchases')
        .select('fan_id, purchased_at')
        .eq('artist_id', artistId)
        .eq('status', 'completed');

      // Map fan_id → email for cross-referencing
      const allFanIds = new Set<string>();
      (subscriptions || []).forEach(s => { if (s.fan_id) allFanIds.add(s.fan_id); });
      (purchases || []).forEach(p => { if (p.fan_id) allFanIds.add(p.fan_id); });

      const fanIdEmailMap: Record<string, string> = {};
      if (allFanIds.size > 0) {
        const fanIdArray = Array.from(allFanIds);
        const batchSize = 20;
        for (let i = 0; i < fanIdArray.length; i += batchSize) {
          const batch = fanIdArray.slice(i, i + batchSize);
          const results = await Promise.all(
            batch.map(id =>
              supabaseAdmin.auth.admin.getUserById(id)
                .then(r => ({ id, email: r.data.user?.email?.toLowerCase() || '' }))
                .catch(() => ({ id, email: '' }))
            )
          );
          results.forEach(r => { if (r.email) fanIdEmailMap[r.id] = r.email; });
        }
      }

      // Build subscription scores by email
      const subScores: Record<string, number> = {};
      (subscriptions || []).forEach(s => {
        const email = fanIdEmailMap[s.fan_id];
        if (!email) return;
        if (!subScores[email]) subScores[email] = 0;
        subScores[email] += s.status === 'active' ? WEIGHTS.subscription : Math.floor(WEIGHTS.subscription / 2);
      });

      // Build purchase scores by email
      const purchaseScores: Record<string, number> = {};
      (purchases || []).forEach(p => {
        const email = fanIdEmailMap[p.fan_id];
        if (!email) return;
        if (!purchaseScores[email]) purchaseScores[email] = 0;
        const isRecent = p.purchased_at > decayCutoff;
        purchaseScores[email] += isRecent ? WEIGHTS.purchase : Math.floor(WEIGHTS.purchase / 2);
      });

      // Play history scores by email
      const playScores: Record<string, number> = {};
      if (trackIds.length > 0) {
        const { data: plays } = await supabaseAdmin
          .from('play_history')
          .select('user_id, played_at')
          .in('track_id', trackIds);

        (plays || []).forEach(p => {
          const email = fanIdEmailMap[p.user_id];
          if (!email) return;
          if (!playScores[email]) playScores[email] = 0;
          const isRecent = p.played_at > decayCutoff;
          playScores[email] += isRecent ? WEIGHTS.track_play : Math.floor(WEIGHTS.track_play / 2);
        });
      }

      // Calculate and update scores for each contact
      const nowIso = new Date().toISOString();
      for (const contact of contacts) {
        const email = contact.email?.toLowerCase();
        if (!email) continue;

        const score = (emailScores[email] || 0)
          + (captureScores[email] || 0)
          + (subScores[email] || 0)
          + (purchaseScores[email] || 0)
          + (playScores[email] || 0);

        await supabaseAdmin
          .from('fan_contacts')
          .update({ lead_score: score, lead_score_updated_at: nowIso })
          .eq('id', contact.id);

        totalUpdated++;
      }
    } catch (err) {
      console.error(`Lead scoring failed for artist ${artistId}:`, err);
    }
  }

  return NextResponse.json({ updated: totalUpdated, artists: uniqueArtistIds.length });
}
