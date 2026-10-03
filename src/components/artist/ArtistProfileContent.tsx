'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Lightbulb } from 'lucide-react';
import { ArtistMusicSection } from '@/components/artist/ArtistMusicSection';
import { ShopSection } from '@/components/artist/ShopSection';
import { MemberFilesSection } from '@/components/artist/MemberFilesSection';
import { TierCards } from '@/components/artist/SubscribeSection';
import { CreditsTeaser } from '@/components/credits/CreditsTeaser';
import type { CreditsTeaserData } from '@/lib/projectCredits/server';
import type { ProjectLike } from '@/lib/tierSongs';
import { SubscribeCTA } from '@/components/gating';
import { CommunityFeed } from '@/components/community/CommunityFeed';
import { ArtistMissions } from '@/components/missions/ArtistMissions';
import { FanLeaderboard } from '@/components/community/FanLeaderboard';
import { LiveSessionsList } from '@/components/live/LiveSessionsList';
import { LiveSession } from '@/types/live';
import { TierConfig, Album, Playlist, Product, Track } from '@/types';
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
  /** Ids of the tracks that sit on an album (a track on none is a single). */
  albumTrackIds?: string[];
  /** True ONLY for the artist who owns this page (never "viewer is an artist"). */
  isOwner: boolean;
  commissionRate?: number;
  liveSessions?: LiveSession[];
  /** Projects with their track ids, so the tier cards can show whole projects. */
  tierProjects?: ProjectLike[];
  /** The artist's live project-credits offer, shown on the Tiers and Shop tabs. */
  creditsTeaser?: CreditsTeaserData | null;
}

export function ArtistProfileContent({
  artist,
  tiers,
  albums,
  playlists,
  products,
  tracks,
  albumTrackIds = [],
  isOwner,
  commissionRate = 10,
  liveSessions = [],
  tierProjects = [],
  creditsTeaser = null,
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
  // ?tab=community is the Promise to Delivery fast action for member posts: the composer lives
  // on this page, so the owner is sent straight to it. A pointer only: unknown values fall
  // through to the normal default.
  // Any real tab can be linked to (?tab=tiers, ?tab=shop, ?tab=live...), so a post, an email or
  // a support answer can send a fan straight to it (2026-10-03: only community worked, so a link to
  // Tiers opened Music). Still a pointer only: an unknown value falls through to the default.
  const requestedTab = searchParams.get('tab');
  const LINKABLE_TABS = ['movement', 'music', 'live', 'tiers', 'shop', 'community', 'leaderboard'] as const;
  type ArtistTab = (typeof LINKABLE_TABS)[number];
  const linked = (LINKABLE_TABS as readonly string[]).includes(requestedTab ?? '') ? (requestedTab as ArtistTab) : null;
  const [activeTab, setActiveTab] = useState<ArtistTab>(
    // A join started inside a community room returns to that room (?tab=community&room=),
    // so the explicit tab wins over the checkout default.
    linked ?? (returningFromCheckout ? 'tiers' : 'music'),
  );

  // A tab's content starts under the banner, the photo and the Earn box, about 600px down on a
  // phone, so a tab's own button landed below the fold (measured, 2026-10-03). Opening a tab from a
  // link, or tapping one, brings the tab bar to the top so the tab's first screen is its content.
  // A call to action is always above the fold (CLAUDE.md).
  const tabBarRef = useRef<HTMLDivElement>(null);
  const bringTabsUp = (smooth: boolean) => {
    const el = tabBarRef.current;
    if (!el || el.getBoundingClientRect().top < 120) return;
    el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  };
  useEffect(() => {
    if (!linked || linked === 'music') return;
    const t = setTimeout(() => bringTabsUp(false), 50);
    return () => clearTimeout(t);
    // Once, for the tab the link named.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <div ref={tabBarRef} className="px-4 sm:px-6 lg:px-8 mt-6 mb-3 page-fade-in scroll-mt-2" data-tour="artist-page-tabs">
        <div className="flex gap-6 overflow-x-auto scrollbar-hide border-b border-crwn-elevated/50 pb-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              data-tour={tab.tourId}
              onClick={() => { hapticLight(); setActiveTab(tab.id); if (tab.id !== 'music') bringTabsUp(true); }}
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
            {tracks && tracks.length > 0 ? (
              <ArtistMusicSection
                artistId={artist.id}
                artistSlug={artist.slug}
                tracks={tracks}
                albums={albums}
                playlists={playlists || []}
                albumTrackIds={albumTrackIds}
              />
            ) : (
              <EmptyState icon="🎵" title="No Music Yet" description="This artist hasn't uploaded any tracks yet. Check back soon!" />
            )}

            {/* Member downloads (stems and packs). Renders nothing when the artist has none. */}
            <MemberFilesSection artistId={artist.id} />
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
              <TierCards tiers={tiers} artistSlug={artist.slug} artistId={artist.id} tracks={tracks} projects={tierProjects} />
            ) : (
              <SubscribeCTA
                artistName={artist.profile?.display_name || 'this artist'}
                artistSlug={artist.slug}
                tierPrice={undefined}
              />
            )}
            {creditsTeaser && <CreditsTeaser teaser={creditsTeaser} />}
          </section>
        )}
        {activeTab === 'shop' && (
          <>
            {creditsTeaser && <div className="mb-8">{<CreditsTeaser teaser={creditsTeaser} />}</div>}
            {/* With credits on sale, an empty shop's "nothing here yet" would contradict the offer
                right above it, so the shop renders only when it has something of its own. */}
            {(!creditsTeaser || (products || []).length > 0 || artist.merch_store_url) && (
              <ShopSection products={products || []} artistId={artist.id} artistSlug={artist.slug} merchStoreUrl={artist.merch_store_url} />
            )}
          </>
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
