import { createBrowserClient } from '@supabase/ssr';
import { Album, AlbumTrack, Track } from '@/types';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Artist: Get all albums for their artist profile
export async function getArtistAlbums(artistId: string): Promise<Album[]> {
  const { data, error } = await supabase
    .from('albums')
    .select('*')
    .eq('artist_id', artistId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// Artist: Get single album with tracks
export async function getAlbumWithTracks(albumId: string): Promise<Album | null> {
  const { data: album, error } = await supabase
    .from('albums')
    .select('*')
    .eq('id', albumId)
    .single();

  if (error || !album) return null;

  const { data: albumTracks } = await supabase
    .from('album_tracks')
    .select('*, track:tracks(*)')
    .eq('album_id', albumId)
    .order('position');

  const tracks = (albumTracks || [])
    .filter(at => at.track)
    .map(at => ({
      ...at.track,
      position: at.position,
    }));

  return { ...album, tracks };
}

// Artist: Create album
export async function createAlbum(
  artistId: string,
  albumData: {
    title: string;
    slug: string;
    description?: string;
    album_art_url?: string;
    release_date?: string;
    access_level: 'free' | 'subscriber';
    is_published?: boolean;
  }
): Promise<Album> {
  const { data, error } = await supabase
    .from('albums')
    .insert({
      ...albumData,
      artist_id: artistId,
      is_published: albumData.is_published || false,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Artist: Update album
export async function updateAlbum(
  albumId: string,
  updates: Partial<{
    title: string;
    slug: string;
    description: string;
    album_art_url: string;
    release_date: string;
    access_level: 'free' | 'subscriber';
    is_published: boolean;
  }>
): Promise<Album> {
  const { data, error } = await supabase
    .from('albums')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', albumId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Artist: Delete album (soft delete)
export async function deleteAlbum(albumId: string): Promise<void> {
  const { error } = await supabase
    .from('albums')
    .update({ is_active: false })
    .eq('id', albumId);

  if (error) throw error;
}

// Artist: Reorder tracks in album
export async function reorderAlbumTracks(
  albumId: string,
  trackPositions: { track_id: string; position: number }[]
): Promise<void> {
  // First delete all existing album_tracks for this album
  await supabase.from('album_tracks').delete().eq('album_id', albumId);

  // Then insert new positions
  if (trackPositions.length > 0) {
    const insertData = trackPositions.map(tp => ({
      album_id: albumId,
      track_id: tp.track_id,
      position: tp.position,
    }));

    const { error } = await supabase.from('album_tracks').insert(insertData);
    if (error) throw error;
  }
}

// Artist: Add track to album
export async function addTrackToAlbum(
  albumId: string,
  trackId: string,
  position?: number
): Promise<void> {
  // Get max position if not provided
  let trackPosition = position;
  if (!trackPosition) {
    const { data } = await supabase
      .from('album_tracks')
      .select('position')
      .eq('album_id', albumId)
      .order('position', { ascending: false })
      .limit(1)
      .single();
    trackPosition = (data?.position || 0) + 1;
  }

  const { error } = await supabase.from('album_tracks').insert({
    album_id: albumId,
    track_id: trackId,
    position: trackPosition,
  });

  if (error) throw error;
}

// Artist: Remove track from album
export async function removeTrackFromAlbum(
  albumId: string,
  trackId: string
): Promise<void> {
  const { error } = await supabase
    .from('album_tracks')
    .delete()
    .eq('album_id', albumId)
    .eq('track_id', trackId);

  if (error) throw error;
}

// Fan: Get published albums for an artist
export async function getArtistPublishedAlbums(artistId: string): Promise<Album[]> {
  const { data, error } = await supabase
    .from('albums')
    .select('*')
    .eq('artist_id', artistId)
    .eq('is_active', true)
    .eq('is_published', true)
    .order('release_date', { ascending: false });

  if (error) throw error;
  return data || [];
}

// Fan: Get single published album with tracks
export async function getPublishedAlbumWithTracks(
  albumId: string
): Promise<Album | null> {
  const { data: album, error } = await supabase
    .from('albums')
    .select('*')
    .eq('id', albumId)
    .eq('is_published', true)
    .eq('is_active', true)
    .single();

  if (error || !album) return null;

  const { data: albumTracks } = await supabase
    .from('album_tracks')
    .select('*, track:tracks(*)')
    .eq('album_id', albumId)
    .order('position');

  const tracks = (albumTracks || [])
    .filter(at => at.track)
    .map(at => ({
      ...at.track,
      position: at.position,
    }));

  return { ...album, tracks };
}

// Fan: Get published album by slug
export async function getPublishedAlbumBySlug(
  artistSlug: string,
  albumSlug: string
): Promise<Album | null> {
  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('slug', artistSlug)
    .single();

  if (!artist) return null;

  return getPublishedAlbumWithTracks(artist.id);
}
