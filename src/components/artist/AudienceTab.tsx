'use client';

import { useState, useEffect } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Users, Mail } from 'lucide-react';
import { FanTable } from '@/components/artist/FanTable';
import { CampaignList } from '@/components/artist/CampaignList';
import { CampaignComposer } from '@/components/artist/CampaignComposer';
import { CampaignStats } from '@/components/artist/CampaignStats';

type SubView = 'fans' | 'campaigns' | 'compose' | 'stats';

export function AudienceTab() {
  const supabase = createBrowserSupabaseClient();
  const [artistId, setArtistId] = useState<string | null>(null);
  const [tiers, setTiers] = useState<{ id: string; name: string }[]>([]);
  const [subView, setSubView] = useState<SubView>('fans');
  const [editCampaignId, setEditCampaignId] = useState<string | null>(null);
  const [statsCampaignId, setStatsCampaignId] = useState<string | null>(null);

  useEffect(() => {
    async function loadArtist() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: artist } = await supabase
        .from('artist_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (artist) {
        setArtistId(artist.id);

        const { data: tierData } = await supabase
          .from('subscription_tiers')
          .select('id, name')
          .eq('artist_id', artist.id)
          .eq('is_active', true)
          .order('price', { ascending: true });

        setTiers(tierData || []);
      }
    }
    loadArtist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNewCampaign = () => {
    setEditCampaignId(null);
    setSubView('compose');
  };

  const handleEditCampaign = (id: string) => {
    setEditCampaignId(id);
    setSubView('compose');
  };

  const handleViewStats = (id: string) => {
    setStatsCampaignId(id);
    setSubView('stats');
  };

  const handleBackToCampaigns = () => {
    setEditCampaignId(null);
    setStatsCampaignId(null);
    setSubView('campaigns');
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation */}
      {subView !== 'compose' && subView !== 'stats' && (
        <div className="flex items-center gap-1 bg-crwn-card rounded-full p-1 w-fit">
          <button
            onClick={() => setSubView('fans')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              subView === 'fans'
                ? 'bg-crwn-elevated text-crwn-text'
                : 'text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            <Users className="w-4 h-4" />
            Fans
          </button>
          <button
            onClick={() => setSubView('campaigns')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              subView === 'campaigns'
                ? 'bg-crwn-elevated text-crwn-text'
                : 'text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            <Mail className="w-4 h-4" />
            Campaigns
          </button>
        </div>
      )}

      {/* Content */}
      {subView === 'fans' && artistId && (
        <FanTable artistId={artistId} tiers={tiers} />
      )}
      {subView === 'campaigns' && artistId && (
        <CampaignList
          artistId={artistId}
          onNewCampaign={handleNewCampaign}
          onEditCampaign={handleEditCampaign}
          onViewStats={handleViewStats}
        />
      )}
      {subView === 'compose' && artistId && (
        <CampaignComposer
          artistId={artistId}
          campaignId={editCampaignId}
          tiers={tiers}
          onBack={handleBackToCampaigns}
          onSent={handleBackToCampaigns}
        />
      )}
      {subView === 'stats' && artistId && statsCampaignId && (
        <CampaignStats
          campaignId={statsCampaignId}
          onBack={handleBackToCampaigns}
        />
      )}
    </div>
  );
}
