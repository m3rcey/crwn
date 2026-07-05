'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Inbox, Lightbulb, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import {
  MISSION_AUDIENCE_LABELS,
  MISSION_REWARD_LABELS,
  MISSION_TYPE_LABELS,
  type MissionAudience,
  type MissionRewardType,
  type MissionTargetKind,
  type MissionType,
} from '@/lib/missions';

type SuggestionStatus = 'pending' | 'approved' | 'rejected';

interface SuggestionRow {
  id: string;
  type: MissionType;
  target_kind: MissionTargetKind;
  target_label: string | null;
  goal_count: number;
  title: string;
  note: string | null;
  suggested_reward: string | null;
  status: SuggestionStatus;
  review_note: string | null;
  reviewed_at: string | null;
  converted_mission_id: string | null;
  created_at: string;
  suggester: { display_name: string | null } | null;
}

const STATUS_STYLES: Record<SuggestionStatus, string> = {
  pending: 'bg-crwn-gold/15 text-crwn-gold border border-crwn-gold/40',
  approved: 'bg-green-500/15 text-green-400 border border-green-500/40',
  rejected: 'bg-crwn-elevated text-crwn-text-secondary',
};

const STATUS_LABELS: Record<SuggestionStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

const SELECT =
  'w-full bg-crwn-surface border border-crwn-elevated rounded-xl px-3 py-2.5 text-sm text-crwn-text focus:outline-none focus:border-crwn-gold';

/**
 * Fan mission suggestions — the artist's review queue. Every proposal lands
 * here as 'pending'; nothing a fan submits ever auto-publishes. Approving
 * converts it to a real mission with an ARTIST-set reward (via the review
 * API); rejecting records a reason. Both decisions notify the fan and stay on
 * the row as the audit trail.
 */
export default function MissionSuggestionsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const supabase = createBrowserSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [isArtist, setIsArtist] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [view, setView] = useState<'pending' | 'reviewed'>('pending');

  // Which card has an open decision form, and which decision.
  const [openId, setOpenId] = useState<string | null>(null);
  const [openMode, setOpenMode] = useState<'approve' | 'reject'>('approve');
  const [submitting, setSubmitting] = useState(false);

  // Approve form state (seeded when the form opens).
  const [rewardType, setRewardType] = useState<MissionRewardType>('points');
  const [rewardDetail, setRewardDetail] = useState('');
  const [goalInput, setGoalInput] = useState('100');
  const [audience, setAudience] = useState<MissionAudience>('all');
  const [rejectReason, setRejectReason] = useState('');

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
      .from('mission_suggestions')
      .select(
        'id, type, target_kind, target_label, goal_count, title, note, suggested_reward, status, review_note, reviewed_at, converted_mission_id, created_at, suggester:profiles!mission_suggestions_suggested_by_fkey(display_name)'
      )
      .eq('artist_id', artist.id)
      .order('created_at', { ascending: false });

    setSuggestions((data as unknown as SuggestionRow[]) || []);
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

  const openDecision = (s: SuggestionRow, mode: 'approve' | 'reject') => {
    setOpenId(s.id);
    setOpenMode(mode);
    setRewardType('points');
    setRewardDetail('');
    setGoalInput(String(s.goal_count));
    setAudience('all');
    setRejectReason('');
  };

  const sendReview = async (s: SuggestionRow) => {
    if (submitting) return;
    if (openMode === 'approve') {
      const goal = Math.round(Number(goalInput));
      if (goalInput.trim() === '' || isNaN(goal) || goal < 1) {
        showToast('Enter a valid goal (1 or more).', 'error');
        return;
      }
    }
    setSubmitting(true);
    try {
      const body =
        openMode === 'approve'
          ? {
              action: 'approve',
              rewardType,
              rewardDetail: rewardDetail.trim() || null,
              goalCount: Math.round(Number(goalInput)),
              audience,
            }
          : { action: 'reject', reviewNote: rejectReason.trim() || null };

      const res = await fetch(`/api/mission-suggestions/${s.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        showToast(data?.error || 'Could not save the decision. Please try again.', 'error');
        return;
      }
      showToast(
        openMode === 'approve' ? 'Approved — the mission is live and the fan was notified.' : 'Rejected — the fan was notified.',
        'success'
      );
      setOpenId(null);
      await load();
      setView('reviewed');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Something went wrong. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

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
        <p className="text-crwn-text mb-4">Mission suggestions are for artists. Publish your artist page first.</p>
        <button
          onClick={() => router.push('/home')}
          className="bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full hover:bg-crwn-gold/90 transition-colors"
        >
          Back to CRWN
        </button>
      </div>
    );
  }

  const pending = suggestions.filter((s) => s.status === 'pending');
  const reviewed = suggestions.filter((s) => s.status !== 'pending');
  const shown = view === 'pending' ? pending : reviewed;

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <button
          onClick={() => router.push('/missions')}
          className="inline-flex items-center gap-2 text-sm text-crwn-text-secondary hover:text-crwn-text transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          All missions
        </button>

        <h1 className="text-3xl font-bold text-crwn-text mb-2">Fan suggestions</h1>
        <p className="text-crwn-text-secondary text-sm mb-8">
          Mission ideas from your fans. Nothing goes live until you approve it — and you set the real reward.
        </p>

        {/* Pending / Reviewed toggle */}
        <div className="flex items-center gap-2 mb-8">
          <button
            onClick={() => setView('pending')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              view === 'pending'
                ? 'bg-crwn-gold text-crwn-bg'
                : 'border border-crwn-elevated text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            Pending ({pending.length})
          </button>
          <button
            onClick={() => setView('reviewed')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              view === 'reviewed'
                ? 'bg-crwn-gold text-crwn-bg'
                : 'border border-crwn-elevated text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            Reviewed ({reviewed.length})
          </button>
        </div>

        {shown.length === 0 ? (
          <div className="border border-dashed border-crwn-elevated rounded-2xl py-14 px-6 text-center">
            {view === 'pending' ? (
              <>
                <Inbox className="w-8 h-8 text-crwn-gold mx-auto mb-3" />
                <p className="text-crwn-text font-medium mb-1">No suggestions waiting</p>
                <p className="text-sm text-crwn-text-secondary">
                  When fans pitch mission ideas from your page, they land here for your approval.
                </p>
              </>
            ) : (
              <>
                <Lightbulb className="w-8 h-8 text-crwn-gold mx-auto mb-3" />
                <p className="text-crwn-text font-medium mb-1">Nothing reviewed yet</p>
                <p className="text-sm text-crwn-text-secondary">Approved and rejected suggestions show up here.</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-0">
            {shown.map((s, i) => {
              const fanName = s.suggester?.display_name || 'A fan';
              const isOpen = openId === s.id;
              return (
                <div key={s.id} className={`py-5 ${i > 0 ? 'border-t border-crwn-elevated' : ''}`}>
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-crwn-gold/10 flex items-center justify-center flex-shrink-0">
                      <Lightbulb className="w-5 h-5 text-crwn-gold" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-crwn-text">{s.title}</p>
                      <p className="text-sm text-crwn-text-secondary mt-0.5">
                        {fanName} · {MISSION_TYPE_LABELS[s.type]}
                        {s.target_label ? ` · ${s.target_label}` : ''} · goal {s.goal_count}
                      </p>
                      {s.note && <p className="text-sm text-crwn-text-secondary mt-2 whitespace-pre-line">{s.note}</p>}
                      {s.suggested_reward && (
                        <p className="text-xs text-crwn-text-secondary mt-2">
                          <span className="text-crwn-gold font-medium">Fan&apos;s idea for the reward:</span>{' '}
                          {s.suggested_reward} <span className="text-crwn-text-secondary/70">(not binding — you decide)</span>
                        </p>
                      )}
                    </div>
                    <span
                      className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold ${STATUS_STYLES[s.status]}`}
                    >
                      {STATUS_LABELS[s.status]}
                    </span>
                  </div>

                  {/* Review outcome (reviewed cards) */}
                  {s.status === 'approved' && (
                    <div className="ml-14 mt-3 flex items-center justify-between gap-3">
                      <p className="text-xs text-crwn-text-secondary">
                        Approved{s.reviewed_at ? ` ${new Date(s.reviewed_at).toLocaleDateString()}` : ''}
                        {s.review_note ? ` — ${s.review_note}` : ''}
                      </p>
                      {s.converted_mission_id && (
                        <button
                          onClick={() => router.push(`/missions/${s.converted_mission_id}`)}
                          className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-crwn-gold hover:text-crwn-gold/80 transition-colors"
                        >
                          View mission
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                  {s.status === 'rejected' && (
                    <p className="ml-14 mt-3 text-xs text-crwn-text-secondary">
                      Rejected{s.reviewed_at ? ` ${new Date(s.reviewed_at).toLocaleDateString()}` : ''}
                      {s.review_note ? ` — ${s.review_note}` : ''}
                    </p>
                  )}

                  {/* Pending actions */}
                  {s.status === 'pending' && !isOpen && (
                    <div className="ml-14 mt-4 flex flex-wrap items-center gap-3">
                      <button
                        onClick={() => openDecision(s, 'approve')}
                        className="inline-flex items-center gap-2 bg-crwn-gold text-crwn-bg text-sm font-semibold px-5 py-2 rounded-full hover:bg-crwn-gold/90 transition-colors"
                      >
                        <Check className="w-4 h-4" />
                        Approve
                      </button>
                      <button
                        onClick={() => openDecision(s, 'reject')}
                        className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-crwn-elevated text-sm font-medium text-crwn-text-secondary hover:text-crwn-text hover:border-crwn-gold/50 transition-colors"
                      >
                        <X className="w-4 h-4" />
                        Reject
                      </button>
                    </div>
                  )}

                  {/* Approve — the ARTIST sets the real reward here. */}
                  {s.status === 'pending' && isOpen && openMode === 'approve' && (
                    <div className="ml-14 mt-4 border border-crwn-elevated rounded-2xl p-4 space-y-4">
                      <p className="text-sm font-semibold text-crwn-text">Set the real reward and publish</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-medium text-crwn-text-secondary mb-1.5">Reward</label>
                          <select
                            value={rewardType}
                            onChange={(e) => setRewardType(e.target.value as MissionRewardType)}
                            className={SELECT}
                          >
                            {(Object.keys(MISSION_REWARD_LABELS) as MissionRewardType[]).map((r) => (
                              <option key={r} value={r}>
                                {MISSION_REWARD_LABELS[r]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-crwn-text-secondary mb-1.5">Audience</label>
                          <select
                            value={audience}
                            onChange={(e) => setAudience(e.target.value as MissionAudience)}
                            className={SELECT}
                          >
                            {(Object.keys(MISSION_AUDIENCE_LABELS) as MissionAudience[]).map((a) => (
                              <option key={a} value={a}>
                                {MISSION_AUDIENCE_LABELS[a]}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-crwn-text-secondary mb-1.5">
                          Reward details (optional)
                        </label>
                        <input
                          maxLength={200}
                          placeholder="100 credits + BTS clip"
                          value={rewardDetail}
                          onChange={(e) => setRewardDetail(e.target.value)}
                          className={SELECT}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-crwn-text-secondary mb-1.5">Goal</label>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          inputMode="numeric"
                          value={goalInput}
                          onChange={(e) => setGoalInput(e.target.value)}
                          className="w-32 bg-crwn-surface border border-crwn-elevated rounded-xl px-3 py-2.5 text-sm text-crwn-text focus:outline-none focus:border-crwn-gold"
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => sendReview(s)}
                          disabled={submitting}
                          className="inline-flex items-center gap-2 bg-crwn-gold text-crwn-bg text-sm font-semibold px-5 py-2 rounded-full hover:bg-crwn-gold/90 disabled:opacity-40 transition-colors"
                        >
                          <Check className="w-4 h-4" />
                          {submitting ? 'Publishing…' : 'Approve & publish'}
                        </button>
                        <button
                          onClick={() => setOpenId(null)}
                          disabled={submitting}
                          className="text-sm text-crwn-text-secondary hover:text-crwn-text transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Reject — a short reason the fan sees. */}
                  {s.status === 'pending' && isOpen && openMode === 'reject' && (
                    <div className="ml-14 mt-4 border border-crwn-elevated rounded-2xl p-4 space-y-3">
                      <label className="block text-xs font-medium text-crwn-text-secondary">
                        Reason (optional — kept on the record)
                      </label>
                      <input
                        maxLength={500}
                        placeholder="Not the right timing for this one"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        className={SELECT}
                      />
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => sendReview(s)}
                          disabled={submitting}
                          className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-orange-400/40 text-sm font-medium text-orange-400 hover:bg-orange-400/10 disabled:opacity-40 transition-colors"
                        >
                          <X className="w-4 h-4" />
                          {submitting ? 'Saving…' : 'Reject suggestion'}
                        </button>
                        <button
                          onClick={() => setOpenId(null)}
                          disabled={submitting}
                          className="text-sm text-crwn-text-secondary hover:text-crwn-text transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
