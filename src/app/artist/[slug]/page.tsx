import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Image from 'next/image';
import { GatedTrackPlayer } from '@/components/gating';
import { SubscribeButton, TierCards } from '@/components/artist/SubscribeSection';
import { SubscribeCTA } from '@/components/gating';
import { TierConfig } from '@/types';
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
    return {
      title: 'Artist Not Found | CRWN',
    };
  }

  const artistName = artist.profile?.display_name || 'Artist';
  const description = artist.profile?.bio || `Check out ${artistName} on CRWN - the all-in-one platform for music artists to monetize, connect with fans, and build community.`;

  return {
    title: `${artistName} | CRWN`,
    description,
    openGraph: {
      title: `${artistName} | CRWN`,
      description,
      type: 'profile',
      url: `https://crwn.vercel.app/artist/${slug}`,
      siteName: 'CRWN',
      images: artist.profile?.avatar_url ? [
        {
          url: artist.profile.avatar_url,
          width: 400,
          height: 400,
          alt: artistName,
        }
      ] : [],
    },
    twitter: {
      card: 'summary',
      title: `${artistName} | CRWN`,
      description,
      images: artist.profile?.avatar_url ? [artist.profile.avatar_url] : [],
    },
  };
}

export default async function ArtistPage({ params }: ArtistPageProps) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();

  // Fetch artist profile with user profile
  const { data: artist, error } = await supabase
    .from('artist_profiles')
    .select(`
      *,
      profile:profiles(*)
    `)
    .eq('slug', slug)
    .single();

  if (error || !artist) {
    notFound();
  }

  // Fetch artist's tracks
  const { data: tracks } = await supabase
    .from('tracks')
    .select('*')
    .eq('artist_id', artist.id)
    .order('created_at', { ascending: false });

  // Fetch subscription tiers from subscription_tiers table
  const { data: dbTiers } = await supabase
    .from('subscription_tiers')
    .select('*')
    .eq('artist_id', artist.id)
    .eq('is_active', true)
    .order('price', { ascending: true });

  // Parse tier_config for legacy support
  let tierConfigTiers: TierConfig[] = [];
  if (artist.tier_config) {
    if (typeof artist.tier_config === 'string') {
      try {
        tierConfigTiers = JSON.parse(artist.tier_config);
      } catch {
        tierConfigTiers = [];
      }
    } else if (Array.isArray(artist.tier_config)) {
      tierConfigTiers = artist.tier_config as TierConfig[];
    }
  }

  // Use database tiers, fallback to tier_config
  const tiers = dbTiers && dbTiers.length > 0 
    ? dbTiers.map(t => ({
        id: t.id,
        name: t.name,
        price: t.price,
        description: t.description,
        benefits: t.access_config?.benefits || [],
      }))
    : tierConfigTiers;

  return (
    <div className="min-h-screen bg-crwn-bg">
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
          <SubscribeButton tiers={tiers} artistSlug={slug} />
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

      {/* Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        {/* Subscription Tiers */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-crwn-text mb-4">Subscription Tiers</h2>
          {tiers.length > 0 ? (
            <TierCards tiers={tiers} artistSlug={slug} />
          ) : (
            <SubscribeCTA
              artistName={artist.profile?.display_name || 'this artist'}
              artistSlug={slug}
              tierPrice={undefined}
            />
          )}
        </section>

        {/* Tracks */}
        <section>
          <h2 className="text-xl font-semibold text-crwn-text mb-4">Music</h2>
          {tracks && tracks.length > 0 ? (
            <div className="space-y-2">
              {tracks.map((track) => (
                <GatedTrackPlayer
                  key={track.id}
                  track={track}
                  artistId={artist.id}
                />
              ))}
            </div>
          ) : (
            <p className="text-crwn-text-secondary">No tracks released yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
