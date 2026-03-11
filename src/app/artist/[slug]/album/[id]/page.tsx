import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { Metadata } from 'next';
import { AlbumShareContent } from '@/components/share/AlbumShareContent';

interface AlbumPageProps {
  params: Promise<{ slug: string; id: string }>;
}

export async function generateMetadata({ params }: AlbumPageProps): Promise<Metadata> {
  const { slug, id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id, profile:profiles(display_name, avatar_url)')
    .eq('slug', slug)
    .single();

  if (!artist) return { title: 'Not Found | CRWN' };

  const artistProfile = Array.isArray(artist.profile) ? artist.profile[0] : artist.profile;

  const { data: album } = await supabase
    .from('albums')
    .select('title, cover_art_url, is_free')
    .eq('id', id)
    .eq('artist_id', artist.id)
    .single();

  if (!album) return { title: 'Album Not Found | CRWN' };

  const artistName = artistProfile?.display_name || 'Artist';
  const description = `Listen to "${album.title}" by ${artistName} on CRWN`;
  const ogImage = album.cover_art_url || artistProfile?.avatar_url || '/icon-512x512.png';
  const url = `https://thecrwn.app/artist/${slug}/album/${id}`;

  return {
    title: `${album.title} — ${artistName} | CRWN`,
    description,
    metadataBase: new URL('https://thecrwn.app'),
    openGraph: {
      title: `${album.title} — ${artistName}`,
      description,
      url,
      siteName: 'CRWN',
      images: ogImage ? [{ url: ogImage, width: 600, height: 600, alt: album.title }] : [],
      type: 'music.album',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${album.title} — ${artistName}`,
      description,
      images: ogImage ? [ogImage] : [],
    },
  };
}

export default async function AlbumPage({ params }: AlbumPageProps) {
  const { slug, id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id, slug, profile:profiles(display_name, avatar_url)')
    .eq('slug', slug)
    .single();

  if (!artist) notFound();

  const artistProfile = Array.isArray(artist.profile) ? artist.profile[0] : artist.profile;

  const { data: album } = await supabase
    .from('albums')
    .select('*')
    .eq('id', id)
    .eq('artist_id', artist.id)
    .eq('is_active', true)
    .single();

  if (!album) notFound();

  // Get album tracks
  const { data: albumTracks } = await supabase
    .from('album_tracks')
    .select('track_number, track:tracks(*)')
    .eq('album_id', id)
    .order('track_number', { ascending: true });

  // Get tiers
  const { data: tiers } = await supabase
    .from('subscription_tiers')
    .select('id, name, price')
    .eq('artist_id', artist.id)
    .eq('is_active', true)
    .order('price', { ascending: true });

  return (
    <AlbumShareContent
      album={album}
      tracks={(albumTracks || []).map((at: unknown) => (at as { track: never }).track).filter((t: any) => t && t.is_active !== false)}
      artist={{
        id: artist.id,
        slug: artist.slug,
        displayName: artistProfile?.display_name || 'Artist',
        avatarUrl: artistProfile?.avatar_url || null,
      }}
      tiers={tiers || []}
    />
  );
}
