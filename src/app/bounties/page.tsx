'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, ChevronRight, Loader2, Clock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { BOUNTY_TYPE_MAP, type BountyType } from '@/lib/bounties';
import { usePageTour } from '@/hooks/usePageTour';
import { bountiesTourSteps } from '@/lib/bountiesTourSteps';
import { TourReplayButton } from '@/components/shared/TourReplayButton';

interface BountyRow {
  id: string; title: string; bounty_type: BountyType; status: string; reward_type: string;
  reward_detail: string | null; deadline: string | null; submissionCount: number;
}

const statusColor: Record<string, string> = {
  active: 'text-green-400 bg-green-400/10',
  draft: 'text-crwn-text-secondary bg-crwn-elevated',
  ended: 'text-orange-400 bg-orange-400/10',
  awarded: 'text-crwn-gold bg-crwn-gold/10',
  cancelled: 'text-crwn-text-secondary bg-crwn-elevated',
};

export default function BountiesPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [isArtist, setIsArtist] = useState(false);
  const [bounties, setBounties] = useState<BountyRow[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: artist } = await supabase.from('artist_profiles').select('id').eq('user_id', user.id).maybeSingle();
    if (!artist) { setIsArtist(false); setLoading(false); return; }
    setIsArtist(true);
    try {
      const res = await fetch('/api/bounties?scope=artist');
      const json = await res.json();
      setBounties(json.bounties || []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [user, supabase]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    load();
  }, [authLoading, user, router, load]);

  const { replay } = usePageTour({ tourId: 'bounties', steps: bountiesTourSteps, userId: user?.id, enabled: !authLoading && !loading && isArtist });

  if (loading || authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-crwn-gold" /></div>;
  if (!isArtist) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <p className="text-crwn-text mb-4">Bounties are for artists. Publish your artist page first.</p>
        <button onClick={() => router.push('/home')} className="bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full">Back to CRWN</button>
      </div>
    );
  }

  const live = bounties.filter(b => b.status !== 'cancelled');

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6" data-tour="bounties-header">
        <button onClick={() => router.push('/studio')} className="p-2 -ml-2 text-crwn-text-secondary hover:text-crwn-text"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1"><h1 className="text-xl font-bold text-crwn-text">Clip Bounties</h1><p className="text-xs text-crwn-text-secondary">Bonus challenges on top of Clip-to-Earn.</p></div>
        <TourReplayButton onClick={replay} />
        <button data-tour="bounties-new" onClick={() => router.push('/bounties/new')} className="flex items-center gap-1.5 bg-crwn-gold text-crwn-bg font-semibold px-4 py-2 rounded-full text-sm"><Plus className="w-4 h-4" /> New</button>
      </div>

      {live.length === 0 ? (
        <div className="text-center py-16">
          <span className="text-5xl mb-4 block">🏆</span>
          <h3 className="text-lg font-semibold text-crwn-text mb-2">No bounties yet</h3>
          <p className="text-sm text-crwn-text-secondary max-w-sm mx-auto mb-6">Post a challenge on a VOD or live and let your clippers compete. v1 rewards are non-cash (badges, access, boosts).</p>
          <button onClick={() => router.push('/bounties/new')} className="bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full text-sm">Create a bounty</button>
        </div>
      ) : (
        <div className="space-y-3">
          {live.map(b => {
            const def = BOUNTY_TYPE_MAP[b.bounty_type] || BOUNTY_TYPE_MAP.custom;
            return (
              <button key={b.id} onClick={() => router.push(`/bounties/${b.id}`)} className="w-full flex items-center gap-3 bg-crwn-card rounded-xl border border-crwn-elevated p-4 text-left hover:border-crwn-gold/40 transition-colors">
                <span className="text-2xl">{def.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-crwn-text truncate">{b.title}</p>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor[b.status] || ''}`}>{b.status}</span>
                  </div>
                  <p className="text-xs text-crwn-text-secondary">
                    {b.submissionCount} clip{b.submissionCount !== 1 ? 's' : ''}
                    {b.deadline && <span className="inline-flex items-center gap-1 ml-2"><Clock className="w-3 h-3" />{new Date(b.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
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
