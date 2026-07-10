'use client';

import { useCallback, useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Archive, Check, Copy, Megaphone, Trophy } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { smartBack } from '@/lib/navigation';

interface TestDetail {
  id: string;
  artist_id: string;
  title: string;
  description: string | null;
  signal_type: 'rsvp' | 'vote' | 'waitlist';
  goal_count: number;
  deadline: string | null;
  unlock_message: string | null;
  test_price: number | null;
  test_promoter_interest: boolean;
  audience: 'all' | 'subscribers' | 'free';
  response_count: number;
  promoter_yes_count: number;
  status: 'active' | 'succeeded' | 'archived';
  created_at: string;
}

interface ResponseRow {
  id: string;
  would_promote: boolean;
  created_at: string;
  fan: { display_name: string | null } | null;
}

const SIGNAL_LABELS: Record<TestDetail['signal_type'], string> = {
  rsvp: 'RSVP',
  vote: 'Vote — "I want this"',
  waitlist: 'Waitlist',
};

const AUDIENCE_LABELS: Record<TestDetail['audience'], string> = {
  all: 'All fans',
  subscribers: 'Subscribers',
  free: 'Free fans',
};

const STATUS_STYLES: Record<TestDetail['status'], string> = {
  active: 'bg-crwn-gold/15 text-crwn-gold border border-crwn-gold/40',
  succeeded: 'bg-green-500/15 text-green-400 border border-green-500/40',
  archived: 'bg-crwn-elevated text-crwn-text-secondary',
};

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function deadlineCountdown(deadline: string): { label: string; urgent: boolean; passed: boolean } {
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return { label: 'Deadline passed', urgent: false, passed: true };
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return { label: `${days} day${days === 1 ? '' : 's'} left`, urgent: days <= 3, passed: false };
  const hours = Math.max(1, Math.floor(ms / 3600000));
  return { label: `${hours} hour${hours === 1 ? '' : 's'} left`, urgent: true, passed: false };
}

/**
 * Proof of Demand results — a clean summary of one test: progress against the
 * goal, promoter interest, and who responded. Artist-only via RLS.
 */
export default function DemandTestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const supabase = createBrowserSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [test, setTest] = useState<TestDetail | null>(null);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [artistSlug, setArtistSlug] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;

    const { data: testData } = await supabase
      .from('proof_of_demand')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!testData) {
      setTest(null);
      setLoading(false);
      return;
    }
    setTest(testData as TestDetail);

    const [slugRes, respRes] = await Promise.all([
      supabase.from('artist_profiles').select('slug').eq('id', testData.artist_id).maybeSingle(),
      // RLS: only the fan themself or the owning artist can read responses.
      supabase
        .from('proof_of_demand_responses')
        .select('id, would_promote, created_at, fan:profiles(display_name)')
        .eq('test_id', id)
        .order('created_at', { ascending: false })
        .limit(25),
    ]);

    setArtistSlug(slugRes.data?.slug ?? null);
    setResponses((respRes.data as unknown as ResponseRow[]) || []);
    setLoading(false);
  }, [user, supabase, id]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    load();
  }, [authLoading, user, router, load]);

  const setStatus = async (status: 'succeeded' | 'archived') => {
    if (!test || updating) return;
    setUpdating(true);
    const { error } = await supabase.from('proof_of_demand').update({ status }).eq('id', test.id);
    if (error) {
      showToast(error.message, 'error');
    } else {
      setTest({ ...test, status });
      showToast(status === 'succeeded' ? 'Marked as succeeded.' : 'Test archived.', 'success');
    }
    setUpdating(false);
  };

  const publicUrl = artistSlug ? `https://thecrwn.app/${artistSlug}/demand/${id}` : null;

  const copyLink = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — link is visible on the page.
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-crwn-gold" />
      </div>
    );
  }

  if (!test) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <p className="text-crwn-text mb-4">Demand test not found.</p>
        <button
          onClick={() => router.push('/proof-of-demand')}
          className="bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full hover:bg-crwn-gold/90 transition-colors"
        >
          Back to Demand Tests
        </button>
      </div>
    );
  }

  const goalMet = test.response_count >= test.goal_count;
  const pct = Math.min(100, Math.round((test.response_count / Math.max(1, test.goal_count)) * 100));
  const promoterPct =
    test.response_count > 0 ? Math.round((test.promoter_yes_count / test.response_count) * 100) : 0;
  const countdown = test.deadline ? deadlineCountdown(test.deadline) : null;

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <button
          onClick={() => smartBack(router, '/proof-of-demand')}
          className="inline-flex items-center gap-2 text-sm text-crwn-text-secondary hover:text-crwn-text transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          All demand tests
        </button>

        {/* Title + status */}
        <div className="flex items-start justify-between gap-3 mb-1">
          <h1 className="text-3xl font-bold text-crwn-text">{test.title}</h1>
          <span
            className={`flex-shrink-0 mt-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${STATUS_STYLES[test.status]}`}
          >
            {test.status === 'active' ? 'Active' : test.status === 'succeeded' ? 'Succeeded' : 'Archived'}
          </span>
        </div>
        <p className="text-sm text-crwn-text-secondary mb-6">
          {SIGNAL_LABELS[test.signal_type]} · {AUDIENCE_LABELS[test.audience]}
        </p>

        {/* Progress */}
        <div className="border border-crwn-elevated rounded-2xl p-5 mb-6">
          <div className="flex items-end justify-between gap-3 mb-3">
            <div>
              <p className="text-4xl font-bold text-crwn-text">
                {test.response_count}
                <span className="text-lg font-medium text-crwn-text-secondary"> / {test.goal_count}</span>
              </p>
              <p className="text-xs text-crwn-text-secondary mt-1">responses toward the goal</p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              {goalMet && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-crwn-gold/15 text-crwn-gold border border-crwn-gold/40">
                  <Trophy className="w-3.5 h-3.5" />
                  Demand met ✓
                </span>
              )}
              {countdown && (
                <span
                  className={`text-xs font-medium ${
                    countdown.passed ? 'text-red-400' : countdown.urgent ? 'text-orange-400' : 'text-crwn-text-secondary'
                  }`}
                >
                  {countdown.label}
                </span>
              )}
            </div>
          </div>
          <div className="h-2 rounded-full bg-crwn-elevated overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${goalMet ? 'bg-green-400' : 'bg-crwn-gold'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {test.unlock_message && (
            <p className="text-xs text-crwn-text-secondary mt-3">If it hits: {test.unlock_message}</p>
          )}
        </div>

        {/* Signals */}
        {(test.test_promoter_interest || test.test_price !== null) && (
          <div className="border border-crwn-elevated rounded-2xl divide-y divide-crwn-elevated mb-6">
            {test.test_promoter_interest && (
              <div className="flex items-center gap-3 px-4 py-3.5">
                <Megaphone className="w-4 h-4 text-crwn-gold flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-crwn-text">Would promote this</p>
                  <p className="text-xs text-crwn-text-secondary">Your future street team</p>
                </div>
                <p className="text-sm font-semibold text-crwn-text">
                  {test.promoter_yes_count}
                  <span className="text-crwn-text-secondary font-normal"> ({promoterPct}%)</span>
                </p>
              </div>
            )}
            {test.test_price !== null && (
              <div className="flex items-center gap-3 px-4 py-3.5">
                <Check className="w-4 h-4 text-crwn-gold flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-crwn-text">Price shown on the page</p>
                  <p className="text-xs text-crwn-text-secondary">Non-binding. Nobody was charged</p>
                </div>
                <p className="text-sm font-semibold text-crwn-text">${(test.test_price / 100).toFixed(2)}</p>
              </div>
            )}
          </div>
        )}

        {/* Public link */}
        {publicUrl && (
          <button
            type="button"
            onClick={copyLink}
            className="w-full flex items-center gap-3 bg-crwn-surface border border-crwn-elevated hover:border-crwn-gold/50 rounded-xl px-4 py-3 mb-6 transition-colors"
          >
            <span className="flex-1 text-sm text-crwn-text truncate text-left">{publicUrl}</span>
            {copied ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-400 flex-shrink-0">
                <Check className="w-4 h-4" />
                Copied
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-crwn-gold flex-shrink-0">
                <Copy className="w-4 h-4" />
                Copy
              </span>
            )}
          </button>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 mb-10">
          <button
            onClick={() => router.push('/offers/new')}
            className="inline-flex items-center gap-2 bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full hover:bg-crwn-gold/90 transition-colors"
          >
            Convert to Offer
            <ArrowRight className="w-4 h-4" />
          </button>
          {test.status === 'active' && (
            <>
              <button
                onClick={() => setStatus('succeeded')}
                disabled={updating}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-green-500/40 text-sm font-medium text-green-400 hover:bg-green-500/10 disabled:opacity-40 transition-colors"
              >
                <Trophy className="w-4 h-4" />
                Mark Succeeded
              </button>
              <button
                onClick={() => setStatus('archived')}
                disabled={updating}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-crwn-elevated text-sm font-medium text-crwn-text-secondary hover:text-crwn-text hover:border-crwn-gold/50 disabled:opacity-40 transition-colors"
              >
                <Archive className="w-4 h-4" />
                Archive
              </button>
            </>
          )}
        </div>

        {/* Recent responses */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-crwn-text-secondary mb-3">
            Recent responses
          </h2>
          {responses.length === 0 ? (
            <p className="text-sm text-crwn-text-secondary py-6">
              No responses yet. Share the link where fans already watch you.
            </p>
          ) : (
            <div className="space-y-0">
              {responses.map((r, i) => (
                <div
                  key={r.id}
                  className={`flex items-center gap-3 py-3 ${i > 0 ? 'border-t border-crwn-elevated' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-crwn-text truncate">{r.fan?.display_name || 'A fan'}</p>
                  </div>
                  {r.would_promote && (
                    <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-crwn-gold/10 text-crwn-gold">
                      <Megaphone className="w-3 h-3" />
                      Would promote
                    </span>
                  )}
                  <span className="flex-shrink-0 text-xs text-crwn-text-secondary">{timeAgo(r.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
