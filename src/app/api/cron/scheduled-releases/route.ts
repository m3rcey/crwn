import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notifyNewTrack } from '@/lib/notifications';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

// Auto-publish tracks whose release_date has arrived and notify subscribers
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  let published = 0;
  let notified = 0;

  // Find tracks with public_release_date = today that are still gated
  // (public_release_date is used for early access — the track exists but isn't publicly available yet)
  const { data: earlyAccessTracks } = await supabaseAdmin
    .from('tracks')
    .select('id, artist_id, title')
    .eq('is_active', true)
    .eq('public_release_date', today)
    .eq('is_free', false);

  if (earlyAccessTracks && earlyAccessTracks.length > 0) {
    for (const track of earlyAccessTracks) {
      // Make the track free/public now that release date has arrived
      await supabaseAdmin
        .from('tracks')
        .update({
          is_free: true,
          allowed_tier_ids: [],
          updated_at: new Date().toISOString(),
        })
        .eq('id', track.id);

      published++;

      // Notify all subscribers of this artist
      try {
        const { data: artist } = await supabaseAdmin
          .from('artist_profiles')
          .select('user_id, slug')
          .eq('id', track.artist_id)
          .single();

        if (artist) {
          const { data: artistProfile } = await supabaseAdmin
            .from('profiles')
            .select('display_name')
            .eq('id', artist.user_id)
            .single();
          const artistName = artistProfile?.display_name || 'An artist';
          const artistSlug = artist.slug || track.artist_id;

          // Get all active subscribers
          const { data: subs } = await supabaseAdmin
            .from('subscriptions')
            .select('fan_id')
            .eq('artist_id', track.artist_id)
            .eq('status', 'active');

          if (subs) {
            for (const sub of subs) {
              await notifyNewTrack(supabaseAdmin, sub.fan_id, artistName, track.title, artistSlug);
              notified++;
            }
          }
        }
      } catch (err) {
        console.error(`Notification failed for track ${track.id}:`, err);
      }
    }
  }

  // Also find tracks with release_date = today that aren't active yet
  // (These are tracks scheduled for future release that should go live today)
  const { data: scheduledTracks } = await supabaseAdmin
    .from('tracks')
    .select('id, artist_id, title')
    .eq('is_active', false)
    .eq('release_date', today);

  if (scheduledTracks && scheduledTracks.length > 0) {
    for (const track of scheduledTracks) {
      await supabaseAdmin
        .from('tracks')
        .update({
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', track.id);

      published++;

      // Notify subscribers
      try {
        const { data: artist } = await supabaseAdmin
          .from('artist_profiles')
          .select('user_id, slug')
          .eq('id', track.artist_id)
          .single();

        if (artist) {
          const { data: artistProfile } = await supabaseAdmin
            .from('profiles')
            .select('display_name')
            .eq('id', artist.user_id)
            .single();
          const artistName = artistProfile?.display_name || 'An artist';
          const artistSlug = artist.slug || track.artist_id;

          const { data: subs } = await supabaseAdmin
            .from('subscriptions')
            .select('fan_id')
            .eq('artist_id', track.artist_id)
            .eq('status', 'active');

          if (subs) {
            for (const sub of subs) {
              await notifyNewTrack(supabaseAdmin, sub.fan_id, artistName, track.title, artistSlug);
              notified++;
            }
          }
        }
      } catch (err) {
        console.error(`Notification failed for track ${track.id}:`, err);
      }
    }
  }

  return NextResponse.json({ published, notified });
}
