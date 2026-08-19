import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get('q') || '';

  // This route is unauthenticated and the admin client bypasses RLS, so reading
  // tracks through it published every PAID track's audio_url to anyone who
  // called /api/explore. Track rows are therefore read with a REQUEST-SCOPED
  // client against tracks_public, whose CASE redaction keys off auth.uid():
  // an anonymous browser gets metadata with NULL audio, a subscriber gets the
  // audio for the tiers they pay for. Everything else here is public metadata
  // and stays on the admin client.
  const supabaseAsCaller = await createServerSupabaseClient();

  // Featured artists - all artists with active profiles
  const artistQuery = supabaseAdmin
    .from('artist_profiles')
    .select('id, slug, tagline, banner_url, profile:profiles(display_name, avatar_url, is_active)')
    .not('slug', 'is', null);

  if (search) {
    // Search by slug directly
    artistQuery.ilike('slug', `%${search}%`);
  }

  // The artist list and the founder-hidden list are independent, so they go out
  // together. Founder-hidden artists (schema-phase2-featured-hidden.sql) drop out
  // of the BROWSE list but stay findable by SEARCH: hiding a tile should not make
  // a real artist unreachable. The hidden query is tolerant on purpose, so this
  // route still works before that migration lands (absent column -> null -> nobody
  // hidden) rather than 42703-ing the whole page.
  const [slugRes, hiddenRes] = await Promise.all([
    artistQuery.limit(20),
    search
      ? Promise.resolve({ data: [] as { id: string }[] })
      : supabaseAdmin.from('artist_profiles').select('id').eq('featured_hidden', true),
  ]);
  const slugArtists = slugRes.data;
  const hiddenIds = new Set((hiddenRes.data || []).map((r) => r.id as string));

  // Applied to the BROWSE track queries before their limit. Empty while searching
  // (hiddenIds is empty then), which keeps the ratified rule above: hidden artists
  // leave browse, they never become unfindable.
  const hideFromBrowse = <T extends { not: (col: string, op: string, val: string) => T }>(q: T): T =>
    hiddenIds.size ? q.not('artist_id', 'in', `(${[...hiddenIds].join(',')})`) : q;

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
        .select('id, slug, tagline, banner_url, profile:profiles(display_name, avatar_url, is_active)')
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
    if (hiddenIds.has(a.id)) return false;
    seenIds.add(a.id);
    return true;
  });

  const artistIds = (artists || []).map(a => a.id);
  const now = new Date().toISOString();

  // ONE WAVE, not four. Subscriber counts and the has-music check both depend on
  // artistIds, but the two track lists do not depend on the artists at all. These
  // used to run as four sequential round trips; Explore is a top-nav page, so that
  // latency was paid on every visit for no reason.
  const [subsRes, musicRes, newReleasesRes, popularTracksRes] = await Promise.all([
    artistIds.length
      ? supabaseAdmin.from('subscriptions').select('artist_id').in('artist_id', artistIds).eq('status', 'active')
      : Promise.resolve({ data: [] as { artist_id: string }[] }),
    artistIds.length
      ? supabaseAdmin.from('tracks').select('artist_id').eq('is_active', true).in('artist_id', artistIds)
      : Promise.resolve({ data: [] as { artist_id: string }[] }),
    // New releases: latest tracks, excluding anything still inside its early-access
    // window (public_release_date in the future).
    //
    // Founder-hidden artists are excluded IN THE QUERY, not filtered out of the
    // result. The limit is what forces this. Dropping them afterwards means the
    // twelve rows are chosen first and then thinned, so hiding a prolific artist
    // does not remove twelve tracks, it removes the whole row: four hidden
    // artists held the 12 most recent tracks on the platform and New Releases
    // came back EMPTY (observed live, 2026-08-18). Filtering first means the
    // limit counts twelve tracks somebody can actually see.
    hideFromBrowse(
      supabaseAsCaller
        .from('tracks_public')
        .select('id, title, album_art_url, audio_url_128, audio_url_320, duration, play_count, artist_id, created_at, is_free')
        .eq('is_active', true)
        .or(`public_release_date.is.null,public_release_date.lte.${now}`)
        .order('created_at', { ascending: false })
    ).limit(12),
    hideFromBrowse(
      supabaseAsCaller
        .from('tracks_public')
        .select('id, title, album_art_url, audio_url_128, audio_url_320, duration, play_count, artist_id, is_free')
        .eq('is_active', true)
        .or(`public_release_date.is.null,public_release_date.lte.${now}`)
        .order('play_count', { ascending: false })
    ).limit(12),
  ]);

  const artistSubCounts: Record<string, number> = {};
  for (const sub of subsRes.data || []) {
    artistSubCounts[sub.artist_id] = (artistSubCounts[sub.artist_id] || 0) + 1;
  }

  // Only surface artists with published music, so empty/incomplete signups
  // (no tracks, no avatar) don't appear as broken placeholder tiles.
  const artistsWithMusic = new Set<string>();
  for (const r of musicRes.data || []) artistsWithMusic.add(r.artist_id);

  const newReleases = newReleasesRes.data;
  const popularTracks = popularTracksRes.data;

  // Search tracks by title if search query provided
  let searchTracks: typeof newReleases = [];
  if (search) {
    const { data: matchedTracks } = await supabaseAsCaller
      .from('tracks_public')
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
  // Deactivated artists must not surface anywhere on explore: not as tiles,
  // and not via their tracks either. deactivation only flips profiles.is_active
  // (RLS never hides the rows), so every public surface filters it in app code.
  const deactivatedArtistIds = new Set<string>();
  if (trackArtistIds.length > 0) {
    const { data: trackArtists } = await supabaseAdmin
      .from('artist_profiles')
      .select('id, slug, profile:profiles(display_name, is_active)')
      .in('id', trackArtistIds);

    (trackArtists || []).forEach((a: unknown) => {
      const artist = a as { id: string; slug: string; profile: { display_name: string; is_active?: boolean }[] };
      const profile = Array.isArray(artist.profile) ? artist.profile[0] : artist.profile;
      if (profile?.is_active === false) {
        deactivatedArtistIds.add(artist.id);
        return;
      }
      trackArtistMap[artist.id] = {
        name: profile?.display_name || 'Artist',
        slug: artist.slug,
      };
    });
  }

  const formatArtists = (artists || []).filter((a: unknown) => {
    const artist = a as { id: string; profile: { avatar_url?: string; is_active?: boolean }[] | { avatar_url?: string; is_active?: boolean } };
    const profile = Array.isArray(artist.profile) ? artist.profile[0] : artist.profile;
    // Deactivated accounts never surface (only an explicit false means deactivated).
    if (profile?.is_active === false) return false;
    // A featured tile must be complete: has music AND an uploaded avatar.
    return artistsWithMusic.has(artist.id) && !!profile?.avatar_url;
  }).map((a: unknown) => {
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

  // Two independent reasons a track never surfaces here, and neither one is a
  // property of the track. Deactivated: the whole account is off. Founder-hidden
  // (schema-phase2-featured-hidden.sql): the artist is out of DISCOVERY while
  // their account, their page and their catalog keep working.
  //
  // The hidden check used to apply to the artist TILES only, so a hidden artist
  // vanished from the row of faces and their whole catalog stayed in New Releases
  // and Popular underneath it. Hiding an artist from discovery has to mean their
  // music too, or the flag only moves where they appear.
  //
  // hiddenIds is deliberately EMPTY while searching, which is the same rule the
  // tiles follow: hiding someone from browse must not make them unfindable by
  // name or by title.
  const formatTracks = (tracks: unknown[] | null) => (tracks || []).filter((t: unknown) => {
    const track = t as { artist_id: string };
    return !deactivatedArtistIds.has(track.artist_id) && !hiddenIds.has(track.artist_id);
  }).map((t: unknown) => {
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
