'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArtistProfileForm } from '@/components/artist/ArtistProfileForm';
import { MusicManager } from '@/components/artist/MusicManager';
import { AlbumManager } from '@/components/artist/AlbumManager';
import { TierManager } from '@/components/artist/TierManager';
import { ShopManager } from '@/components/artist/ShopManager';
import { AnalyticsDashboard } from '@/components/artist/AnalyticsDashboard';
import { PayoutDashboard } from '@/components/artist/PayoutDashboard';
import { ArtistReferralStats } from '@/components/artist/ArtistReferralStats';
import { SyncDashboard } from '@/components/artist/SyncDashboard';
import { PlatformTierModal } from '@/components/onboarding/PlatformTierModal';
import { PlatformBilling } from '@/components/onboarding/PlatformBilling';
import { BackgroundImage } from '@/components/ui/BackgroundImage';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { TierConfig } from '@/types';
import { Check, X, Eye } from 'lucide-react';
import { FadeIn } from '@/components/ui/FadeIn';

function ArtistDashboardContent() {
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();
  const [activeTab, setActiveTab] = useState<'profile' | 'tracks' | 'albums' | 'shop' | 'billing' | 'analytics' | 'tiers' | 'payouts' | 'referrals' | 'sync'>('analytics');
  const [artistId, setArtistId] = useState<string | null>(null);
  const [artistSlug, setArtistSlug] = useState<string>('');
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [showSuccess, setShowSuccess] = useState<string | null>(null);
  const [showPlatformTierModal, setShowPlatformTierModal] = useState(false);
  const [platformTier, setPlatformTier] = useState<string>('starter');

  // Handle query params for tab and upgrade
  useEffect(() => {
    const tab = searchParams.get('tab');
    const upgrade = searchParams.get('upgrade');
    
    if (tab === 'billing') {
      setActiveTab('billing');
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
  }, [searchParams]);

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

  const tabs = [
    { id: 'analytics' as const, label: 'Analytics' },
    { id: 'sync' as const, label: 'Sync' },
    { id: 'profile' as const, label: 'Profile' },
    { id: 'tracks' as const, label: 'Music' },
    { id: 'albums' as const, label: 'Albums' },
    { id: 'shop' as const, label: 'Shop' },
    { id: 'billing' as const, label: 'Billing' },
    { id: 'tiers' as const, label: 'Tiers' },
    { id: 'payouts' as const, label: 'Payouts' },
    { id: 'referrals' as const, label: 'Referrals' },
  ];

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
          <div className="px-4 sm:px-6 lg:px-8 py-6">
            <h1 className="text-2xl font-bold text-crwn-text">Artist Dashboard</h1>
            <p className="text-crwn-text-secondary mt-1">
              Manage your profile, music, and monetization
            </p>
          </div>

          {/* Preview + Tabs */}
          {artistSlug && (
            <div className="px-4 sm:px-6 lg:px-8 mb-2">
              <Link
                href={`/${artistSlug}`}
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
                onClick={() => setActiveTab(tab.id)}
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

        {/* Content */}
        <div key={activeTab} className="px-4 sm:px-6 lg:px-8 py-8 stagger-fade-in">
          {activeTab === 'profile' && <ArtistProfileForm />}
          {activeTab === 'tracks' && <MusicManager />}
          {activeTab === 'albums' && <AlbumManager />}
          {activeTab === 'shop' && <ShopManager />}
          {activeTab === 'billing' && <PlatformBilling />}

          {activeTab === 'analytics' && <AnalyticsDashboard />}
          {activeTab === 'sync' && artistId && (
            <SyncDashboard artistId={artistId} platformTier={platformTier} />
          )}
          {activeTab === 'tiers' && <TierManager />}
          {activeTab === 'payouts' && <PayoutDashboard />}
          {activeTab === 'referrals' && <ArtistReferralStats />}
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
