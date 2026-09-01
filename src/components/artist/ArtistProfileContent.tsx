'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Lightbulb } from 'lucide-react';
import { AlbumsSection } from '@/components/artist/AlbumCard';
import { ArtistPlaylistsSection } from '@/components/artist/ArtistPlaylistCard';
import { ShopSection } from '@/components/artist/ShopSection';
import { MemberFilesSection } from '@/components/artist/MemberFilesSection';
import { TierCards } from '@/components/artist/SubscribeSection';
import { SubscribeCTA } from '@/components/gating';
import { CommunityFeed } from '@/components/community/CommunityFeed';
import { ArtistMissions } from '@/components/missions/ArtistMissions';
import { FanLeaderboard } from '@/components/community/FanLeaderboard';
import { LiveSessionsList } from '@/components/live/LiveSessionsList';
import { LiveSession } from '@/types/live';
import { TierConfig, Album, Playlist, Product, Track } from '@/types';
import { GatedTrackPlayer } from '@/components/gating';
import { FadeIn } from '@/components/ui/FadeIn';
import { hapticLight } from '@/lib/haptics';
import { EmptyState } from '@/components/ui/EmptyState';
import { FoundingBadge } from '@/components/shared/FoundingBadge';
import { EarnWithArtist } from '@/components/artist/EarnWithArtist';
import { MovementStats } from '@/components/artist/MovementStats';
import { ArtistCityUnlocks } from '@/components/artist/ArtistCityUnlocks';
import { ArtistBounties } from '@/components/artist/ArtistBounties';
import { ArtistRoadCampaign } from '@/components/artist/ArtistRoadCampaign';
import type { ClipperRateStep } from '@/lib/clipperRate';
import { useAuth } from '@/hooks/useAuth';
import { useArtistPreview } from '@/hooks/useArtistPreview';
import { startTour } from '@/lib/tour';
import { getArtistPageTourSteps } from '@/lib/artistPageTourSteps';
import { useTourCheck } from '@/hooks/useTourCheck';

interface ArtistProfileContentProps {
  artist: {
    id: string;
    slug: string;
    user_id: string;
    tagline: string | null;
    banner_url: string | null;
    merch_store_url?: string | null;
    is_verified: boolean;
    platform_tier?: string | null;
    referral_commission_rate?: number | null;
    clipper_commission_rate?: number | null;
    clipper_rate_schedule?: ClipperRateStep[] | null;
    clipper_campaign_started_at?: string | null;
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
  /** True ONLY for the artist who owns this page (never "viewer is an artist"). */
  isOwner: boolean;
  commissionRate?: number;
  liveSessions?: LiveSession[];
}

export function ArtistProfileContent({
  artist,
  tiers,
  albums,
  playlists,
  products,
  tracks,
  isOwner,
  commissionRate = 10,
  liveSessions = [],
}: ArtistProfileContentProps) {
  const { user } = useAuth();
  // While previewing, the owner should be treated as the fan they picked: owner
  // controls (moderation, the composer's artist voice) disappear, and the
  // fan-only blocks they normally never see appear.
  const { previewing } = useArtistPreview();
  const isArtistProfile = isOwner && !previewing;
  const router = useRouter();
  const searchParams = useSearchParams();
  const returningFromCheckout = searchParams.get('subscription') === 'success' || searchParams.get('subscription') === 'canceled';
  // Music is the default landing tab. A fan who lands on an artist page came for
  // the songs, and Movement asked them to care about the artist's campaign before
  // they had heard anything. Returning from checkout still lands on Tiers.
  const [activeTab, setActiveTab] = useState<'movement' | 'music' | 'live' | 'tiers' | 'shop' | 'community' | 'leaderboard'>(returningFromCheckout ? 'tiers' : 'music');

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

  // Music leads. It is the default tab, and a default that is not the leftmost
  // item reads as "you are somewhere odd" the moment the page paints. Movement
  // sits second: it asks a fan to care about the campaign, which is a question
  // worth asking only after they have heard something.
  const tabs = [
    { id: 'music' as const, label: 'Music', tourId: 'fan-tab-music' },
    { id: 'movement' as const, label: 'Movement', tourId: 'fan-tab-movement' },
    ...(liveSessions.length > 0 ? [{ id: 'live' as const, label: 'Live', tourId: 'fan-tab-live' }] : []),
    { id: 'tiers' as const, label: 'Tiers', tourId: 'fan-tab-tiers' },
    { id: 'shop' as const, label: 'Shop', tourId: 'fan-tab-shop' },
    { id: 'community' as const, label: 'Community', tourId: 'fan-tab-community' },
    { id: 'leaderboard' as const, label: 'Leaderboard', tourId: 'fan-tab-leaderboard' },
  ];

  return (
    <>
      {/* Earn With This Artist — surfaces the artist's live promotion (share/clip
          commission + step-down timer) for fans. Hides itself on the owner's own
          page and when no promotion is active. Hidden while the Movement tab is
          active — the same card renders inside that tab, never twice. */}
      {activeTab !== 'movement' && (
        <EarnWithArtist
          artistSlug={artist.slug}
          artistName={artist.profile?.display_name || 'this artist'}
          artistUserId={artist.user_id}
          platformTier={artist.platform_tier ?? null}
          referralRate={artist.referral_commission_rate ?? null}
          clipperStandardRate={artist.clipper_commission_rate || 0}
          clipperSchedule={artist.clipper_rate_schedule ?? null}
          clipperCampaignStartedAt={artist.clipper_campaign_started_at ?? null}
        />
      )}

      {/* Tabs */}
      <div className="px-4 sm:px-6 lg:px-8 mt-6 mb-3 page-fade-in" data-tour="artist-page-tabs">
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
        {activeTab === 'movement' && (
          <div className="space-y-6" data-tour="artist-page-movement">
            {/* Current Mission — the active Road-To campaign hero (renders if one exists). */}
            <ArtistRoadCampaign
              artistId={artist.id}
              artistSlug={artist.slug}
              artistName={artist.profile?.display_name || 'This artist'}
              onSupportMoney={() => setActiveTab('tiers')}
            />

            {/* The artist's live promotion — fans see the earn card; the owner
                sees a preview (or a set-up prompt when nothing is running). */}
            <EarnWithArtist
              artistSlug={artist.slug}
              artistName={artist.profile?.display_name || 'this artist'}
              artistUserId={artist.user_id}
              platformTier={artist.platform_tier ?? null}
              referralRate={artist.referral_commission_rate ?? null}
              clipperStandardRate={artist.clipper_commission_rate || 0}
              clipperSchedule={artist.clipper_rate_schedule ?? null}
              clipperCampaignStartedAt={artist.clipper_campaign_started_at ?? null}
              ownerPreview={isOwnPage}
              embedded
            />

            {/* Active missions — same fan-facing block as the Community tab. */}
            {!isArtistProfile && (
              <ArtistMissions
                artistId={artist.id}
                artistSlug={artist.slug}
                artistName={artist.profile?.display_name || 'This artist'}
              />
            )}

            {/* City Unlocks + Clip Bounties — fan-actionable, only render when active. */}
            <ArtistCityUnlocks artistId={artist.id} />
            <ArtistBounties artistId={artist.id} />

            {/* Proof of Movement — public aggregates only (counts + top city). */}
            <MovementStats artistId={artist.id} />

            {/* Top Supporters — compact top 3; full list lives on the Leaderboard tab. */}
            <section>
              <FanLeaderboard artistId={artist.id} limit={3} />
              <button
                onClick={() => { hapticLight(); setActiveTab('leaderboard'); }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-crwn-gold hover:text-crwn-gold/80 transition-colors mt-3"
              >
                View full leaderboard
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </section>
          </div>
        )}

        {activeTab === 'music' && (
          <div data-tour="artist-page-music">
            {/* Albums */}
            <AlbumsSection albums={albums} artistSlug={artist.slug} />

            {/* Artist Playlists */}
            <ArtistPlaylistsSection playlists={playlists || []} artistSlug={artist.slug} />

            {/* Member downloads (stems and packs). Renders nothing when the artist has none. */}
            <MemberFilesSection artistId={artist.id} />


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

        {activeTab === 'live' && (
          <section data-tour="artist-page-live">
            <LiveSessionsList sessions={liveSessions} artistId={artist.id} artistSlug={artist.slug} />
          </section>
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
          <ShopSection products={products || []} artistId={artist.id} artistSlug={artist.slug} merchStoreUrl={artist.merch_store_url} />
        )}

        {activeTab === 'leaderboard' && (
          <FanLeaderboard artistId={artist.id} />
        )}

        {activeTab === 'community' && (
          <div className="space-y-6" data-tour="artist-page-community">
            {/* Active missions — fans join (a commitment we record honestly; never auto-completed). */}
            {!isArtistProfile && (
              <ArtistMissions
                artistId={artist.id}
                artistSlug={artist.slug}
                artistName={artist.profile?.display_name || 'This artist'}
              />
            )}
            {/* Fan mission suggestions — a proposal only; the artist approves and sets the reward. */}
            {!isArtistProfile && (
              <button
                onClick={() => router.push(`/${artist.slug}/suggest-mission`)}
                className="inline-flex items-center gap-2 text-sm font-medium text-crwn-text-secondary hover:text-crwn-gold transition-colors"
              >
                <Lightbulb className="w-4 h-4 text-crwn-gold" />
                Got a mission idea for {artist.profile?.display_name || 'this artist'}? Suggest a mission
              </button>
            )}
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
