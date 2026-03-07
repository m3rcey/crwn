'use client';

import { useState, useEffect } from 'react';
import { AlbumsSection } from '@/components/artist/AlbumCard';
import { ArtistPlaylistsSection } from '@/components/artist/ArtistPlaylistCard';
import { ShopSection } from '@/components/artist/ShopSection';
import { TierCards } from '@/components/artist/SubscribeSection';
import { SubscribeCTA } from '@/components/gating';
import { CommunityFeed } from '@/components/community/CommunityFeed';
import { CalendlyBooking } from '@/components/booking/CalendlyBooking';
import { TierConfig, Album, Playlist, Product, Track } from '@/types';
import { GatedTrackPlayer } from '@/components/gating';
import { ShareEarnButton } from '@/components/shared/ShareEarnButton';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

interface ArtistProfileContentProps {
  artist: {
    id: string;
    slug: string;
    tagline: string | null;
    banner_url: string | null;
    is_verified: boolean;
    profile: {
      display_name: string | null;
      bio: string | null;
      avatar_url: string | null;
      social_links: Record<string, string> | null;
    } | null;
    calendly_url: string | null;
    booking_enabled: boolean;
    booking_is_free: boolean;
    booking_allowed_tier_ids: string[];
  };
  tiers: TierConfig[];
  albums: (Album & { track_count: number })[];
  playlists: (Playlist & { track_count: number })[];
  products: Product[];
  tracks: Track[];
  isArtistProfile: boolean;
  hasBookingSessions?: boolean;
  commissionRate?: number;
}

export function ArtistProfileContent({
  artist,
  tiers,
  albums,
  playlists,
  products,
  tracks,
  isArtistProfile,
  hasBookingSessions = false,
  commissionRate = 10,
}: ArtistProfileContentProps) {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [activeTab, setActiveTab] = useState<'music' | 'tiers' | 'shop' | 'community' | 'book'>('music');
  const [isSubscribed, setIsSubscribed] = useState(false);

  // Check if user is subscribed to this artist
  useEffect(() => {
    if (!user) return;
    supabase
      .from('subscriptions')
      .select('id')
      .eq('fan_id', user.id)
      .eq('artist_id', artist.id)
      .eq('status', 'active')
      .maybeSingle()
      .then(({ data }) => {
        setIsSubscribed(!!data);
      });
  }, [user, supabase, artist.id]);

  const showBookTab = artist.booking_enabled && (artist.calendly_url || hasBookingSessions);

  const tabs = [
    { id: 'music' as const, label: 'Music' },
    { id: 'tiers' as const, label: 'Tiers' },
    { id: 'shop' as const, label: 'Shop' },
    ...(showBookTab ? [{ id: 'book' as const, label: 'Book' }] : []),
    { id: 'community' as const, label: 'Community' },
  ];

  return (
    <>
      {/* Tabs */}
      <div className="px-4 sm:px-6 lg:px-8 mb-6">
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === tab.id
                  ? 'neu-button-accent text-crwn-bg'
                  : 'neu-button text-crwn-text-secondary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Share & Earn for subscribed fans */}
      {isSubscribed && (
        <div className="px-4 sm:px-6 lg:px-8 mb-4">
          <ShareEarnButton
            artistSlug={artist.slug}
            artistId={artist.id}
            commissionRate={commissionRate}
          />
        </div>
      )}

      {/* Content */}
      <div className="px-4 sm:px-6 lg:px-8 pb-8">
        {activeTab === 'music' && (
          <>
            {/* Albums */}
            <AlbumsSection albums={albums} artistSlug={artist.slug} />

            {/* Artist Playlists */}
            <ArtistPlaylistsSection playlists={playlists || []} artistSlug={artist.slug} />


            {/* Tracks */}
            <section>
              <h2 className="text-xl font-semibold text-crwn-text mb-4">Music</h2>
              {tracks && tracks.length > 0 ? (
                <div className="space-y-2">
                  {tracks.map((track) => (
                    <GatedTrackPlayer key={track.id} track={track} artistId={artist.id} trackList={tracks} />
                  ))}
                </div>
              ) : (
                <p className="text-crwn-text-secondary">No tracks released yet.</p>
              )}
            </section>
          </>
        )}

        {activeTab === 'tiers' && (
          <section>
            <h2 className="text-xl font-semibold text-crwn-text mb-4">Subscription Tiers</h2>
            {tiers.length > 0 ? (
              <TierCards tiers={tiers} artistSlug={artist.slug} artistId={artist.id} />
            ) : (
              <SubscribeCTA
                artistName={artist.profile?.display_name || 'this artist'}
                artistSlug={artist.slug}
                tierPrice={undefined}
              />
            )}
          </section>
        )}
        {activeTab === 'shop' && (
          <ShopSection products={products || []} artistId={artist.id} />
        )}

        {activeTab === 'community' && (
          <CommunityFeed
            artistId={artist.id}
            artistSlug={artist.slug}
            isArtistProfile={isArtistProfile}
            tiers={tiers}
          />
        )}

        {activeTab === 'book' && (
          <CalendlyBooking
            artist={{
              id: artist.id,
              slug: artist.slug,
              profile: artist.profile,
            }}
            calendlyUrl={artist.calendly_url}
            bookingIsFree={artist.booking_is_free}
            bookingAllowedTierIds={artist.booking_allowed_tier_ids || []}
          />
        )}
      </div>
    </>
  );
}
