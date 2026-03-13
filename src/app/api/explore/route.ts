import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get('q') || '';

  // Featured artists - all artists with active profiles
  const artistQuery = supabaseAdmin
    .from('artist_profiles')
    .select('id, slug, tagline, banner_url, profile:profiles(display_name, avatar_url)')
    .not('slug', 'is', null);

  if (search) {
    // Search by artist name or slug
    artistQuery.or(`slug.ilike.%${search}%,profile.display_name.ilike.%${search}%`);
  }

  const { data: artists } = await artistQuery.limit(20);

  // Get subscriber counts per artist
  const artistIds = (artists || []).map(a => a.id);
  let artistSubCounts: Record<string, number> = {};

  if (artistIds.length > 0) {
    for (const id of artistIds) {
      const { count } = await supabaseAdmin
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('artist_id', id)
        .eq('status', 'active');
      artistSubCounts[id] = count || 0;
    }
  }

  // New releases - latest tracks across all artists
  const { data: newReleases } = await supabaseAdmin
    .from('tracks')
    .select('id, title, album_art_url, audio_url_128, audio_url_320, duration, play_count, artist_id, created_at, is_free')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(12);

  // Popular tracks - by play count
  const { data: popularTracks } = await supabaseAdmin
    .from('tracks')
    .select('id, title, album_art_url, audio_url_128, audio_url_320, duration, play_count, artist_id, is_free')
    .eq('is_active', true)
    .order('play_count', { ascending: false })
    .limit(12);

  // Get artist names for tracks
  const trackArtistIds = [...new Set([
    ...(newReleases || []).map(t => t.artist_id),
    ...(popularTracks || []).map(t => t.artist_id),
  ])];

  let trackArtistMap: Record<string, { name: string; slug: string }> = {};
  if (trackArtistIds.length > 0) {
    const { data: trackArtists } = await supabaseAdmin
      .from('artist_profiles')
      .select('id, slug, profile:profiles(display_name)')
      .in('id', trackArtistIds);

    (trackArtists || []).forEach((a: unknown) => {
      const artist = a as { id: string; slug: string; profile: { display_name: string }[] };
      const profile = Array.isArray(artist.profile) ? artist.profile[0] : artist.profile;
      trackArtistMap[artist.id] = {
        name: profile?.display_name || 'Artist',
        slug: artist.slug,
      };
    });
  }

  const formatArtists = (artists || []).map((a: unknown) => {
    const artist = a as { id: string; slug: string; tagline: string; banner_url: string; profile: { display_name: string; avatar_url: string }[] };
    const profile = Array.isArray(artist.profile) ? artist.profile[0] : artist.profile;
    return {
      id: artist.id,
      slug: artist.slug,
      displayName: profile?.display_name || 'Artist',
      avatarUrl: profile?.avatar_url || null,
      bannerUrl: artist.banner_url,
      tagline: artist.tagline,
      subscribers: artistSubCounts[artist.id] || 0,
    };
  });

  const formatTracks = (tracks: unknown[] | null) => (tracks || []).map((t: unknown) => {
    const track = t as { id: string; title: string; album_art_url: string; audio_url_128: string; audio_url_320: string; duration: number; play_count: number; artist_id: string; is_free: boolean; created_at: string };
    return {
      id: track.id,
      title: track.title,
      albumArt: track.album_art_url,
      album_art_url: track.album_art_url,
      audio_url_128: track.audio_url_128,
      audio_url_320: track.audio_url_320,
      duration: track.duration,
      playCount: track.play_count || 0,
      play_count: track.play_count || 0,
      artistName: trackArtistMap[track.artist_id]?.name || 'Artist',
      artistSlug: trackArtistMap[track.artist_id]?.slug || '',
      artistId: track.artist_id,
      artist_id: track.artist_id,
      isFree: track.is_free,
      is_free: track.is_free,
      createdAt: track.created_at,
    };
  });

  return NextResponse.json({
    artists: formatArtists,
    newReleases: formatTracks(newReleases),
    popularTracks: formatTracks(popularTracks),
  });
}
