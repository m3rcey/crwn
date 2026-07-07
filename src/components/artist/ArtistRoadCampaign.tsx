'use client';

// The "Current Mission" hero on the Movement tab — the artist's active Road-To
// campaign. Money goals show real revenue progress and a Support button that opens
// the tiers/shop; non-money goals let fans tap to support and fill the bar.
// Renders nothing if the artist has no active campaign.

import { useCallback, useEffect, useState } from 'react';
import { Target, Share2, Loader2, Check } from 'lucide-react';
import { useToast } from '@/components/shared/Toast';
import { CAMPAIGN_GOAL_MAP, formatCampaignValue, type CampaignGoalType } from '@/lib/roadCampaigns';

interface Campaign {
  id: string; title: string; description: string | null; goal_type: CampaignGoalType;
  goal_value: number; current_value: number; status: string; cta_label: string | null; reached_message: string | null;
}

interface Props {
  artistId: string;
  artistSlug: string;
  artistName: string;
  onSupportMoney?: () => void; // switch the page to the Tiers tab for money campaigns
}

export function ArtistRoadCampaign({ artistId, artistSlug, artistName, onSupportMoney }: Props) {
  const { showToast } = useToast();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [supporterCount, setSupporterCount] = useState(0);
  const [alreadySupported, setAlreadySupported] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/road-campaigns/active?artistId=${artistId}`);
      const json = await res.json();
      setCampaign(json.campaign || null);
      setSupporterCount(json.supporterCount || 0);
      setAlreadySupported(!!json.alreadySupported);
    } catch { /* silent */ }
  }, [artistId]);

  useEffect(() => { load(); }, [load]);

  if (!campaign) return null;

  const def = CAMPAIGN_GOAL_MAP[campaign.goal_type];
  const isMoney = campaign.goal_type === 'money';
  const pct = Math.min(100, Math.round((campaign.current_value / campaign.goal_value) * 100));
  const reached = campaign.status === 'reached';

  const support = async () => {
    if (isMoney) { onSupportMoney?.(); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/road-campaigns/${campaign.id}/support`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      showToast(json.reached ? 'You got them there! 🎉' : 'You\'re behind it. Thanks.', 'success');
      setAlreadySupported(true);
      load();
    } catch (e: any) { showToast(e.message || 'Failed', 'error'); } finally { setBusy(false); }
  };

  const share = () => {
    const url = `${window.location.origin}/${artistSlug}`;
    if (navigator.share) navigator.share({ url, title: campaign.title }).catch(() => {});
    else { navigator.clipboard.writeText(url).catch(() => {}); showToast('Link copied', 'success'); }
  };

  const ctaLabel = campaign.cta_label || def.cta;

  return (
    <section className="bg-crwn-card rounded-2xl border border-crwn-gold/30 p-5">
      <div className="flex items-center gap-2 mb-2">
        <Target className="w-4 h-4 text-crwn-gold" />
        <span className="text-xs font-semibold text-crwn-gold uppercase tracking-wider">Current Mission</span>
      </div>
      <h2 className="text-xl font-bold text-crwn-text">{campaign.title}</h2>
      {campaign.description && <p className="text-sm text-crwn-text-secondary mt-1 mb-3">{campaign.description}</p>}

      <div className="flex items-end justify-between mt-3 mb-2">
        <p className="text-lg font-bold text-crwn-gold">
          {formatCampaignValue(campaign.goal_type, campaign.current_value)}
          <span className="text-sm text-crwn-text-secondary font-normal"> / {formatCampaignValue(campaign.goal_type, campaign.goal_value)} {isMoney ? 'raised' : def.unit}</span>
        </p>
        <p className="text-sm font-medium text-crwn-text-secondary">{pct}%</p>
      </div>
      <div className="h-2 w-full rounded-full bg-crwn-elevated overflow-hidden">
        <div className="h-full bg-crwn-gold rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      {!isMoney && supporterCount > 0 && <p className="text-xs text-crwn-text-secondary mt-2">{supporterCount} behind this</p>}

      {reached && campaign.reached_message && (
        <div className="mt-3 bg-crwn-gold/10 rounded-lg p-3 text-sm text-crwn-text">🎉 {campaign.reached_message}</div>
      )}

      <div className="flex gap-2 mt-4">
        {alreadySupported && !isMoney ? (
          <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full bg-crwn-elevated text-crwn-gold text-sm font-semibold"><Check className="w-4 h-4" /> You're in</div>
        ) : (
          <button onClick={support} disabled={busy} className="flex-1 py-2.5 rounded-full bg-crwn-gold text-crwn-bg text-sm font-semibold disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : ctaLabel}
          </button>
        )}
        <button onClick={share} className="px-4 py-2.5 rounded-full border border-crwn-elevated text-crwn-text text-sm font-medium flex items-center gap-1.5"><Share2 className="w-4 h-4" /> Share</button>
      </div>
    </section>
  );
}
