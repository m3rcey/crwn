'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ChevronRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { usePageTour } from '@/hooks/usePageTour';
import { campaignsTourSteps } from '@/lib/campaignsTourSteps';
import { TourReplayButton } from '@/components/shared/TourReplayButton';
import { CAMPAIGN_GOAL_MAP, formatCampaignValue, type CampaignGoalType } from '@/lib/roadCampaigns';
import { HubBackControl } from '@/components/shared/HubBackControl';

interface CampaignRow {
  id: string; title: string; goal_type: CampaignGoalType; goal_value: number; current_value: number; status: string;
}

const statusColor: Record<string, string> = {
  active: 'text-green-400 bg-green-400/10',
  reached: 'text-crwn-gold bg-crwn-gold/10',
  draft: 'text-crwn-text-secondary bg-crwn-elevated',
  archived: 'text-crwn-text-secondary bg-crwn-elevated',
};

export default function CampaignsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [isArtist, setIsArtist] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: artist } = await supabase.from('artist_profiles').select('id').eq('user_id', user.id).maybeSingle();
    if (!artist) { setIsArtist(false); setLoading(false); return; }
    setIsArtist(true);
    try {
      const res = await fetch('/api/road-campaigns');
      const json = await res.json();
      setCampaigns(json.campaigns || []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [user, supabase]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    load();
  }, [authLoading, user, router, load]);

  const { replay } = usePageTour({ tourId: 'campaigns', steps: campaignsTourSteps, userId: user?.id, enabled: !authLoading && !loading && isArtist });

  if (loading || authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-crwn-gold" /></div>;
  if (!isArtist) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <p className="text-crwn-text mb-4">Campaigns are for artists. Publish your artist page first.</p>
        <button onClick={() => router.push('/home')} className="bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full">Back to CRWN</button>
      </div>
    );
  }

  const live = campaigns.filter(c => c.status !== 'archived');

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6" data-tour="campaigns-header">
        <HubBackControl variant="icon" />
        <div className="flex-1"><h1 className="text-xl font-bold text-crwn-text">Campaigns</h1><p className="text-xs text-crwn-text-secondary">Your "Road to ___": the big goal fans rally behind.</p></div>
        <TourReplayButton onClick={replay} />
        <button data-tour="campaigns-new" onClick={() => router.push('/campaigns/new')} className="flex items-center gap-1.5 bg-crwn-gold text-crwn-bg font-semibold px-4 py-2 rounded-full text-sm"><Plus className="w-4 h-4" /> New</button>
      </div>

      {live.length === 0 ? (
        <div className="text-center py-16">
          <span className="text-5xl mb-4 block">🏁</span>
          <h3 className="text-lg font-semibold text-crwn-text mb-2">No campaigns yet</h3>
          <p className="text-sm text-crwn-text-secondary max-w-sm mx-auto mb-6">A campaign is your rollout goal: "Road to First Music Video", "Road to 100 Supporters". It becomes the hero on your page and everything else rallies behind it.</p>
          <button onClick={() => router.push('/campaigns/new')} className="bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full text-sm">Start a campaign</button>
        </div>
      ) : (
        <div className="space-y-3">
          {live.map(c => {
            const def = CAMPAIGN_GOAL_MAP[c.goal_type];
            const pct = Math.min(100, Math.round((c.current_value / c.goal_value) * 100));
            return (
              <button key={c.id} onClick={() => router.push(`/campaigns/${c.id}`)} className="w-full bg-crwn-surface rounded-xl border border-crwn-elevated p-4 text-left hover:border-crwn-gold/40 transition-colors">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{def?.icon || '🏁'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-crwn-text truncate">{c.title}</p>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor[c.status] || ''}`}>{c.status}</span>
                    </div>
                    <p className="text-xs text-crwn-text-secondary">{def?.label}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-crwn-text-secondary shrink-0" />
                </div>
                <div className="h-1.5 w-full rounded-full bg-crwn-elevated overflow-hidden mb-1">
                  <div className="h-full bg-crwn-gold rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-crwn-text-secondary">{formatCampaignValue(c.goal_type, c.current_value)} / {formatCampaignValue(c.goal_type, c.goal_value)} {def?.unit}</p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
