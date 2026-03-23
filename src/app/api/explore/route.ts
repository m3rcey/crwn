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
    // Search by slug directly
    artistQuery.ilike('slug', `%${search}%`);
  }

  const { data: slugArtists } = await artistQuery.limit(20);

  // Also search by display_name in profiles table
  let nameArtists: typeof slugArtists = [];
  if (search) {
    const { data: matchingProfiles } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .ilike('display_name', `%${search}%`)
      .limit(20);

    if (matchingProfiles && matchingProfiles.length > 0) {
      const userIds = matchingProfiles.map(p => p.id);
      const { data: nameMatches } = await supabaseAdmin
        .from('artist_profiles')
        .select('id, slug, tagline, banner_url, profile:profiles(display_name, avatar_url)')
        .in('user_id', userIds)
        .not('slug', 'is', null)
        .limit(20);
      nameArtists = nameMatches || [];
    }
  }

  // Merge and deduplicate
  const seenIds = new Set<string>();
  const artists = [...(slugArtists || []), ...(nameArtists || [])].filter(a => {
    if (seenIds.has(a.id)) return false;
    seenIds.add(a.id);
    return true;
  });

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

  const now = new Date().toISOString();

  // New releases - latest tracks across all artists
  // Exclude tracks still in early access window (public_release_date in the future)
  const { data: newReleases } = await supabaseAdmin
    .from('tracks')
    .select('id, title, album_art_url, audio_url_128, audio_url_320, duration, play_count, artist_id, created_at, is_free')
    .eq('is_active', true)
    .or(`public_release_date.is.null,public_release_date.lte.${now}`)
    .order('created_at', { ascending: false })
    .limit(12);

  // Popular tracks - by play count
  const { data: popularTracks } = await supabaseAdmin
    .from('tracks')
    .select('id, title, album_art_url, audio_url_128, audio_url_320, duration, play_count, artist_id, is_free')
    .eq('is_active', true)
    .or(`public_release_date.is.null,public_release_date.lte.${now}`)
    .order('play_count', { ascending: false })
    .limit(12);

  // Search tracks by title if search query provided
  let searchTracks: typeof newReleases = [];
  if (search) {
    const { data: matchedTracks } = await supabaseAdmin
      .from('tracks')
      .select('id, title, album_art_url, audio_url_128, audio_url_320, duration, play_count, artist_id, created_at, is_free')
      .eq('is_active', true)
      .or(`public_release_date.is.null,public_release_date.lte.${now}`)
      .ilike('title', `%${search}%`)
      .order('play_count', { ascending: false })
      .limit(12);
    searchTracks = matchedTracks || [];
  }

  // Get artist names for tracks
  const trackArtistIds = [...new Set([
    ...(newReleases || []).map(t => t.artist_id),
    ...(popularTracks || []).map(t => t.artist_id),
    ...(searchTracks || []).map(t => t.artist_id),
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
    searchTracks: formatTracks(searchTracks),
  });
}
