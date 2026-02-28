'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { ArtistProfileForm } from '@/components/artist/ArtistProfileForm';
import { TrackUploadForm } from '@/components/artist/TrackUploadForm';

export default function ArtistDashboardPage() {
  const { profile, isArtist } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'tracks'>('profile');

  if (!profile) {
    return (
      <div className="min-h-screen bg-crwn-bg flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-crwn-gold" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-crwn-bg">
      {/* Header */}
      <div className="border-b border-crwn-elevated">
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-2xl font-bold text-crwn-text">Artist Dashboard</h1>
          <p className="text-crwn-text-secondary mt-1">
            Manage your profile and music
          </p>
        </div>

        {/* Tabs */}
        <div className="px-4 sm:px-6 lg:px-8 flex gap-6">
          <button
            onClick={() => setActiveTab('profile')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'profile'
                ? 'text-crwn-gold border-crwn-gold'
                : 'text-crwn-text-secondary border-transparent hover:text-crwn-text'
            }`}
          >
            Profile
          </button>
          <button
            onClick={() => setActiveTab('tracks')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'tracks'
                ? 'text-crwn-gold border-crwn-gold'
                : 'text-crwn-text-secondary border-transparent hover:text-crwn-text'
            }`}
          >
            Music
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'profile' ? (
          <ArtistProfileForm />
        ) : (
          <TrackUploadForm />
        )}
      </div>
    </div>
  );
}
