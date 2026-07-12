'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Loader2, MapPin, Users, Copy, Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { UNLOCK_TYPE_MAP, GOAL_TYPE_MAP, type UnlockType } from '@/lib/cityUnlocks';
import { smartBack } from '@/lib/navigation';

interface Detail {
  unlock: {
    id: string; title: string; description: string | null; unlock_type: UnlockType; status: string;
    target_city: string; goal_type: string; goal_value: number; current_value: number; deadline: string | null; unlock_message: string | null;
  };
  contributorCount: number;
  cityBreakdown: { city: string; count: number }[];
  isOwner: boolean;
}

export default function CityUnlockDetailPage() {
  const router = useRouter();
  const params = useParams();
  const unlockId = params?.id as string;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/city-unlocks/${unlockId}`);
      const json = await res.json();
      if (!res.ok) { showToast(json.error || 'Not found', 'error'); router.push('/city-unlocks'); return; }
      setDetail(json);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [unlockId, router, showToast]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    load();
  }, [authLoading, user, router, load]);

  const setStatus = async (status: string) => {
    await fetch(`/api/city-unlocks/${unlockId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    load();
  };

  const copyLink = () => {
    const url = `${window.location.origin}/city/${unlockId}`;
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };

  if (loading || authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-crwn-gold" /></div>;
  if (!detail) return null;

  const { unlock, contributorCount, cityBreakdown } = detail;
  const def = UNLOCK_TYPE_MAP[unlock.unlock_type];
  const pct = Math.min(100, Math.round((unlock.current_value / unlock.goal_value) * 100));
  const unit = GOAL_TYPE_MAP[unlock.goal_type]?.unit || unlock.goal_type;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => smartBack(router, '/city-unlocks')} className="p-2 -ml-2 text-crwn-text-secondary hover:text-crwn-text"><ArrowLeft className="w-5 h-5" /></button>
        <span className="text-2xl">{def?.icon || '📍'}</span>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-crwn-text truncate">{unlock.title}</h1>
          <p className="text-xs text-crwn-text-secondary inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{unlock.target_city} · {unlock.status}</p>
        </div>
      </div>

      {/* Progress */}
      <div className="bg-crwn-surface rounded-xl border border-crwn-elevated p-4 mb-4">
        <div className="flex items-end justify-between mb-2">
          <p className="text-2xl font-bold text-crwn-text">{unlock.current_value}<span className="text-sm text-crwn-text-secondary">/{unlock.goal_value} {unit}</span></p>
          <p className="text-sm font-medium text-crwn-gold">{pct}%</p>
        </div>
        <div className="h-2 w-full rounded-full bg-crwn-elevated overflow-hidden">
          <div className="h-full bg-crwn-gold rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-crwn-text-secondary mt-2 inline-flex items-center gap-1"><Users className="w-3 h-3" />{contributorCount} contributor{contributorCount !== 1 ? 's' : ''}</p>
      </div>

      {unlock.status === 'unlocked' && (
        <div className="bg-crwn-gold/10 border border-crwn-gold/30 rounded-xl p-4 mb-4">
          <p className="text-sm font-semibold text-crwn-gold mb-1">🎉 Unlocked!</p>
          {unlock.unlock_message && <p className="text-sm text-crwn-text">{unlock.unlock_message}</p>}
        </div>
      )}

      {/* Share city link */}
      <button onClick={copyLink} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-crwn-elevated text-sm font-medium text-crwn-text hover:border-crwn-gold/40 mb-4">
        {copied ? <><Check className="w-4 h-4 text-crwn-gold" /> Copied</> : <><Copy className="w-4 h-4" /> Copy city link</>}
      </button>

      {/* City breakdown (owner, aggregate only) */}
      {cityBreakdown.length > 0 && (
        <div className="mb-4">
          <h2 className="text-xs font-semibold text-crwn-text-secondary uppercase tracking-wider mb-2">Where contributors are</h2>
          <div className="bg-crwn-surface rounded-xl border border-crwn-elevated divide-y divide-crwn-elevated/60">
            {cityBreakdown.slice(0, 8).map(c => (
              <div key={c.city} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-crwn-text">{c.city}</span>
                <span className="text-sm font-medium text-crwn-text-secondary">{c.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-2">
        {unlock.status === 'active' && <button onClick={() => setStatus('unlocked')} className="flex-1 py-2.5 rounded-full bg-crwn-gold text-crwn-bg text-sm font-semibold">Mark unlocked</button>}
        {unlock.status !== 'archived' && <button onClick={() => setStatus('archived')} className="px-4 py-2.5 rounded-full bg-crwn-elevated text-crwn-text-secondary text-sm">Archive</button>}
      </div>
    </div>
  );
}
