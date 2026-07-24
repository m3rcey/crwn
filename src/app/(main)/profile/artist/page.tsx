'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/hooks/useAuth';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { RiseMode } from '@/components/artist/RiseMode';
import { PlatformTierModal } from '@/components/onboarding/PlatformTierModal';

// EVERY OTHER TAB IS LAZY, ON PURPOSE.
//
// The dashboard opens on Rise Mode, but these 16 managers were all statically
// imported, so the browser had to download and parse the entire dashboard (charts,
// upload widgets, calendars, the whole shop editor) before Rise Mode could paint.
// An artist who only ever opens Rise paid for all of it, every visit.
//
// Tabs are already render-gated by `visitedTabs`, so a dynamic import changes
// nothing about behavior: the chunk is fetched the first time its tab is opened.
// Rise Mode itself stays STATIC because it is the default tab, and lazy-loading
// the thing that renders immediately would just add a spinner.
// ssr:false is correct here: this whole page is a client component behind an auth
// gate, so none of these ever render on the server anyway.
// Generic on P so each tab keeps its real prop types through the dynamic import.
function lazyTab<P extends object>(load: () => Promise<React.ComponentType<P>>) {
  return dynamic(load, { ssr: false, loading: () => <TabSpinner /> });
}

const ArtistProfileForm = lazyTab(() => import('@/components/artist/ArtistProfileForm').then((m) => m.ArtistProfileForm));
const MusicManager = lazyTab(() => import('@/components/artist/MusicManager').then((m) => m.MusicManager));
const AlbumManager = lazyTab(() => import('@/components/artist/AlbumManager').then((m) => m.AlbumManager));
const TierManager = lazyTab(() => import('@/components/artist/TierManager').then((m) => m.TierManager));
const ShopManager = lazyTab(() => import('@/components/artist/ShopManager').then((m) => m.ShopManager));
const LivestreamManager = lazyTab(() => import('@/components/artist/LivestreamManager').then((m) => m.LivestreamManager));
const AnalyticsDashboard = lazyTab(() => import('@/components/artist/AnalyticsDashboard').then((m) => m.AnalyticsDashboard));
const PayoutDashboard = lazyTab(() => import('@/components/artist/PayoutDashboard').then((m) => m.PayoutDashboard));
const ArtistReferralStats = lazyTab(() => import('@/components/artist/ArtistReferralStats').then((m) => m.ArtistReferralStats));
const ClipperSettings = lazyTab(() => import('@/components/artist/ClipperSettings').then((m) => m.ClipperSettings));
const SyncDashboard = lazyTab(() => import('@/components/artist/SyncDashboard').then((m) => m.SyncDashboard));
const AudienceTab = lazyTab(() => import('@/components/artist/AudienceTab').then((m) => m.AudienceTab));
const PromiseCalendar = lazyTab(() => import('@/components/artist/PromiseCalendar').then((m) => m.PromiseCalendar));
const TeamManager = lazyTab(() => import('@/components/artist/TeamManager').then((m) => m.TeamManager));
const AiManagerCard = lazyTab(() => import('@/components/artist/AiManagerCard').then((m) => m.AiManagerCard));
const AiManagerTeaser = lazyTab(() => import('@/components/artist/AiManagerCard').then((m) => m.AiManagerTeaser));
const PlatformBilling = lazyTab(() => import('@/components/onboarding/PlatformBilling').then((m) => m.PlatformBilling));

function TabSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-crwn-gold" />
    </div>
  );
}
import { BackgroundImage } from '@/components/ui/BackgroundImage';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { TierConfig } from '@/types';
import { Eye } from 'lucide-react';
import { FadeIn } from '@/components/ui/FadeIn';
import { getPostSetupTourSteps } from '@/lib/artistTourSteps';
import { usePageTour } from '@/hooks/usePageTour';
import { TourReplayButton } from '@/components/shared/TourReplayButton';

type TabId = 'rise' | 'profile' | 'tracks' | 'albums' | 'shop' | 'billing' | 'analytics' | 'audience' | 'tiers' | 'payouts' | 'referrals' | 'sync' | 'ai-manager' | 'livestreams' | 'promise' | 'team';

function ArtistDashboardContent() {
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();
  const [activeTab, setActiveTab] = useState<TabId>('rise');
  const [visitedTabs, setVisitedTabs] = useState<Set<TabId>>(new Set(['rise']));
  const [artistId, setArtistId] = useState<string | null>(null);
  const [artistSlug, setArtistSlug] = useState<string>('');
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [showSuccess, setShowSuccess] = useState<string | null>(null);
  const [showPlatformTierModal, setShowPlatformTierModal] = useState(false);
  const [platformTier, setPlatformTier] = useState<string>('starter');

  const switchTab = useCallback((tabId: TabId) => {
    setActiveTab(tabId);
    setVisitedTabs(prev => {
      if (prev.has(tabId)) return prev;
      return new Set(prev).add(tabId);
    });
    // Tell Rise Mode to refetch when the artist returns to it (updated XP/progress
    // + completion celebration for anything they just did on another tab).
    if (tabId === 'rise' && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('rise:activate'));
    }
  }, []);

  // Replay-only. The post-setup tour is a long guided walk that auto-clicks
  // across every tab, so auto-starting it the instant an artist finishes the
  // wizard hijacked the dashboard (it popped up no matter which tab they clicked).
  // enabled:false disables the auto-start; the "?" TourReplayButton below still
  // lets an artist take it on demand (replay is returned regardless of enabled).
  const { replay: replayDashboardTour } = usePageTour({
    tourId: 'dashboard',
    steps: getPostSetupTourSteps(platformTier),
    userId: profile?.id,
    enabled: false,
    delayMs: 1500,
  });
  useEffect(() => {
    const tab = searchParams.get('tab');
    const upgrade = searchParams.get('upgrade');
    
    if (tab === 'billing') {
      switchTab('billing');
    }
    if (tab === 'tiers' || searchParams.get('stripe') === 'success') {
      switchTab('tiers');
    }
    if (tab === 'rise') {
      switchTab('rise');
    }
    if (tab === 'ai-manager') {
      switchTab('ai-manager');
    }
    if (tab === 'audience') {
      switchTab('audience');
    }
    if (tab === 'promise') {
      switchTab('promise');
    }
    if (tab === 'team') {
      switchTab('team');
    }

    if (upgrade === 'success') {
      setShowSuccess('Your plan is now active. Time to build your empire.');
      // Clean URL
      router.replace('/profile/artist?tab=billing', undefined);
    }
  }, [searchParams, router]);

  useEffect(() => {
    async function loadArtistData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check platform_tier first
      const { data: userProfile } = await supabase
        .from('artist_profiles')
        .select('platform_tier')
        .eq('user_id', user.id)
        .single();

      // Show modal if no platform tier selected
      if (!userProfile?.platform_tier) {
        setShowPlatformTierModal(true);
      }

      const { data: artist } = await supabase
        .from('artist_profiles')
        .select('id, slug, tier_config, platform_tier')
        .eq('user_id', user.id)
        .single();

      if (artist) {
        setArtistId(artist.id);
        setArtistSlug(artist.slug || '');
        setPlatformTier(artist.platform_tier || 'starter');

        const tierConfigTiers = (artist.tier_config || []) as TierConfig[];
        setTiers(tierConfigTiers);
      }
    }
    loadArtistData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!profile) {
    return (
      <div className="relative min-h-screen">
        <BackgroundImage src="/backgrounds/bg-dashboard.jpg" />
        <div className="relative z-10 min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-crwn-gold" />
        </div>
      </div>
    );
  }

  const allTabs = [
    { id: 'rise' as const, label: 'Rise Mode', tourId: 'tab-rise' },
    { id: 'ai-manager' as const, label: 'Manager', tourId: 'tab-ai-manager' },
    { id: 'promise' as const, label: 'Promise Calendar', tourId: 'tab-promise' },
    { id: 'analytics' as const, label: 'Analytics', tourId: 'tab-analytics' },
    { id: 'audience' as const, label: 'Audience', tourId: 'tab-audience' },
    { id: 'team' as const, label: 'Team', tourId: 'tab-team' },
    { id: 'tracks' as const, label: 'Music', tourId: 'tab-tracks' },
    { id: 'livestreams' as const, label: 'Live', tourId: 'tab-livestreams' },
    { id: 'sync' as const, label: 'Sync', tourId: 'tab-sync' },
    { id: 'profile' as const, label: 'Profile', tourId: 'tab-profile' },
    { id: 'albums' as const, label: 'Albums', tourId: 'tab-albums' },
    { id: 'shop' as const, label: 'Shop', tourId: 'tab-shop' },
    { id: 'billing' as const, label: 'Billing', tourId: 'tab-billing' },
    { id: 'tiers' as const, label: 'Tiers', tourId: 'tab-tiers' },
    { id: 'payouts' as const, label: 'Payouts', tourId: 'tab-payouts' },
    { id: 'referrals' as const, label: 'Referrals', tourId: 'tab-referrals' },
  ];
  const tabs = allTabs.filter(t => t.id !== 'referrals' || platformTier !== 'starter');

  return (
    <div className="relative min-h-screen">
      {/* Success Toast */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowSuccess(null)}>
          <div className="neu-modal p-8 text-center max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-5xl mb-4">👑</div>
            <h2 className="text-xl font-bold text-crwn-gold mb-2">Welcome to CRWN!</h2>
            <p className="text-crwn-text-secondary text-sm mb-6">{showSuccess}</p>
            <button
              onClick={() => setShowSuccess(null)}
              className="neu-button-accent px-8 py-3 rounded-xl font-semibold"
            >
              Let's Go
            </button>
          </div>
        </div>
      )}
      <BackgroundImage src="/backgrounds/bg-dashboard.jpg" overlayOpacity="bg-black/80" />
      <div className="relative z-10">
        {/* Header */}
        <div className="border-b border-crwn-elevated">
          <div className="px-4 sm:px-6 lg:px-8 pt-4 pb-2 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-crwn-text">Artist Dashboard</h1>
              <p className="text-crwn-text-secondary mt-1">
                Manage your profile, music, and monetization
              </p>
            </div>
            <TourReplayButton onClick={replayDashboardTour} className="shrink-0 mt-1" />
          </div>

          {/* Preview + Tabs */}
          {artistSlug && (
            <div className="px-4 sm:px-6 lg:px-8 mb-2">
              <Link
                href={`/${artistSlug}`}
                data-tour="view-as-fan"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-crwn-text-secondary hover:text-crwn-gold border border-crwn-elevated rounded-full transition-colors"
              >
                <Eye className="w-4 h-4" />
                View as fan
              </Link>
            </div>
          )}
          <div className="px-4 sm:px-6 lg:px-8 flex gap-6 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                data-tour={tab.tourId}
                onClick={() => switchTab(tab.id)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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

        {/* Content — visited tabs stay mounted to preserve state */}
        <div className="px-4 sm:px-6 lg:px-8 py-8">
          {visitedTabs.has('rise') && (
            <div className={activeTab !== 'rise' ? 'hidden' : undefined}>
              <RiseMode />
            </div>
          )}
          <div className={activeTab !== 'ai-manager' ? 'hidden' : undefined}>
            {artistId && <AiManagerCard artistId={artistId} platformTier={platformTier} onSwitchTab={(tab) => switchTab(tab as TabId)} />}
          </div>
          {visitedTabs.has('analytics') && (
            <div className={activeTab !== 'analytics' ? 'hidden' : undefined}>
              {artistId && (
                <AiManagerTeaser artistId={artistId} onNavigate={() => switchTab('ai-manager')} />
              )}
              <AnalyticsDashboard platformTier={platformTier} />
            </div>
          )}
          {visitedTabs.has('audience') && (
            <div className={activeTab !== 'audience' ? 'hidden' : undefined}>
              <AudienceTab />
            </div>
          )}
          {visitedTabs.has('team') && (
            <div className={activeTab !== 'team' ? 'hidden' : undefined}>
              {artistId && <TeamManager artistId={artistId} platformTier={platformTier} />}
            </div>
          )}
          {visitedTabs.has('promise') && (
            <div className={activeTab !== 'promise' ? 'hidden' : undefined}>
              <PromiseCalendar />
            </div>
          )}
          {visitedTabs.has('sync') && (
            <div className={activeTab !== 'sync' ? 'hidden' : undefined}>
              {artistId && <SyncDashboard artistId={artistId} platformTier={platformTier} />}
            </div>
          )}
          {visitedTabs.has('profile') && (
            <div className={activeTab !== 'profile' ? 'hidden' : undefined}>
              <ArtistProfileForm />
            </div>
          )}
          {visitedTabs.has('tracks') && (
            <div className={activeTab !== 'tracks' ? 'hidden' : undefined}>
              <MusicManager />
            </div>
          )}
          {visitedTabs.has('albums') && (
            <div className={activeTab !== 'albums' ? 'hidden' : undefined}>
              <AlbumManager />
            </div>
          )}
          {visitedTabs.has('shop') && (
            <div className={activeTab !== 'shop' ? 'hidden' : undefined}>
              <ShopManager />
            </div>
          )}
          {visitedTabs.has('livestreams') && (
            <div className={activeTab !== 'livestreams' ? 'hidden' : undefined}>
              {artistId && <LivestreamManager artistId={artistId} artistSlug={artistSlug} artistName={profile?.display_name || 'An artist'} tiers={tiers} />}
            </div>
          )}
          {visitedTabs.has('billing') && (
            <div className={activeTab !== 'billing' ? 'hidden' : undefined}>
              <PlatformBilling />
            </div>
          )}
          {visitedTabs.has('tiers') && (
            <div className={activeTab !== 'tiers' ? 'hidden' : undefined}>
              <TierManager />
            </div>
          )}
          {visitedTabs.has('payouts') && (
            <div className={activeTab !== 'payouts' ? 'hidden' : undefined}>
              <PayoutDashboard />
            </div>
          )}
          {visitedTabs.has('referrals') && (
            <div className={activeTab !== 'referrals' ? 'hidden' : undefined}>
              <ArtistReferralStats />
              <ClipperSettings />
            </div>
          )}
        </div>
      </div>

      {/* Platform Tier Modal */}
      <PlatformTierModal
        isOpen={showPlatformTierModal}
        onComplete={() => setShowPlatformTierModal(false)}
      />
    </div>
  );
}

export default function ArtistDashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-crwn-bg flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-crwn-gold" /></div>}>
      <ArtistDashboardContent />
    </Suspense>
  );
}
