'use client';

import { useState, useEffect } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Users, Mail, Zap, MessageSquare, Link2 } from 'lucide-react';
import { FanTable } from '@/components/artist/FanTable';
import { CampaignList } from '@/components/artist/CampaignList';
import { CampaignComposer } from '@/components/artist/CampaignComposer';
import { CampaignStats } from '@/components/artist/CampaignStats';
import { SequenceList } from '@/components/artist/SequenceList';
import { SequenceBuilder } from '@/components/artist/SequenceBuilder';
import { SmsSetup } from '@/components/artist/SmsSetup';
import { SmartLinkList } from '@/components/artist/SmartLinkList';
import { SmartLinkEditor } from '@/components/artist/SmartLinkEditor';

type SubView = 'fans' | 'campaigns' | 'compose' | 'stats' | 'sequences' | 'sequence-edit' | 'sms' | 'links' | 'link-edit';

export function AudienceTab() {
  const supabase = createBrowserSupabaseClient();
  const [artistId, setArtistId] = useState<string | null>(null);
  const [platformTier, setPlatformTier] = useState<string>('starter');
  const [tiers, setTiers] = useState<{ id: string; name: string }[]>([]);
  const [subView, setSubView] = useState<SubView>('fans');
  const [editCampaignId, setEditCampaignId] = useState<string | null>(null);
  const [statsCampaignId, setStatsCampaignId] = useState<string | null>(null);
  const [editSequenceId, setEditSequenceId] = useState<string | null>(null);
  const [editLinkId, setEditLinkId] = useState<string | null>(null);

  useEffect(() => {
    async function loadArtist() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: artist } = await supabase
        .from('artist_profiles')
        .select('id, platform_tier')
        .eq('user_id', user.id)
        .single();

      if (artist) {
        setArtistId(artist.id);
        setPlatformTier(artist.platform_tier || 'starter');

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

  const handleNewSequence = () => {
    setEditSequenceId(null);
    setSubView('sequence-edit');
  };

  const handleEditSequence = (id: string) => {
    setEditSequenceId(id);
    setSubView('sequence-edit');
  };

  const handleBackToSequences = () => {
    setEditSequenceId(null);
    setSubView('sequences');
  };

  const handleNewLink = () => {
    setEditLinkId(null);
    setSubView('link-edit');
  };

  const handleEditLink = (id: string) => {
    setEditLinkId(id);
    setSubView('link-edit');
  };

  const handleBackToLinks = () => {
    setEditLinkId(null);
    setSubView('links');
  };

  const isTopLevel = subView === 'fans' || subView === 'campaigns' || subView === 'sequences' || subView === 'sms' || subView === 'links';

  return (
    <div className="space-y-6">
      {/* Sub-navigation */}
      {isTopLevel && (
        <div className="flex items-center gap-1 bg-crwn-card rounded-full p-1">
          {[
            { id: 'fans' as SubView, label: 'Fans', icon: <Users className="w-4 h-4" /> },
            { id: 'campaigns' as SubView, label: 'Campaigns', icon: <Mail className="w-4 h-4" /> },
            { id: 'sequences' as SubView, label: 'Sequences', icon: <Zap className="w-4 h-4" /> },
            { id: 'sms' as SubView, label: 'SMS', icon: <MessageSquare className="w-4 h-4" /> },
            { id: 'links' as SubView, label: 'Links', icon: <Link2 className="w-4 h-4" /> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSubView(tab.id)}
              title={tab.label}
              className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                subView === tab.id
                  ? 'bg-crwn-elevated text-crwn-text'
                  : 'text-crwn-text-secondary hover:text-crwn-text'
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
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
      {subView === 'sequences' && artistId && (
        <SequenceList
          artistId={artistId}
          onEdit={handleEditSequence}
          onNew={handleNewSequence}
        />
      )}
      {subView === 'sequence-edit' && artistId && (
        <SequenceBuilder
          artistId={artistId}
          sequenceId={editSequenceId}
          onBack={handleBackToSequences}
          onSaved={handleBackToSequences}
        />
      )}
      {subView === 'sms' && artistId && (
        <SmsSetup artistId={artistId} platformTier={platformTier} />
      )}
      {subView === 'links' && artistId && (
        <SmartLinkList
          artistId={artistId}
          onNew={handleNewLink}
          onEdit={handleEditLink}
        />
      )}
      {subView === 'link-edit' && artistId && (
        <SmartLinkEditor
          artistId={artistId}
          linkId={editLinkId}
          onBack={handleBackToLinks}
          onSaved={handleBackToLinks}
        />
      )}
    </div>
  );
}
