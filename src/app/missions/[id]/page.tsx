'use client';

import { useCallback, useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Archive, Check, Trophy, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import {
  MISSION_AUDIENCE_LABELS,
  MISSION_REWARD_LABELS,
  MISSION_TYPE_LABELS,
  missionCurrentCount,
  type MissionAudience,
  type MissionRewardType,
  type MissionStatus,
  type MissionTargetKind,
  type MissionType,
} from '@/lib/missions';
import { smartBack } from '@/lib/navigation';

interface MissionDetail {
  id: string;
  artist_id: string;
  type: MissionType;
  target_kind: MissionTargetKind;
  target_id: string | null;
  target_label: string | null;
  goal_count: number;
  manual_count: number;
  reward_type: MissionRewardType;
  reward_detail: string | null;
  deadline: string | null;
  audience: MissionAudience;
  title: string;
  description: string | null;
  cta: string | null;
  status: MissionStatus;
  created_at: string;
}

const STATUS_STYLES: Record<MissionStatus, string> = {
  active: 'bg-crwn-gold/15 text-crwn-gold border border-crwn-gold/40',
  completed: 'bg-green-500/15 text-green-400 border border-green-500/40',
  archived: 'bg-crwn-elevated text-crwn-text-secondary',
};

const STATUS_LABELS: Record<MissionStatus, string> = {
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
};

function deadlineCountdown(deadline: string): { label: string; urgent: boolean; passed: boolean } {
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return { label: 'Deadline passed', urgent: false, passed: true };
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return { label: `${days} day${days === 1 ? '' : 's'} left`, urgent: days <= 3, passed: false };
  const hours = Math.max(1, Math.floor(ms / 3600000));
  return { label: `${hours} hour${hours === 1 ? '' : 's'} left`, urgent: true, passed: false };
}

/**
 * Mission detail — a clean summary of one mission: progress against the goal
 * (live from the demand test when linked, manual otherwise), the reward, and
 * status actions. Artist-only via RLS.
 */
export default function MissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const supabase = createBrowserSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [mission, setMission] = useState<MissionDetail | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [demandCount, setDemandCount] = useState(0);
  const [updating, setUpdating] = useState(false);
  const [progressInput, setProgressInput] = useState('');

  const load = useCallback(async () => {
    if (!user) return;

    const { data } = await supabase.from('missions').select('*').eq('id', id).maybeSingle();

    if (!data) {
      setMission(null);
      setLoading(false);
      return;
    }
    const m = data as MissionDetail;
    setMission(m);
    setProgressInput(String(m.manual_count));

    // Ownership: only the artist who owns this mission can manage it. Anyone
    // else (public RLS read) gets a read-only view — the owner-gated UPDATEs
    // would match 0 rows for them and fake success otherwise.
    const { data: ownedArtist } = await supabase
      .from('artist_profiles')
      .select('id')
      .eq('id', m.artist_id)
      .eq('user_id', user.id)
      .maybeSingle();
    setIsOwner(!!ownedArtist);

    // Progress rule: demand_test missions read the live response_count.
    if (m.target_kind === 'demand_test' && m.target_id) {
      const { data: test } = await supabase
        .from('proof_of_demand')
        .select('response_count')
        .eq('id', m.target_id)
        .maybeSingle();
      setDemandCount(test?.response_count ?? 0);
    }
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

  const setStatus = async (status: 'completed' | 'archived') => {
    if (!mission || updating || !isOwner) return;
    setUpdating(true);
    const { error } = await supabase.from('missions').update({ status }).eq('id', mission.id);
    if (error) {
      showToast(error.message, 'error');
    } else {
      setMission({ ...mission, status });
      showToast(status === 'completed' ? 'Mission marked completed.' : 'Mission archived.', 'success');
    }
    setUpdating(false);
  };

  const del = async () => {
    if (!mission || !isOwner || updating) return;
    if (!window.confirm('Delete this mission permanently? This cannot be undone.')) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/missions/${mission.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.deleted) {
        showToast('Mission deleted.', 'success');
        router.push('/missions');
        return;
      }
      if (json.archived) {
        showToast('This mission has participants, so it was archived to keep their records.', 'success');
        setMission({ ...mission, status: 'archived' });
      } else {
        showToast(json.error || 'Could not delete', 'error');
      }
    } catch {
      showToast('Could not delete', 'error');
    }
    setUpdating(false);
  };

  const saveProgress = async () => {
    if (!mission || updating || !isOwner) return;
    const count = Math.round(Number(progressInput));
    if (progressInput.trim() === '' || isNaN(count) || count < 0) {
      showToast('Enter a valid count (0 or more).', 'error');
      return;
    }
    setUpdating(true);
    const { error } = await supabase.from('missions').update({ manual_count: count }).eq('id', mission.id);
    if (error) {
      showToast(error.message, 'error');
    } else {
      setMission({ ...mission, manual_count: count });
      showToast('Progress updated.', 'success');
    }
    setUpdating(false);
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-crwn-gold" />
      </div>
    );
  }

  if (!mission) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <p className="text-crwn-text mb-4">Mission not found.</p>
        <button
          onClick={() => router.push('/missions')}
          className="bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full hover:bg-crwn-gold/90 transition-colors"
        >
          Back to Missions
        </button>
      </div>
    );
  }

  const isDemandTracked = mission.target_kind === 'demand_test' && !!mission.target_id;
  const current = missionCurrentCount(mission, mission.target_id ? { [mission.target_id]: demandCount } : {});
  const goalMet = current >= mission.goal_count;
  const pct = Math.min(100, Math.round((current / Math.max(1, mission.goal_count)) * 100));
  const countdown = mission.deadline ? deadlineCountdown(mission.deadline) : null;

  const targetValue =
    mission.target_kind === 'none'
      ? 'My artist page'
      : `${mission.target_kind === 'demand_test' ? 'Demand test' : mission.target_kind === 'tier' ? 'Tier' : mission.target_kind}${
          mission.target_label ? ` — ${mission.target_label}` : ''
        }`;

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <button
          onClick={() => smartBack(router, '/missions')}
          className="inline-flex items-center gap-2 text-sm text-crwn-text-secondary hover:text-crwn-text transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          All missions
        </button>

        {/* Title + status */}
        <div className="flex items-start justify-between gap-3 mb-1">
          <h1 className="text-3xl font-bold text-crwn-text">{mission.title}</h1>
          <span
            className={`flex-shrink-0 mt-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${STATUS_STYLES[mission.status]}`}
          >
            {STATUS_LABELS[mission.status]}
          </span>
        </div>
        <p className="text-sm text-crwn-text-secondary mb-6">
          {MISSION_TYPE_LABELS[mission.type]} · {MISSION_AUDIENCE_LABELS[mission.audience]}
        </p>

        {/* Progress */}
        <div className="border border-crwn-elevated rounded-2xl p-5 mb-6">
          <div className="flex items-end justify-between gap-3 mb-3">
            <div>
              <p className="text-4xl font-bold text-crwn-text">
                {current}
                <span className="text-lg font-medium text-crwn-text-secondary"> / {mission.goal_count}</span>
              </p>
              <p className="text-xs text-crwn-text-secondary mt-1">
                {isDemandTracked ? 'auto-tracked from the demand test' : 'completions toward the goal'}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              {goalMet && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-crwn-gold/15 text-crwn-gold border border-crwn-gold/40">
                  <Trophy className="w-3.5 h-3.5" />
                  Goal met ✓
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
        </div>

        {/* Details */}
        <div className="border border-crwn-elevated rounded-2xl divide-y divide-crwn-elevated mb-6">
          <DetailRow label="Target" value={targetValue} />
          <DetailRow
            label="Reward"
            value={`${MISSION_REWARD_LABELS[mission.reward_type]}${mission.reward_detail ? ` — ${mission.reward_detail}` : ''}`}
          />
          <DetailRow label="Audience" value={MISSION_AUDIENCE_LABELS[mission.audience]} />
          {mission.cta && <DetailRow label="Button" value={mission.cta} />}
          {mission.description && <DetailRow label="Description" value={mission.description} />}
        </div>

        {/* Update progress — manual missions only; demand_test missions auto-track.
            Owner-only: non-owners get a read-only view of progress/details. */}
        {!isOwner ? null : isDemandTracked ? (
          <div className="flex items-center justify-between gap-3 border border-crwn-elevated rounded-2xl px-4 py-3.5 mb-6">
            <p className="text-sm text-crwn-text-secondary">
              Progress is auto-tracked from the demand test. No manual updates needed.
            </p>
            <button
              onClick={() => router.push(`/proof-of-demand/${mission.target_id}`)}
              className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-crwn-gold hover:text-crwn-gold/80 transition-colors"
            >
              View test
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="border border-crwn-elevated rounded-2xl p-4 mb-6">
            <label className="block text-sm font-medium text-crwn-text mb-2">Update progress</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={progressInput}
                onChange={(e) => setProgressInput(e.target.value)}
                className="w-28 bg-crwn-surface border border-crwn-elevated rounded-xl px-3 py-2.5 text-crwn-text focus:outline-none focus:border-crwn-gold"
              />
              <button
                onClick={saveProgress}
                disabled={updating}
                className="inline-flex items-center gap-2 bg-crwn-gold text-crwn-bg text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-crwn-gold/90 disabled:opacity-40 transition-colors"
              >
                <Check className="w-4 h-4" />
                Save
              </button>
            </div>
            <p className="text-xs text-crwn-text-secondary mt-2">
              How many fans have done it so far. Deeper live tracking comes in a later phase.
            </p>
          </div>
        )}

        {/* Actions — owner-only */}
        {isOwner && (
          <div className="flex flex-wrap items-center gap-3">
            {mission.status === 'active' && (
              <>
                <button
                  onClick={() => setStatus('completed')}
                  disabled={updating}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-green-500/40 text-sm font-medium text-green-400 hover:bg-green-500/10 disabled:opacity-40 transition-colors"
                >
                  <Trophy className="w-4 h-4" />
                  Mark Completed
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
            <button
              onClick={del}
              disabled={updating}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-red-500/40 text-sm font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <span className="text-sm text-crwn-text-secondary flex-shrink-0">{label}</span>
      <span className="text-sm text-crwn-text text-right">{value}</span>
    </div>
  );
}
