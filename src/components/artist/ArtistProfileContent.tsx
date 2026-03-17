'use client';

import { useState, useEffect } from 'react';
import { AlbumsSection } from '@/components/artist/AlbumCard';
import { ArtistPlaylistsSection } from '@/components/artist/ArtistPlaylistCard';
import { ShopSection } from '@/components/artist/ShopSection';
import { TierCards } from '@/components/artist/SubscribeSection';
import { SubscribeCTA } from '@/components/gating';
import { CommunityFeed } from '@/components/community/CommunityFeed';
import { FanLeaderboard } from '@/components/community/FanLeaderboard';
import { TierConfig, Album, Playlist, Product, Track } from '@/types';
import { GatedTrackPlayer } from '@/components/gating';
import { ShareEarnButton } from '@/components/shared/ShareEarnButton';
import { FadeIn } from '@/components/ui/FadeIn';
import { hapticLight } from '@/lib/haptics';
import { EmptyState } from '@/components/ui/EmptyState';
import { FoundingBadge } from '@/components/shared/FoundingBadge';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { startTour } from '@/lib/tour';
import { getArtistPageTourSteps } from '@/lib/artistPageTourSteps';
import { useTourCheck } from '@/hooks/useTourCheck';

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
  commissionRate = 10,
}: ArtistProfileContentProps) {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [activeTab, setActiveTab] = useState<'music' | 'tiers' | 'shop' | 'community' | 'leaderboard'>('music');
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

  // Default to community tab if subscribed, tiers if not
  useEffect(() => {
    if (isSubscribed) {
      setActiveTab('music');
    }
  }, [isSubscribed]);

  // Trigger artist page tour on first visit (only when viewing own page)
  const isOwnPage = isArtistProfile;
  const { shouldShowTour: shouldShowArtistPageTour, startStep: artistPageStartStep, markComplete: markArtistPageTourComplete, saveStep: saveArtistPageStep } = useTourCheck('artist_page', user?.id);

  useEffect(() => {
    if (!isOwnPage || !shouldShowArtistPageTour) return;
    
    const timer = setTimeout(() => {
      startTour(getArtistPageTourSteps(artist.slug), markArtistPageTourComplete, saveArtistPageStep, artistPageStartStep);
    }, 1000);

    return () => clearTimeout(timer);
  }, [isOwnPage, shouldShowArtistPageTour, markArtistPageTourComplete]);

  const tabs = [
    { id: 'music' as const, label: 'Music', tourId: 'fan-tab-music' },
    { id: 'tiers' as const, label: 'Tiers', tourId: 'fan-tab-tiers' },
    { id: 'shop' as const, label: 'Shop', tourId: 'fan-tab-shop' },
    { id: 'community' as const, label: 'Community', tourId: 'fan-tab-community' },
    { id: 'leaderboard' as const, label: 'Leaderboard', tourId: 'fan-tab-leaderboard' },
  ];

  return (
    <>

      {/* Tabs */}
      <div className="px-4 sm:px-6 lg:px-8 mb-3 page-fade-in" data-tour="artist-page-tabs">
        <div className="flex gap-6 overflow-x-auto scrollbar-hide border-b border-crwn-elevated/50 pb-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              data-tour={tab.tourId}
              onClick={() => { hapticLight(); setActiveTab(tab.id); }}
              className={`text-sm font-medium whitespace-nowrap pb-2 transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'text-crwn-gold border-crwn-gold'
                  : 'text-crwn-text-secondary border-transparent hover:text-crwn-text'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>




      {/* Content */}
      <div key={activeTab} className="px-4 sm:px-6 lg:px-8 pb-8 stagger-fade-in">
        {activeTab === 'music' && (
          <div data-tour="artist-page-music">
            {/* Albums */}
            <AlbumsSection albums={albums} artistSlug={artist.slug} />

            {/* Artist Playlists */}
            <ArtistPlaylistsSection playlists={playlists || []} artistSlug={artist.slug} />


            {/* Tracks */}
            <section>
              <h2 className="text-xl font-semibold text-crwn-text mb-4">Music</h2>
              {tracks && tracks.length > 0 ? (
                <div>
                  {tracks.map((track) => (
                    <GatedTrackPlayer key={track.id} track={track} artistId={artist.id} artistSlug={artist.slug} trackList={tracks} />
                  ))}
                </div>
              ) : (
                <EmptyState icon="🎵" title="No Music Yet" description="This artist hasn't uploaded any tracks yet. Check back soon!" />
              )}
            </section>
          </div>
        )}

        {activeTab === 'tiers' && (
          <section data-tour="artist-page-tiers">
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
          <ShopSection products={products || []} artistId={artist.id} artistSlug={artist.slug} />
        )}

        {activeTab === 'leaderboard' && (
          <FanLeaderboard artistId={artist.id} />
        )}

        {activeTab === 'community' && (
          <div className="space-y-6" data-tour="artist-page-community">
                        <CommunityFeed
              artistId={artist.id}
              artistSlug={artist.slug}
              isArtistProfile={isArtistProfile}
              tiers={tiers}
            />
          </div>
        )}


      </div>
    </>
  );
}
