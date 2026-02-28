'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { ArtistProfileForm } from '@/components/artist/ArtistProfileForm';
import { TrackUploadForm } from '@/components/artist/TrackUploadForm';
import { TierManager } from '@/components/artist/TierManager';
import { PayoutDashboard } from '@/components/artist/PayoutDashboard';

export default function ArtistDashboardPage() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'tracks' | 'tiers' | 'payouts'>('profile');

  if (!profile) {
    return (
      <div className="min-h-screen bg-crwn-bg flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-crwn-gold" />
      </div>
    );
  }

  const tabs = [
    { id: 'profile' as const, label: 'Profile' },
    { id: 'tracks' as const, label: 'Music' },
    { id: 'tiers' as const, label: 'Tiers' },
    { id: 'payouts' as const, label: 'Payouts' },
  ];

  return (
    <div className="min-h-screen bg-crwn-bg">
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
        {activeTab === 'tracks' && <TrackUploadForm />}
        {activeTab === 'tiers' && <TierManager />}
        {activeTab === 'payouts' && <PayoutDashboard />}
      </div>
    </div>
  );
}
