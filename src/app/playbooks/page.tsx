'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Sparkles, ChevronRight, Play } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { PlaybookDef } from '@/lib/playbooks';
import { usePageTour } from '@/hooks/usePageTour';
import { playbooksTourSteps } from '@/lib/playbooksTourSteps';
import { TourReplayButton } from '@/components/shared/TourReplayButton';

interface Rec { id: string; reason: string; playbook: PlaybookDef; }
interface Run { id: string; playbook_id: string; playbook_name: string; status: string; }

export default function PlaybooksPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [isArtist, setIsArtist] = useState(false);
  const [playbooks, setPlaybooks] = useState<PlaybookDef[]>([]);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [starting, setStarting] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: artist } = await supabase.from('artist_profiles').select('id').eq('user_id', user.id).maybeSingle();
    if (!artist) { setIsArtist(false); setLoading(false); return; }
    setIsArtist(true);
    try {
      const res = await fetch('/api/playbooks');
      const json = await res.json();
      setPlaybooks(json.playbooks || []);
      setRecs(json.recommendations || []);
      setRuns(json.activeRuns || []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [user, supabase]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    load();
  }, [authLoading, user, router, load]);

  const { replay } = usePageTour({ tourId: 'playbooks', steps: playbooksTourSteps, userId: user?.id, enabled: !authLoading && !loading && isArtist });

  const start = async (playbookId: string) => {
    setStarting(playbookId);
    try {
      const res = await fetch('/api/playbooks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playbookId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      router.push(`/playbooks/${json.run.id}`);
    } catch (e: any) { showToast(e.message || 'Failed', 'error'); setStarting(null); }
  };

  if (loading || authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-crwn-gold" /></div>;
  if (!isArtist) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <p className="text-crwn-text mb-4">Playbooks are for artists. Publish your artist page first.</p>
        <button onClick={() => router.push('/home')} className="bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full">Back to CRWN</button>
      </div>
    );
  }

  const top = recs[0];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6" data-tour="playbooks-header">
        <button onClick={() => router.push('/studio')} className="p-2 -ml-2 text-crwn-text-secondary hover:text-crwn-text"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1"><h1 className="text-xl font-bold text-crwn-text">Playbooks</h1><p className="text-xs text-crwn-text-secondary">Proven campaigns, generated for you. You approve every step.</p></div>
        <TourReplayButton onClick={replay} />
      </div>

      {/* Active runs */}
      {runs.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-crwn-text-secondary uppercase tracking-wider mb-2">In progress</h2>
          <div className="space-y-2">
            {runs.map(r => (
              <button key={r.id} onClick={() => router.push(`/playbooks/${r.id}`)} className="w-full flex items-center gap-3 bg-crwn-card rounded-xl border border-crwn-gold/30 p-4 text-left">
                <Play className="w-4 h-4 text-crwn-gold" />
                <div className="flex-1 min-w-0"><p className="text-sm font-medium text-crwn-text truncate">{r.playbook_name}</p><p className="text-xs text-crwn-text-secondary capitalize">{r.status}</p></div>
                <ChevronRight className="w-4 h-4 text-crwn-text-secondary" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recommended */}
      {top && (
        <div className="mb-6 bg-crwn-card rounded-2xl border border-crwn-gold/30 p-5">
          <div className="flex items-center gap-2 mb-2"><Sparkles className="w-4 h-4 text-crwn-gold" /><span className="text-xs font-semibold text-crwn-gold uppercase tracking-wider">Recommended</span></div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">{top.playbook.icon}</span>
            <div><h3 className="text-lg font-bold text-crwn-text">{top.playbook.name}</h3><p className="text-xs text-crwn-text-secondary">{top.playbook.effort} · {top.playbook.impact}</p></div>
          </div>
          <p className="text-sm text-crwn-text-secondary mb-4">{top.reason}</p>
          <button onClick={() => start(top.id)} disabled={starting === top.id} className="w-full py-3 rounded-full bg-crwn-gold text-crwn-bg font-semibold disabled:opacity-50">
            {starting === top.id ? 'Generating…' : `Run ${top.playbook.name}`}
          </button>
        </div>
      )}

      {/* Catalog */}
      <h2 className="text-xs font-semibold text-crwn-text-secondary uppercase tracking-wider mb-2" data-tour="playbooks-catalog">All playbooks</h2>
      <div className="space-y-2">
        {playbooks.map(p => (
          <div key={p.id} className="flex items-center gap-3 bg-crwn-card rounded-xl border border-crwn-elevated p-4">
            <span className="text-2xl">{p.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-crwn-text">{p.name}</p>
              <p className="text-xs text-crwn-text-secondary">{p.description}</p>
            </div>
            <button onClick={() => start(p.id)} disabled={starting === p.id} className="shrink-0 text-xs bg-crwn-gold/10 text-crwn-gold font-semibold px-3 py-1.5 rounded-full disabled:opacity-50">
              {starting === p.id ? '…' : 'Run'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
