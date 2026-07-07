'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Loader2, MapPin, Users, Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { UNLOCK_TYPE_MAP, GOAL_TYPE_MAP, type UnlockType } from '@/lib/cityUnlocks';

interface Detail {
  unlock: {
    id: string; title: string; description: string | null; unlock_type: UnlockType; status: string;
    target_city: string; goal_type: string; goal_value: number; current_value: number; deadline: string | null; unlock_message: string | null;
  };
  artistName: string;
  contributorCount: number;
  myContributions: string[];
}

// Public, shareable "city link". Fans self-select their city and help unlock.
export default function CityPublicPage() {
  const router = useRouter();
  const params = useParams();
  const unlockId = params?.id as string;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [city, setCity] = useState('');
  const [contributing, setContributing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/city-unlocks/${unlockId}`);
      const json = await res.json();
      if (!res.ok) { setDetail(null); return; }
      setDetail(json);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [unlockId]);

  useEffect(() => { load(); }, [load]);

  const contribute = async () => {
    if (!user) { router.push(`/login?next=/city/${unlockId}`); return; }
    setContributing(true);
    try {
      const res = await fetch(`/api/city-unlocks/${unlockId}/contribute`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: city.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      showToast(json.unlocked ? 'You unlocked it! 🎉' : 'You\'re in. Thanks for repping the city.', 'success');
      load();
    } catch (e: any) { showToast(e.message || 'Failed', 'error'); } finally { setContributing(false); }
  };

  if (loading || authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-crwn-gold" /></div>;
  if (!detail) {
    return <div className="min-h-screen flex items-center justify-center px-4 text-center"><p className="text-crwn-text-secondary">This city unlock isn't available.</p></div>;
  }

  const { unlock, artistName, contributorCount, myContributions } = detail;
  const def = UNLOCK_TYPE_MAP[unlock.unlock_type];
  const pct = Math.min(100, Math.round((unlock.current_value / unlock.goal_value) * 100));
  const goalDef = GOAL_TYPE_MAP[unlock.goal_type];
  const unit = goalDef?.unit || unlock.goal_type;
  const alreadyIn = myContributions.length > 0;
  const unlocked = unlock.status === 'unlocked';

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <div className="text-center mb-6">
        <span className="text-5xl block mb-3">{def?.icon || '📍'}</span>
        <h1 className="text-2xl font-bold text-crwn-text">{unlock.title}</h1>
        <p className="text-sm text-crwn-text-secondary inline-flex items-center gap-1 mt-1"><MapPin className="w-3.5 h-3.5" />{unlock.target_city} · {artistName}</p>
        {unlock.description && <p className="text-sm text-crwn-text-secondary mt-3">{unlock.description}</p>}
      </div>

      <div className="bg-crwn-card rounded-2xl border border-crwn-elevated p-5 mb-5">
        <div className="flex items-end justify-between mb-2">
          <p className="text-3xl font-bold text-crwn-text">{unlock.current_value}<span className="text-base text-crwn-text-secondary">/{unlock.goal_value}</span></p>
          <p className="text-sm text-crwn-text-secondary">{unit}</p>
        </div>
        <div className="h-2.5 w-full rounded-full bg-crwn-elevated overflow-hidden">
          <div className="h-full bg-crwn-gold rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-crwn-text-secondary mt-2 inline-flex items-center gap-1"><Users className="w-3 h-3" />{contributorCount} repping {unlock.target_city}</p>
      </div>

      {unlocked ? (
        <div className="bg-crwn-gold/10 border border-crwn-gold/30 rounded-2xl p-5 text-center">
          <p className="text-lg font-semibold text-crwn-gold mb-1">🎉 Unlocked!</p>
          {unlock.unlock_message && <p className="text-sm text-crwn-text">{unlock.unlock_message}</p>}
        </div>
      ) : alreadyIn ? (
        <div className="text-center">
          <p className="text-sm text-crwn-gold inline-flex items-center gap-1.5 mb-4"><Check className="w-4 h-4" /> You're in. Now pull your people in.</p>
          <button onClick={() => navigator.share?.({ url: window.location.href, title: unlock.title }).catch(() => {})} className="w-full py-3 rounded-full bg-crwn-gold text-crwn-bg font-semibold">Share the city link</button>
        </div>
      ) : (
        <div>
          <input type="text" value={city} onChange={e => setCity(e.target.value)} placeholder={`Your city (default: ${unlock.target_city})`}
            className="w-full px-4 py-3 mb-3 bg-crwn-card border border-crwn-elevated rounded-xl text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50" />
          <button onClick={contribute} disabled={contributing} className="w-full py-3.5 rounded-full bg-crwn-gold text-crwn-bg font-semibold disabled:opacity-50">
            {contributing ? 'Adding you…' : `${goalDef?.verb || 'Help unlock'} ${unlock.target_city}`}
          </button>
        </div>
      )}
    </div>
  );
}
