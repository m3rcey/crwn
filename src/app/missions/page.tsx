'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Flag, Lightbulb, Plus, Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import {
  MISSION_REWARD_LABELS,
  MISSION_TYPE_LABELS,
  fetchDemandTestCounts,
  missionCurrentCount,
  type MissionRewardType,
  type MissionStatus,
  type MissionTargetKind,
  type MissionType,
} from '@/lib/missions';

interface MissionRow {
  id: string;
  title: string;
  type: MissionType;
  target_kind: MissionTargetKind;
  target_id: string | null;
  target_label: string | null;
  goal_count: number;
  manual_count: number;
  reward_type: MissionRewardType;
  reward_detail: string | null;
  deadline: string | null;
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

/**
 * "Missions" — every fan mission an artist is running, in one list. Money-light:
 * earning missions pay through the artist-wide Share/Clip promotion. Progress
 * follows the v1 rule in @/lib/missions (live demand-test count, else manual).
 */
export default function MissionsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const supabase = createBrowserSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [isArtist, setIsArtist] = useState(false);
  const [missions, setMissions] = useState<MissionRow[]>([]);
  const [demandCounts, setDemandCounts] = useState<Record<string, number>>({});
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
      .from('missions')
      .select('id, title, type, target_kind, target_id, target_label, goal_count, manual_count, reward_type, reward_detail, deadline, status, created_at')
      .eq('artist_id', artist.id)
      .order('created_at', { ascending: false });

    const rows = (data as MissionRow[]) || [];
    setMissions(rows);
    setDemandCounts(await fetchDemandTestCounts(supabase, rows));
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
        <p className="text-crwn-text mb-4">Missions are for artists. Publish your artist page first.</p>
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
        <button
          onClick={() => router.push('/profile/artist')}
          className="inline-flex items-center gap-2 text-sm text-crwn-text-secondary hover:text-crwn-text transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </button>

        <h1 className="text-3xl font-bold text-crwn-text mb-2">Missions</h1>
        <p className="text-crwn-text-secondary text-sm mb-8">
          One trackable fan action toward a goal — rally your fans and watch the count climb.
        </p>

        <div className="flex flex-wrap items-center gap-4 mb-10">
          <button
            onClick={() => router.push('/missions/new')}
            className="inline-flex items-center gap-2 bg-crwn-gold text-crwn-bg font-semibold px-6 py-3 rounded-full hover:bg-crwn-gold/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Mission
          </button>
          <button
            onClick={() => router.push('/missions/suggestions')}
            className="inline-flex items-center gap-2 text-sm font-medium text-crwn-text-secondary hover:text-crwn-gold transition-colors"
          >
            <Lightbulb className="w-4 h-4" />
            Fan suggestions
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => router.push('/action-plan')}
            className="inline-flex items-center gap-2 text-sm font-medium text-crwn-text-secondary hover:text-purple-400 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Action Plan
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {missions.length === 0 ? (
          <div className="border border-dashed border-crwn-elevated rounded-2xl py-14 px-6 text-center">
            <Flag className="w-8 h-8 text-crwn-gold mx-auto mb-3" />
            <p className="text-crwn-text font-medium mb-1">No missions yet</p>
            <p className="text-sm text-crwn-text-secondary">
              Give your fans one clear action — share, clip, RSVP, vote — and a goal to hit together.
            </p>
          </div>
        ) : (
          <div className="space-y-0">
            {missions.map((m, i) => {
              const current = missionCurrentCount(m, demandCounts);
              const pct = Math.min(100, Math.round((current / Math.max(1, m.goal_count)) * 100));
              const deadlinePassed = !!m.deadline && new Date(m.deadline).getTime() < now;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => router.push(`/missions/${m.id}`)}
                  className={`w-full text-left py-4 ${i > 0 ? 'border-t border-crwn-elevated' : ''} group`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-crwn-gold/10 flex items-center justify-center flex-shrink-0">
                      <Flag className="w-5 h-5 text-crwn-gold" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-crwn-text truncate group-hover:text-crwn-gold transition-colors">
                        {m.title}
                      </p>
                      <p className="text-sm text-crwn-text-secondary truncate">
                        {MISSION_TYPE_LABELS[m.type]}
                        {m.target_label ? ` · ${m.target_label}` : ''} · {current}/{m.goal_count}
                        {m.deadline && (
                          <span className={deadlinePassed ? ' text-orange-400' : ''}>
                            {' '}· {deadlinePassed ? 'ended' : 'ends'} {new Date(m.deadline).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-crwn-text-secondary truncate mt-0.5">
                        Reward: {MISSION_REWARD_LABELS[m.reward_type]}
                        {m.reward_detail ? ` — ${m.reward_detail}` : ''}
                      </p>
                    </div>
                    <span
                      className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold ${STATUS_STYLES[m.status]}`}
                    >
                      {STATUS_LABELS[m.status]}
                    </span>
                  </div>
                  <div className="mt-3 ml-14 h-1.5 rounded-full bg-crwn-elevated overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${current >= m.goal_count ? 'bg-green-400' : 'bg-crwn-gold'}`}
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
