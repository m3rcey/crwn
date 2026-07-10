'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Users, ChevronRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { SQUAD_TYPE_MAP, type SquadType } from '@/lib/squads';
import { usePageTour } from '@/hooks/usePageTour';
import { squadsTourSteps } from '@/lib/squadsTourSteps';
import { TourReplayButton } from '@/components/shared/TourReplayButton';
import { smartBack } from '@/lib/navigation';

interface SquadRow {
  id: string;
  name: string;
  type: SquadType;
  status: string;
  visibility: string;
  memberCounts: { total: number; active: number; pending: number };
}

const statusColor: Record<string, string> = {
  active: 'text-green-400 bg-green-400/10',
  draft: 'text-crwn-text-secondary bg-crwn-elevated',
  paused: 'text-orange-400 bg-orange-400/10',
  archived: 'text-crwn-text-secondary bg-crwn-elevated',
};

export default function SquadsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [isArtist, setIsArtist] = useState(false);
  const [squads, setSquads] = useState<SquadRow[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: artist } = await supabase
      .from('artist_profiles').select('id').eq('user_id', user.id).maybeSingle();
    if (!artist) { setIsArtist(false); setLoading(false); return; }
    setIsArtist(true);
    try {
      const res = await fetch('/api/squads?scope=artist');
      const json = await res.json();
      setSquads(json.squads || []);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [user, supabase]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    load();
  }, [authLoading, user, router, load]);

  const { replay } = usePageTour({
    tourId: 'squads',
    steps: squadsTourSteps,
    userId: user?.id,
    enabled: !authLoading && !loading && isArtist,
  });

  if (loading || authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-crwn-gold" /></div>;
  }

  if (!isArtist) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <p className="text-crwn-text mb-4">Squads are for artists. Publish your artist page first.</p>
        <button onClick={() => router.push('/home')} className="bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full">Back to CRWN</button>
      </div>
    );
  }

  const active = squads.filter(s => s.status !== 'archived');

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6" data-tour="squads-header">
        <button onClick={() => smartBack(router, '/studio')} className="p-2 -ml-2 text-crwn-text-secondary hover:text-crwn-text">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-crwn-text">Fan Squads</h1>
          <p className="text-xs text-crwn-text-secondary">Organize your fans into role-based teams.</p>
        </div>
        <TourReplayButton onClick={replay} />
        <button data-tour="squads-new" onClick={() => router.push('/squads/new')} className="flex items-center gap-1.5 bg-crwn-gold text-crwn-bg font-semibold px-4 py-2 rounded-full text-sm">
          <Plus className="w-4 h-4" /> New
        </button>
      </div>

      {active.length === 0 ? (
        <div className="text-center py-16">
          <span className="text-5xl mb-4 block">🤝</span>
          <h3 className="text-lg font-semibold text-crwn-text mb-2">No squads yet</h3>
          <p className="text-sm text-crwn-text-secondary max-w-sm mx-auto mb-6">
            Turn your best fans into a team. Start with Top Clippers or a Street Team. 1 to 3 active squads is plenty.
          </p>
          <button onClick={() => router.push('/squads/new')} className="bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full text-sm">Build a squad</button>
        </div>
      ) : (
        <div className="space-y-3">
          {active.map(s => {
            const def = SQUAD_TYPE_MAP[s.type] || SQUAD_TYPE_MAP.custom;
            return (
              <button
                key={s.id}
                onClick={() => router.push(`/squads/${s.id}`)}
                className="w-full flex items-center gap-3 bg-crwn-card rounded-xl border border-crwn-elevated p-4 text-left hover:border-crwn-gold/40 transition-colors"
              >
                <span className="text-2xl">{def.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-crwn-text truncate">{s.name}</p>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor[s.status] || ''}`}>{s.status}</span>
                  </div>
                  <p className="text-xs text-crwn-text-secondary">
                    {s.memberCounts.active} member{s.memberCounts.active !== 1 ? 's' : ''}
                    {s.memberCounts.pending > 0 && <span className="text-crwn-gold"> · {s.memberCounts.pending} pending</span>}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-crwn-text-secondary shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
