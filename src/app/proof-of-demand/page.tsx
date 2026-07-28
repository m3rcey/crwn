'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FlaskConical, Plus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { usePageTour } from '@/hooks/usePageTour';
import { proofOfDemandTourSteps } from '@/lib/proofOfDemandTourSteps';
import { TourReplayButton } from '@/components/shared/TourReplayButton';
import { HubBackControl } from '@/components/shared/HubBackControl';

interface TestRow {
  id: string;
  title: string;
  signal_type: 'rsvp' | 'vote' | 'waitlist';
  goal_count: number;
  response_count: number;
  deadline: string | null;
  status: 'active' | 'succeeded' | 'archived';
  created_at: string;
}

const SIGNAL_LABELS: Record<TestRow['signal_type'], string> = {
  rsvp: 'RSVP',
  vote: 'Vote',
  waitlist: 'Waitlist',
};

const STATUS_STYLES: Record<TestRow['status'], string> = {
  active: 'bg-crwn-gold/15 text-crwn-gold border border-crwn-gold/40',
  succeeded: 'bg-green-500/15 text-green-400 border border-green-500/40',
  archived: 'bg-crwn-elevated text-crwn-text-secondary',
};

const STATUS_LABELS: Record<TestRow['status'], string> = {
  active: 'Active',
  succeeded: 'Succeeded',
  archived: 'Archived',
};

/**
 * "Demand Tests" — every Proof of Demand test an artist is running, in one
 * list. Money-free: these validate ideas BEFORE they become offers.
 */
export default function ProofOfDemandPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const supabase = createBrowserSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [isArtist, setIsArtist] = useState(false);
  const [tests, setTests] = useState<TestRow[]>([]);
  // Captured once per mount so render stays pure (react-compiler lint).
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!user) return;
    const { data: artist } = await supabase
      .from('artist_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!artist) {
      setIsArtist(false);
      setLoading(false);
      return;
    }
    setIsArtist(true);

    const { data } = await supabase
      .from('proof_of_demand')
      .select('id, title, signal_type, goal_count, response_count, deadline, status, created_at')
      .eq('artist_id', artist.id)
      .order('created_at', { ascending: false });

    setTests((data as TestRow[]) || []);
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    load();
  }, [authLoading, user, router, load]);

  // First-visit tour + on-demand replay. MUST stay above the early returns
  // below (rules of hooks) — gated by `enabled` so it only fires once the
  // real page content is rendered.
  const { replay } = usePageTour({
    tourId: 'proof-of-demand',
    steps: proofOfDemandTourSteps,
    userId: user?.id,
    enabled: !authLoading && !loading && isArtist,
  });

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-crwn-gold" />
      </div>
    );
  }

  if (!isArtist) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <p className="text-crwn-text mb-4">Demand tests are for artists. Publish your artist page first.</p>
        <button
          onClick={() => router.push('/home')}
          className="bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full hover:bg-crwn-gold/90 transition-colors"
        >
          Back to CRWN
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <HubBackControl />

        <div className="flex items-center justify-between gap-3 mb-2" data-tour="proof-of-demand-header">
          <h1 className="text-3xl font-bold text-crwn-text">Demand Tests</h1>
          <TourReplayButton onClick={replay} />
        </div>
        <p className="text-crwn-text-secondary text-sm mb-8">
          Prove fans want an idea before you build it. No money moves until you say so.
        </p>

        <button
          onClick={() => router.push('/proof-of-demand/new')}
          data-tour="proof-of-demand-new"
          className="inline-flex items-center gap-2 bg-crwn-gold text-crwn-bg font-semibold px-6 py-3 rounded-full hover:bg-crwn-gold/90 transition-colors mb-10"
        >
          <Plus className="w-4 h-4" />
          New Test
        </button>

        {/* Tests — the tour anchor sits on whichever branch renders */}
        {tests.length === 0 ? (
          <div className="border border-dashed border-crwn-elevated rounded-2xl py-14 px-6 text-center" data-tour="proof-of-demand-tests">
            <FlaskConical className="w-8 h-8 text-crwn-gold mx-auto mb-3" />
            <p className="text-crwn-text font-medium mb-1">No demand tests yet</p>
            <p className="text-sm text-crwn-text-secondary">
              Got an idea for a drop, a show, or merch? Test it in about a minute. Fans vote before you spend anything.
            </p>
          </div>
        ) : (
          <div className="space-y-0" data-tour="proof-of-demand-tests">
            {tests.map((t, i) => {
              const pct = Math.min(100, Math.round((t.response_count / Math.max(1, t.goal_count)) * 100));
              const deadlinePassed = !!t.deadline && new Date(t.deadline).getTime() < now;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => router.push(`/proof-of-demand/${t.id}`)}
                  className={`w-full text-left py-4 ${i > 0 ? 'border-t border-crwn-elevated' : ''} group`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-crwn-gold/10 flex items-center justify-center flex-shrink-0">
                      <FlaskConical className="w-5 h-5 text-crwn-gold" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-crwn-text truncate group-hover:text-crwn-gold transition-colors">
                        {t.title}
                      </p>
                      <p className="text-sm text-crwn-text-secondary">
                        {SIGNAL_LABELS[t.signal_type]} · {t.response_count}/{t.goal_count} responses
                        {t.deadline && (
                          <span className={deadlinePassed ? ' text-orange-400' : ''}>
                            {' '}· {deadlinePassed ? 'ended' : 'ends'} {new Date(t.deadline).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                    </div>
                    <span
                      className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold ${STATUS_STYLES[t.status]}`}
                    >
                      {STATUS_LABELS[t.status]}
                    </span>
                  </div>
                  <div className="mt-3 ml-14 h-1.5 rounded-full bg-crwn-elevated overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${t.response_count >= t.goal_count ? 'bg-green-400' : 'bg-crwn-gold'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
