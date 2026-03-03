'use client';

import { useState } from 'react';
import { AlbumsSection } from '@/components/artist/AlbumCard';
import { ArtistPlaylistsSection } from '@/components/artist/ArtistPlaylistCard';
import { ShopSection } from '@/components/artist/ShopSection';
import { SubscribeButton, TierCards } from '@/components/artist/SubscribeSection';
import { SubscribeCTA } from '@/components/gating';
import { CommunityFeed } from '@/components/community/CommunityFeed';
import { TierConfig, Album, Playlist, Product, Track } from '@/types';
import { GatedTrackPlayer } from '@/components/gating';

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
  };
  tiers: TierConfig[];
  albums: (Album & { track_count: number })[];
  playlists: (Playlist & { track_count: number })[];
  products: Product[];
  tracks: Track[];
  isArtistProfile: boolean;
}

export function ArtistProfileContent({
  artist,
  tiers,
  albums,
  playlists,
  products,
  tracks,
  isArtistProfile,
}: ArtistProfileContentProps) {
  const [activeTab, setActiveTab] = useState<'music' | 'community'>('music');

  const tabs = [
    { id: 'music' as const, label: 'Music' },
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

      {/* Content */}
      <div className="px-4 sm:px-6 lg:px-8 pb-8">
        {activeTab === 'music' && (
          <>
            {/* Albums */}
            <AlbumsSection albums={albums} artistSlug={artist.slug} />

            {/* Artist Playlists */}
            <ArtistPlaylistsSection playlists={playlists || []} artistSlug={artist.slug} />

            {/* Subscription Tiers */}
            <section className="mb-8">
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

            {/* Shop */}
            <ShopSection products={products || []} artistId={artist.id} />

            {/* Tracks */}
            <section>
              <h2 className="text-xl font-semibold text-crwn-text mb-4">Music</h2>
              {tracks && tracks.length > 0 ? (
                <div className="space-y-2">
                  {tracks.map((track) => (
                    <GatedTrackPlayer key={track.id} track={track} artistId={artist.id} />
                  ))}
                </div>
              ) : (
                <p className="text-crwn-text-secondary">No tracks released yet.</p>
              )}
            </section>
          </>
        )}

        {activeTab === 'community' && (
          <CommunityFeed
            artistId={artist.id}
            artistSlug={artist.slug}
            isArtistProfile={isArtistProfile}
            tiers={tiers}
          />
        )}
      </div>
    </>
  );
}
