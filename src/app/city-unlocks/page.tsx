'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, ChevronRight, Loader2, MapPin } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { UNLOCK_TYPE_MAP, GOAL_TYPE_MAP, type UnlockType } from '@/lib/cityUnlocks';
import { usePageTour } from '@/hooks/usePageTour';
import { cityUnlocksTourSteps } from '@/lib/cityUnlocksTourSteps';
import { TourReplayButton } from '@/components/shared/TourReplayButton';

interface UnlockRow {
  id: string; title: string; target_city: string; unlock_type: UnlockType; goal_type: string;
  goal_value: number; current_value: number; status: string; contributorCount: number;
}

const statusColor: Record<string, string> = {
  active: 'text-green-400 bg-green-400/10',
  unlocked: 'text-crwn-gold bg-crwn-gold/10',
  draft: 'text-crwn-text-secondary bg-crwn-elevated',
  expired: 'text-orange-400 bg-orange-400/10',
  archived: 'text-crwn-text-secondary bg-crwn-elevated',
};

export default function CityUnlocksPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [isArtist, setIsArtist] = useState(false);
  const [unlocks, setUnlocks] = useState<UnlockRow[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: artist } = await supabase.from('artist_profiles').select('id').eq('user_id', user.id).maybeSingle();
    if (!artist) { setIsArtist(false); setLoading(false); return; }
    setIsArtist(true);
    try {
      const res = await fetch('/api/city-unlocks');
      const json = await res.json();
      setUnlocks(json.unlocks || []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [user, supabase]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    load();
  }, [authLoading, user, router, load]);

  const { replay } = usePageTour({ tourId: 'city-unlocks', steps: cityUnlocksTourSteps, userId: user?.id, enabled: !authLoading && !loading && isArtist });

  if (loading || authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-crwn-gold" /></div>;
  if (!isArtist) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <p className="text-crwn-text mb-4">City Unlocks are for artists. Publish your artist page first.</p>
        <button onClick={() => router.push('/home')} className="bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full">Back to CRWN</button>
      </div>
    );
  }

  const live = unlocks.filter(u => u.status !== 'archived');

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6" data-tour="city-header">
        <button onClick={() => router.push('/studio')} className="p-2 -ml-2 text-crwn-text-secondary hover:text-crwn-text"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1"><h1 className="text-xl font-bold text-crwn-text">City Unlocks</h1><p className="text-xs text-crwn-text-secondary">Unlock local experiences with proven demand.</p></div>
        <TourReplayButton onClick={replay} />
        <button data-tour="city-new" onClick={() => router.push('/city-unlocks/new')} className="flex items-center gap-1.5 bg-crwn-gold text-crwn-bg font-semibold px-4 py-2 rounded-full text-sm"><Plus className="w-4 h-4" /> New</button>
      </div>

      {live.length === 0 ? (
        <div className="text-center py-16">
          <span className="text-5xl mb-4 block">📍</span>
          <h3 className="text-lg font-semibold text-crwn-text mb-2">No city unlocks yet</h3>
          <p className="text-sm text-crwn-text-secondary max-w-sm mx-auto mb-6">Pick a city, set a goal, and let local fans unlock a show, drop, or exclusive. Only run these where you already have demand.</p>
          <button onClick={() => router.push('/city-unlocks/new')} className="bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full text-sm">Create a city unlock</button>
        </div>
      ) : (
        <div className="space-y-3">
          {live.map(u => {
            const def = UNLOCK_TYPE_MAP[u.unlock_type];
            const pct = Math.min(100, Math.round((u.current_value / u.goal_value) * 100));
            const unit = GOAL_TYPE_MAP[u.goal_type]?.unit || u.goal_type;
            return (
              <button key={u.id} onClick={() => router.push(`/city-unlocks/${u.id}`)} className="w-full bg-crwn-card rounded-xl border border-crwn-elevated p-4 text-left hover:border-crwn-gold/40 transition-colors">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{def?.icon || '📍'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-crwn-text truncate">{u.title}</p>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor[u.status] || ''}`}>{u.status}</span>
                    </div>
                    <p className="text-xs text-crwn-text-secondary inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{u.target_city}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-crwn-text-secondary shrink-0" />
                </div>
                <div className="h-1.5 w-full rounded-full bg-crwn-elevated overflow-hidden mb-1">
                  <div className="h-full bg-crwn-gold rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-crwn-text-secondary">{u.current_value}/{u.goal_value} {unit}</p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
