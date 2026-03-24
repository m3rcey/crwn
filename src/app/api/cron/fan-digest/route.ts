import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { fanWeeklyDigestEmail } from '@/lib/emails/fanWeeklyDigest';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

// Weekly fan digest — sends each fan a summary of what their subscribed artists posted/released
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekAgoISO = weekAgo.toISOString();

  let sent = 0;
  let skipped = 0;

  // Get all active subscriptions grouped by fan
  const { data: activeSubs } = await supabaseAdmin
    .from('subscriptions')
    .select('fan_id, artist_id')
    .eq('status', 'active');

  if (!activeSubs || activeSubs.length === 0) {
    return NextResponse.json({ sent: 0, message: 'No active subscriptions' });
  }

  // Group by fan
  const fanArtists: Record<string, string[]> = {};
  for (const sub of activeSubs) {
    if (!fanArtists[sub.fan_id]) fanArtists[sub.fan_id] = [];
    fanArtists[sub.fan_id].push(sub.artist_id);
  }

  // Batch fetch all new content from the past week
  const { data: newTracks } = await supabaseAdmin
    .from('tracks')
    .select('id, title, artist_id')
    .gte('created_at', weekAgoISO)
    .eq('is_active', true);

  const { data: newPosts } = await supabaseAdmin
    .from('community_posts')
    .select('id, artist_id')
    .gte('created_at', weekAgoISO)
    .eq('is_active', true);

  const { data: newProducts } = await supabaseAdmin
    .from('products')
    .select('id, artist_id')
    .gte('created_at', weekAgoISO)
    .eq('is_active', true);

  // Index by artist for quick lookup
  const tracksByArtist: Record<string, { title: string }[]> = {};
  for (const t of newTracks || []) {
    if (!tracksByArtist[t.artist_id]) tracksByArtist[t.artist_id] = [];
    tracksByArtist[t.artist_id].push({ title: t.title });
  }

  const postCountByArtist: Record<string, number> = {};
  for (const p of newPosts || []) {
    postCountByArtist[p.artist_id] = (postCountByArtist[p.artist_id] || 0) + 1;
  }

  const productCountByArtist: Record<string, number> = {};
  for (const p of newProducts || []) {
    productCountByArtist[p.artist_id] = (productCountByArtist[p.artist_id] || 0) + 1;
  }

  // Get artist details (name, slug) for all relevant artists
  const allArtistIds = [...new Set(activeSubs.map(s => s.artist_id))];
  const { data: artistProfiles } = await supabaseAdmin
    .from('artist_profiles')
    .select('id, slug, user_id')
    .in('id', allArtistIds);

  const artistUserIds = (artistProfiles || []).map(a => a.user_id).filter(Boolean);
  const { data: artistNames } = await supabaseAdmin
    .from('profiles')
    .select('id, display_name')
    .in('id', artistUserIds);

  const artistNameMap: Record<string, string> = {};
  const artistSlugMap: Record<string, string> = {};
  for (const a of artistProfiles || []) {
    const name = (artistNames || []).find(n => n.id === a.user_id);
    artistNameMap[a.id] = name?.display_name || 'Artist';
    artistSlugMap[a.id] = a.slug || '';
  }

  // Process each fan
  const fanIds = Object.keys(fanArtists);

  for (const fanId of fanIds) {
    try {
      // Check communication preferences — skip if any artist has email_marketing off
      // We send one digest per fan, so check global preference
      const { data: prefs } = await supabaseAdmin
        .from('fan_communication_prefs')
        .select('email_marketing')
        .eq('fan_id', fanId)
        .eq('email_marketing', false);

      // If fan has explicitly opted out for ALL their artists, skip
      const artistIds = fanArtists[fanId];
      const optedOutArtists = new Set((prefs || []).map(() => true)); // just count
      if (prefs && prefs.length >= artistIds.length) {
        skipped++;
        continue;
      }

      // Build digest content for this fan
      const digestArtists = artistIds
        .map(artistId => ({
          artistName: artistNameMap[artistId] || 'Artist',
          slug: artistSlugMap[artistId] || '',
          newTracks: tracksByArtist[artistId] || [],
          newPosts: postCountByArtist[artistId] || 0,
          newProducts: productCountByArtist[artistId] || 0,
        }))
        .filter(a => a.newTracks.length > 0 || a.newPosts > 0 || a.newProducts > 0);

      // Skip if no activity from any artist
      if (digestArtists.length === 0) {
        skipped++;
        continue;
      }

      // Get fan email
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(fanId);
      const fanEmail = authUser.user?.email;
      if (!fanEmail) {
        skipped++;
        continue;
      }

      // Check suppression
      const { data: suppressed } = await supabaseAdmin
        .from('email_suppressions')
        .select('id')
        .eq('email', fanEmail.toLowerCase())
        .maybeSingle();

      if (suppressed) {
        skipped++;
        continue;
      }

      // Get fan name
      const { data: fanProfile } = await supabaseAdmin
        .from('profiles')
        .select('display_name')
        .eq('id', fanId)
        .single();

      const fanName = fanProfile?.display_name || 'Fan';

      const unsubscribeUrl = `https://thecrwn.app/profile/notifications`;

      const html = fanWeeklyDigestEmail({
        fanName,
        artists: digestArtists,
        unsubscribeUrl,
      });

      const artistCount = digestArtists.length;
      const subject = artistCount === 1
        ? `New from ${digestArtists[0].artistName} this week`
        : `This week from your ${artistCount} artists`;

      await resend.emails.send({
        from: FROM_EMAIL,
        to: fanEmail,
        subject,
        html,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
        },
      });

      sent++;
    } catch (err) {
      console.error(`Fan digest failed for fan ${fanId}:`, err);
    }
  }

  return NextResponse.json({ sent, skipped, totalFans: fanIds.length });
}
