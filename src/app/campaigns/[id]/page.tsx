'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Loader2, Users, Copy, Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { CAMPAIGN_GOAL_MAP, formatCampaignValue, type CampaignGoalType } from '@/lib/roadCampaigns';

interface Detail {
  campaign: { id: string; title: string; description: string | null; goal_type: CampaignGoalType; goal_value: number; current_value: number; status: string; reached_message: string | null };
  artistSlug: string | null;
  supporterCount: number;
}

export default function CampaignDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/road-campaigns/${id}`);
      const json = await res.json();
      if (!res.ok) { showToast(json.error || 'Not found', 'error'); router.push('/campaigns'); return; }
      setDetail(json);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [id, router, showToast]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    load();
  }, [authLoading, user, router, load]);

  const setStatus = async (status: string) => {
    await fetch(`/api/road-campaigns/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    load();
  };

  const copyLink = () => {
    if (!detail?.artistSlug) return;
    navigator.clipboard.writeText(`${window.location.origin}/${detail.artistSlug}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };

  if (loading || authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-crwn-gold" /></div>;
  if (!detail) return null;

  const { campaign, supporterCount } = detail;
  const def = CAMPAIGN_GOAL_MAP[campaign.goal_type];
  const pct = Math.min(100, Math.round((campaign.current_value / campaign.goal_value) * 100));
  const isMoney = campaign.goal_type === 'money';

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => router.push('/campaigns')} className="p-2 -ml-2 text-crwn-text-secondary hover:text-crwn-text"><ArrowLeft className="w-5 h-5" /></button>
        <span className="text-2xl">{def?.icon || '🏁'}</span>
        <div className="flex-1 min-w-0"><h1 className="text-lg font-bold text-crwn-text truncate">{campaign.title}</h1><p className="text-xs text-crwn-text-secondary capitalize">{def?.label} · {campaign.status}</p></div>
      </div>

      <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-4 mb-4">
        <div className="flex items-end justify-between mb-2">
          <p className="text-2xl font-bold text-crwn-text">{formatCampaignValue(campaign.goal_type, campaign.current_value)}<span className="text-sm text-crwn-text-secondary"> / {formatCampaignValue(campaign.goal_type, campaign.goal_value)}</span></p>
          <p className="text-sm font-medium text-crwn-gold">{pct}%</p>
        </div>
        <div className="h-2 w-full rounded-full bg-crwn-elevated overflow-hidden"><div className="h-full bg-crwn-gold rounded-full" style={{ width: `${pct}%` }} /></div>
        {!isMoney && <p className="text-xs text-crwn-text-secondary mt-2 inline-flex items-center gap-1"><Users className="w-3 h-3" />{supporterCount} supporter{supporterCount !== 1 ? 's' : ''}</p>}
        {isMoney && <p className="text-xs text-crwn-text-secondary mt-2">Revenue since launch. Fans support via checkout on your page.</p>}
      </div>

      <button onClick={copyLink} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-crwn-elevated text-sm font-medium text-crwn-text hover:border-crwn-gold/40 mb-4">
        {copied ? <><Check className="w-4 h-4 text-crwn-gold" /> Copied</> : <><Copy className="w-4 h-4" /> Copy page link</>}
      </button>

      <div className="flex gap-2">
        {campaign.status === 'active' && <button onClick={() => setStatus('reached')} className="flex-1 py-2.5 rounded-full bg-crwn-gold text-crwn-bg text-sm font-semibold">Mark reached</button>}
        {campaign.status !== 'archived' && <button onClick={() => setStatus('archived')} className="px-4 py-2.5 rounded-full bg-crwn-elevated text-crwn-text-secondary text-sm">Archive</button>}
      </div>
    </div>
  );
}
