'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { ArtistProfileForm } from '@/components/artist/ArtistProfileForm';
import { MusicManager } from '@/components/artist/MusicManager';
import { AlbumManager } from '@/components/artist/AlbumManager';
import { TierManager } from '@/components/artist/TierManager';
import { ShopManager } from '@/components/artist/ShopManager';
import { AnalyticsDashboard } from '@/components/artist/AnalyticsDashboard';
import { PayoutDashboard } from '@/components/artist/PayoutDashboard';
import { BookingSettings } from '@/components/booking/BookingSettings';
import { SessionManager } from '@/components/booking/SessionManager';
import { PlatformTierModal } from '@/components/onboarding/PlatformTierModal';
import { BackgroundImage } from '@/components/ui/BackgroundImage';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { TierConfig } from '@/types';

export default function ArtistDashboardPage() {
  const { profile } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [activeTab, setActiveTab] = useState<'profile' | 'tracks' | 'albums' | 'shop' | 'booking' | 'analytics' | 'tiers' | 'payouts'>('profile');
  const [artistId, setArtistId] = useState<string | null>(null);
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [showPlatformTierModal, setShowPlatformTierModal] = useState(false);
  const [bookingSettings, setBookingSettings] = useState({
    calendly_url: null as string | null,
    booking_enabled: false,
    booking_is_free: false,
    booking_allowed_tier_ids: [] as string[],
  });

  useEffect(() => {
    async function loadArtistData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check platform_tier first
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('platform_tier')
        .eq('id', user.id)
        .single();

      // Show modal if no platform tier selected
      if (!userProfile?.platform_tier) {
        setShowPlatformTierModal(true);
      }

      const { data: artist } = await supabase
        .from('artist_profiles')
        .select('id, tier_config, calendly_url, booking_enabled, booking_is_free, booking_allowed_tier_ids')
        .eq('user_id', user.id)
        .single();

      if (artist) {
        setArtistId(artist.id);
        setBookingSettings({
          calendly_url: artist.calendly_url,
          booking_enabled: artist.booking_enabled,
          booking_is_free: artist.booking_is_free,
          booking_allowed_tier_ids: artist.booking_allowed_tier_ids || [],
        });

        const tierConfigTiers = (artist.tier_config || []) as TierConfig[];
        setTiers(tierConfigTiers);
      }
    }
    loadArtistData();
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

  const tabs = [
    { id: 'profile' as const, label: 'Profile' },
    { id: 'tracks' as const, label: 'Music' },
    { id: 'albums' as const, label: 'Albums' },
    { id: 'shop' as const, label: 'Shop' },
    { id: 'booking' as const, label: 'Booking' },
    { id: 'analytics' as const, label: 'Analytics' },
    { id: 'tiers' as const, label: 'Tiers' },
    { id: 'payouts' as const, label: 'Payouts' },
  ];

  return (
    <div className="relative min-h-screen">
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

          {/* Tabs */}
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
        <div className="px-4 sm:px-6 lg:px-8 py-8">
          {activeTab === 'profile' && <ArtistProfileForm />}
          {activeTab === 'tracks' && <MusicManager />}
          {activeTab === 'albums' && <AlbumManager />}
          {activeTab === 'shop' && <ShopManager />}
          {activeTab === 'booking' && artistId && (
            <div className="space-y-6">
              <BookingSettings
                artistId={artistId}
                tiers={tiers}
                initialSettings={bookingSettings}
              />
              <SessionManager artistId={artistId} />
            </div>
          )}
          {activeTab === 'analytics' && <AnalyticsDashboard />}
          {activeTab === 'tiers' && <TierManager />}
          {activeTab === 'payouts' && <PayoutDashboard />}
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
