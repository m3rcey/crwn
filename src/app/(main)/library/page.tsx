'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';
import { PlaylistManager } from '@/components/library/PlaylistManager';
import { ReferralDashboard } from '@/components/referrals/ReferralDashboard';

type Tab = 'playlists' | 'referrals';

export default function LibraryPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('playlists');

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-crwn-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-crwn-text mb-6">Your Library</h1>
      
      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('playlists')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'playlists'
              ? 'neu-button-accent text-crwn-bg'
              : 'neu-button text-crwn-text-secondary'
          }`}
        >
          Playlists
        </button>
        <button
          onClick={() => setActiveTab('referrals')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'referrals'
              ? 'neu-button-accent text-crwn-bg'
              : 'neu-button text-crwn-text-secondary'
          }`}
        >
          Referrals
        </button>
      </div>

      {/* Content */}
      {activeTab === 'playlists' && <PlaylistManager />}
      {activeTab === 'referrals' && <ReferralDashboard />}
    </div>
  );
}
