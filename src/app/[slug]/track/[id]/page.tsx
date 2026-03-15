import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { Metadata } from 'next';
import { TrackShareContent } from '@/components/share/TrackShareContent';

interface TrackPageProps {
  params: Promise<{ slug: string; id: string }>;
}

export async function generateMetadata({ params }: TrackPageProps): Promise<Metadata> {
  const { slug, id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id, profile:profiles(display_name, avatar_url)')
    .eq('slug', slug)
    .single();

  if (!artist) return { title: 'Not Found | CRWN' };

  const artistProfile = Array.isArray(artist.profile) ? artist.profile[0] : artist.profile;

  const { data: track } = await supabase
    .from('tracks')
    .select('title, album_art_url, duration, is_free')
    .eq('id', id)
    .single();

  if (!track) return { title: 'Track Not Found | CRWN' };

  const artistName = artistProfile?.display_name || 'Artist';
  const description = `Listen to "${track.title}" by ${artistName} on CRWN`;
  const ogImage = track.album_art_url || artistProfile?.avatar_url || '/icon-512x512.png';
  const url = `https://thecrwn.app/${slug}/track/${id}`;

  return {
    title: `${track.title} — ${artistName} | CRWN`,
    description,
    metadataBase: new URL('https://thecrwn.app'),
    openGraph: {
      title: `${track.title} — ${artistName}`,
      description,
      url,
      siteName: 'CRWN',
      images: ogImage ? [{ url: ogImage, width: 600, height: 600, alt: track.title }] : [],
      type: 'music.song',
    },
    twitter: {
      card: 'summary',
      title: `${track.title} — ${artistName}`,
      description,
      images: ogImage ? [ogImage] : [],
    },
  };
}

export default async function TrackPage({ params }: TrackPageProps) {
  const { slug, id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id, slug, profile:profiles(display_name, avatar_url), banner_url, tagline')
    .eq('slug', slug)
    .single();

  if (!artist) notFound();

  const artistProfile = Array.isArray(artist.profile) ? artist.profile[0] : artist.profile;

  const { data: track } = await supabase
    .from('tracks')
    .select('*')
    .eq('id', id)
    .eq('artist_id', artist.id)
    .single();

  if (!track) notFound();

  // Get tiers for subscribe CTA
  const { data: tiers } = await supabase
    .from('subscription_tiers')
    .select('id, name, price')
    .eq('artist_id', artist.id)
    .eq('is_active', true)
    .order('price', { ascending: true });

  return (
    <TrackShareContent
      track={track}
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
