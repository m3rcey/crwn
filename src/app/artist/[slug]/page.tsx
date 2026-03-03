import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Image from 'next/image';
import { SubscribeButton, TierCards } from '@/components/artist/SubscribeSection';
import { ShopSection } from '@/components/artist/ShopSection';
import { SubscribeCTA } from '@/components/gating';
import { TierConfig } from '@/types';
import { BackgroundImage } from '@/components/ui/BackgroundImage';
import { ArtistProfileContent } from '@/components/artist/ArtistProfileContent';
import type { Metadata } from 'next';

interface ArtistPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ArtistPageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('*, profile:profiles(*)')
    .eq('slug', slug)
    .single();

  if (!artist) {
    return { title: 'Artist Not Found' };
  }

  return {
    title: `${artist.profile?.display_name || 'Artist'} | CRWN`,
    description: artist.tagline || `Listen to ${artist.profile?.display_name || 'this artist'} on CRWN`,
  };
}

export default async function ArtistPage({ params }: ArtistPageProps) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();

  // Check if user is logged in and if this is their profile
  const { data: { session } } = await supabase.auth.getSession();
  
  let isArtistProfile = false;
  if (session?.user) {
    const { data: artistProfile } = await supabase
      .from('artist_profiles')
      .select('id')
      .eq('user_id', session.user.id)
      .maybeSingle();
    
    isArtistProfile = artistProfile?.id !== undefined;
  }

  // Fetch artist profile
  const { data: artist, error } = await supabase
    .from('artist_profiles')
    .select('*, profile:profiles(*)')
    .eq('slug', slug)
    .single();

  if (error || !artist) {
    notFound();
  }

  // Parse tier config
  const tierConfigTiers = (artist.tier_config || []) as TierConfig[];

  // Build tiers array for subscriptions
  const tiers = tierConfigTiers.length > 0
    ? tierConfigTiers.map((t: TierConfig) => ({
        id: t.id,
        name: t.name,
        price: t.price,
        description: t.description,
        benefits: t.benefits || [],
      }))
    : [];

  // Fetch artist's tracks
  const { data: tracks } = await supabase
    .from('tracks')
    .select('*')
    .eq('artist_id', artist.id)
    .order('position', { ascending: true });

  // Fetch artist's albums
  const { data: albums } = await supabase
    .from('albums')
    .select('*')
    .eq('artist_id', artist.id)
    .eq('is_active', true)
    .order('release_date', { ascending: false });

  // Get album track counts
  const albumsWithCounts = await Promise.all(
    ( albums || []).map(async (album) => {
      const { count } = await supabase
        .from('album_tracks')
        .select('*', { count: 'exact', head: true })
        .eq('album_id', album.id);
      return { ...album, track_count: count || 0 };
    })
  );

  // Fetch artist's playlists
  const { data: playlists } = await supabase
    .from('playlists')
    .select('*')
    .eq('artist_id', artist.id)
    .eq('is_artist_playlist', true)
    .eq('is_active', true)
    .order('position', { ascending: true });

  // Get playlist track counts
  const playlistsWithCounts = await Promise.all(
    (playlists || []).map(async (playlist) => {
      const { count } = await supabase
        .from('playlist_tracks')
        .select('*', { count: 'exact', head: true })
        .eq('playlist_id', playlist.id);
      return { ...playlist, track_count: count || 0 };
    })
  );

  // Fetch shop products
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('artist_id', artist.id)
    .eq('is_active', true)
    .order('position', { ascending: true });

  return (
    <div className="relative min-h-screen">
      <BackgroundImage src="/backgrounds/bg-artist.jpg" overlayOpacity="bg-black/80" />
      <div className="relative z-10">
        {/* Banner */}
        <div className="relative h-48 sm:h-64 md:h-80 w-full">
          {artist.banner_url ? (
            <Image
              src={artist.banner_url}
              alt={`${artist.profile?.display_name || 'Artist'} banner`}
              fill
              className="object-cover"
              priority
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-b from-crwn-elevated to-crwn-bg" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-crwn-bg via-transparent to-transparent" />
        </div>

        {/* Profile Header */}
        <div className="px-4 sm:px-6 lg:px-8 -mt-16 relative z-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4 sm:gap-6">
            {/* Avatar */}
            <div className="relative w-32 h-32 sm:w-40 sm:h-40 rounded-full border-4 border-crwn-bg overflow-hidden bg-crwn-surface">
              {artist.profile?.avatar_url ? (
                <Image
                  src={artist.profile.avatar_url}
                  alt={artist.profile?.display_name || 'Artist'}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl text-crwn-text-secondary">
                  🎵
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 mb-2">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-crwn-text">
                  {artist.profile?.display_name || 'Artist Name'}
                </h1>
                {artist.is_verified && (
                  <span className="text-crwn-gold" title="Verified Artist">✓</span>
                )}
              </div>
              {artist.tagline && (
                <p className="text-crwn-text-secondary mt-1">{artist.tagline}</p>
              )}
            </div>

            {/* Subscribe Button */}
            <SubscribeButton tiers={tiers} artistSlug={slug} artistId={artist.id} />
          </div>

          {/* Bio */}
          {artist.profile?.bio && (
            <div className="mt-6 max-w-2xl">
              <p className="text-crwn-text-secondary whitespace-pre-wrap">
                {artist.profile.bio}
              </p>
            </div>
          )}

          {/* Social Links */}
          {artist.profile?.social_links && typeof artist.profile.social_links === 'object' && Object.keys(artist.profile.social_links).length > 0 && (
            <div className="mt-4 flex gap-3">
              {Object.entries(artist.profile.social_links).map(([platform, url]) => (
                <a
                  key={platform}
                  href={url as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-crwn-gold hover:text-crwn-gold-hover text-sm capitalize"
                >
                  {platform}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Content with Tabs */}
        <ArtistProfileContent
          artist={artist}
          tiers={tiers}
          albums={albumsWithCounts}
          playlists={playlistsWithCounts}
          products={products || []}
          tracks={tracks || []}
          isArtistProfile={isArtistProfile}
        />
      </div>
    </div>
  );
}
