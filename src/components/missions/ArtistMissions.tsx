'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Flag, Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import {
  MISSION_REWARD_LABELS,
  MISSION_TYPE_LABELS,
  fetchDemandTestCounts,
  missionActionHref,
  missionCurrentCount,
  type MissionRewardType,
  type MissionTargetKind,
  type MissionType,
} from '@/lib/missions';

interface FanMissionRow {
  id: string;
  title: string;
  description: string | null;
  cta: string | null;
  type: MissionType;
  target_kind: MissionTargetKind;
  target_id: string | null;
  target_label: string | null;
  goal_count: number;
  manual_count: number;
  reward_type: MissionRewardType;
  reward_detail: string | null;
  deadline: string | null;
}

interface ArtistMissionsProps {
  artistId: string;
  artistSlug: string;
  artistName: string;
}

/**
 * The fan-facing missions block on a public artist page. HONEST by design:
 * a fan JOINS a mission (a commitment we record), then the "Do it" link hands
 * them off to the real action. We never mark anything completed here — no
 * event source exists for that yet.
 */
export function ArtistMissions({ artistId, artistSlug, artistName }: ArtistMissionsProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();

  const [missions, setMissions] = useState<FanMissionRow[]>([]);
  const [demandCounts, setDemandCounts] = useState<Record<string, number>>({});
  const [participantCounts, setParticipantCounts] = useState<Record<string, number>>({});
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const [joining, setJoining] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    // Public read — RLS allows anyone to see active missions.
    const { data } = await supabase
      .from('missions')
      .select('id, title, description, cta, type, target_kind, target_id, target_label, goal_count, manual_count, reward_type, reward_detail, deadline')
      .eq('artist_id', artistId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    const rows = (data as FanMissionRow[]) || [];
    setMissions(rows);
    setLoaded(true);
    if (rows.length === 0) return;

    setDemandCounts(await fetchDemandTestCounts(supabase, rows));

    // Aggregate joins come from the API (RLS hides other fans' rows client-side).
    try {
      const res = await fetch(`/api/missions/participant-counts?ids=${rows.map((m) => m.id).join(',')}`);
      const json = await res.json();
      if (json.counts) setParticipantCounts(json.counts);
    } catch {
      // Counts are cosmetic — the list still renders without them.
    }

    // Which of these has the viewer joined? Session-scoped read (own rows only).
    if (user) {
      const { data: mine } = await supabase
        .from('mission_participants')
        .select('mission_id')
        .eq('fan_id', user.id)
        .in('mission_id', rows.map((m) => m.id));
      setJoinedIds(new Set(((mine as { mission_id: string }[]) || []).map((r) => r.mission_id)));
    }
  }, [supabase, artistId, user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleJoin = async (missionId: string) => {
    if (!user) {
      router.push(`/login?next=/${artistSlug}`);
      return;
    }
    if (joining) return;
    setJoining(missionId);
    try {
      const res = await fetch(`/api/missions/${missionId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join' }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || 'Could not join the mission', 'error');
      } else {
        setJoinedIds((prev) => new Set([...prev, missionId]));
        setParticipantCounts((prev) => ({ ...prev, [missionId]: json.participantCount ?? (prev[missionId] ?? 0) + 1 }));
        showToast('You joined the mission. Now go do it!', 'success');
      }
    } catch {
      showToast('Could not join the mission', 'error');
    }
    setJoining(null);
  };

  if (!loaded || missions.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-2 mb-1">
        <Flag className="w-4 h-4 text-crwn-gold" />
        <h2 className="text-lg font-semibold text-crwn-text">Missions</h2>
      </div>
      <p className="text-sm text-crwn-text-secondary mb-4">
        {artistName} needs a hand. Join a mission and help hit the goal.
      </p>

      <div className="space-y-0">
        {missions.map((m, i) => {
          const current = missionCurrentCount(m, demandCounts);
          const goalMet = current >= m.goal_count;
          const pct = Math.min(100, Math.round((current / Math.max(1, m.goal_count)) * 100));
          const joined = joinedIds.has(m.id);
          const participants = participantCounts[m.id] ?? 0;

          return (
            <div key={m.id} className={`py-4 ${i > 0 ? 'border-t border-crwn-elevated' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-crwn-text truncate">{m.title}</p>
                  <p className="text-sm text-crwn-text-secondary truncate">
                    {MISSION_TYPE_LABELS[m.type]}
                    {m.target_label ? ` · ${m.target_label}` : ''} · {current}/{m.goal_count}
                  </p>
                  <p className="text-xs text-crwn-text-secondary truncate mt-0.5">
                    Reward: {MISSION_REWARD_LABELS[m.reward_type]}
                    {m.reward_detail ? `, ${m.reward_detail}` : ''}
                  </p>
                </div>
                {participants > 0 && (
                  <span className="flex-shrink-0 inline-flex items-center gap-1 text-xs text-crwn-text-secondary mt-0.5">
                    <Users className="w-3.5 h-3.5" />
                    {participants} joined
                  </span>
                )}
              </div>

              {m.description && (
                <p className="text-sm text-crwn-text-secondary mt-2">{m.description}</p>
              )}

              <div className="mt-3 h-1.5 rounded-full bg-crwn-elevated overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${goalMet ? 'bg-green-400' : 'bg-crwn-gold'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 mt-3">
                {joined ? (
                  <span className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-sm font-semibold bg-green-500/15 text-green-400 border border-green-500/40">
                    <Check className="w-4 h-4" />
                    Joined
                  </span>
                ) : (
                  <button
                    onClick={() => handleJoin(m.id)}
                    disabled={joining === m.id}
                    className="bg-crwn-gold text-crwn-bg text-sm font-semibold px-5 py-2 rounded-full hover:bg-crwn-gold/90 disabled:opacity-40 transition-colors"
                  >
                    {joining === m.id ? 'Joining…' : 'Join mission'}
                  </button>
                )}
                <button
                  onClick={() => router.push(missionActionHref(m, artistSlug))}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-crwn-text-secondary hover:text-crwn-gold transition-colors"
                >
                  {m.cta || 'Do it'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
