'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Flag, Loader2 } from 'lucide-react';
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

interface JoinedMission {
  id: string;
  title: string;
  cta: string | null;
  type: MissionType;
  target_kind: MissionTargetKind;
  target_id: string | null;
  target_label: string | null;
  goal_count: number;
  manual_count: number;
  reward_type: MissionRewardType;
  reward_detail: string | null;
  artist_id: string;
  artistName: string;
  artistSlug: string | null;
  joinedAt: string;
}

/**
 * "My Missions" — every mission this fan has JOINED, in one place. Honest by
 * design: joining is a commitment we record; nothing here is ever marked
 * completed automatically (no event source exists for that yet). All reads are
 * session-scoped (mission_participants RLS = own rows only).
 */
export default function MyMissionsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [missions, setMissions] = useState<JoinedMission[]>([]);
  const [demandCounts, setDemandCounts] = useState<Record<string, number>>({});
  const [leaving, setLeaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;

    // Own rows only — RLS enforces fan_id = auth.uid().
    const { data: joins } = await supabase
      .from('mission_participants')
      .select('mission_id, created_at')
      .eq('fan_id', user.id)
      .order('created_at', { ascending: false });

    const joinRows = (joins as { mission_id: string; created_at: string }[]) || [];
    if (joinRows.length === 0) {
      setMissions([]);
      setLoading(false);
      return;
    }

    // Missions RLS is public-read for active only — archived/completed ones
    // simply drop off this list, which is the honest behavior we want.
    const { data: missionRows } = await supabase
      .from('missions')
      .select('id, title, cta, type, target_kind, target_id, target_label, goal_count, manual_count, reward_type, reward_detail, artist_id')
      .in('id', joinRows.map((j) => j.mission_id));

    const rows = (missionRows as Omit<JoinedMission, 'artistName' | 'artistSlug' | 'joinedAt'>[]) || [];

    // Resolve artist slug + display name (slug on artist_profiles, name on profiles).
    const artistIds = [...new Set(rows.map((m) => m.artist_id))];
    const { data: artists } = artistIds.length
      ? await supabase.from('artist_profiles').select('id, slug, user_id').in('id', artistIds)
      : { data: [] };
    const artistRows = (artists as { id: string; slug: string; user_id: string }[]) || [];

    const userIds = [...new Set(artistRows.map((a) => a.user_id))];
    const { data: profiles } = userIds.length
      ? await supabase.from('profiles').select('id, display_name').in('id', userIds)
      : { data: [] };
    const nameByUserId: Record<string, string> = {};
    for (const p of (profiles as { id: string; display_name: string | null }[]) || []) {
      nameByUserId[p.id] = p.display_name || 'Artist';
    }
    const artistById: Record<string, { slug: string | null; name: string }> = {};
    for (const a of artistRows) {
      artistById[a.id] = { slug: a.slug, name: nameByUserId[a.user_id] || 'Artist' };
    }

    const joinedAtByMission: Record<string, string> = {};
    for (const j of joinRows) joinedAtByMission[j.mission_id] = j.created_at;

    const merged: JoinedMission[] = joinRows
      .map((j) => rows.find((m) => m.id === j.mission_id))
      .filter((m): m is Omit<JoinedMission, 'artistName' | 'artistSlug' | 'joinedAt'> => !!m)
      .map((m) => ({
        ...m,
        artistName: artistById[m.artist_id]?.name || 'Artist',
        artistSlug: artistById[m.artist_id]?.slug || null,
        joinedAt: joinedAtByMission[m.id],
      }));

    setMissions(merged);
    setDemandCounts(await fetchDemandTestCounts(supabase, merged));
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    load();
  }, [authLoading, user, router, load]);

  const handleLeave = async (missionId: string) => {
    if (leaving) return;
    setLeaving(missionId);
    try {
      const res = await fetch(`/api/missions/${missionId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'leave' }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || 'Could not leave the mission', 'error');
      } else {
        setMissions((prev) => prev.filter((m) => m.id !== missionId));
        showToast('You left the mission.', 'success');
      }
    } catch {
      showToast('Could not leave the mission', 'error');
    }
    setLeaving(null);
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto page-fade-in">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-crwn-text">My Missions</h1>
        <button
          onClick={() => router.push('/command')}
          className="shrink-0 mt-1 text-xs font-semibold text-crwn-gold hover:text-crwn-gold/80 transition-colors flex items-center gap-1"
        >
          Command Center
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-sm text-crwn-text-secondary mb-6">
        The missions you&apos;ve joined — every one is an artist counting on you.
      </p>

      {missions.length === 0 ? (
        <div className="neu-raised rounded-xl p-8 text-center">
          <Flag className="w-12 h-12 text-crwn-gold/30 mx-auto mb-3" />
          <p className="text-crwn-text font-medium">No missions yet</p>
          <p className="text-sm text-crwn-text-secondary mt-2 max-w-sm mx-auto">
            Artists post missions on their pages — one clear action toward a goal.
            Find an artist you back and join one.
          </p>
          <button
            onClick={() => router.push('/explore')}
            className="mt-5 px-5 py-2 rounded-full font-semibold text-sm neu-button-accent text-crwn-bg"
          >
            Explore artists
          </button>
        </div>
      ) : (
        <div className="space-y-0 stagger-fade-in">
          {missions.map((m, i) => {
            const current = missionCurrentCount(m, demandCounts);
            const goalMet = current >= m.goal_count;
            const pct = Math.min(100, Math.round((current / Math.max(1, m.goal_count)) * 100));

            return (
              <div key={m.id} className={`py-4 ${i > 0 ? 'border-t border-crwn-elevated' : ''}`}>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-crwn-gold/10 flex items-center justify-center flex-shrink-0">
                    <Flag className="w-5 h-5 text-crwn-gold" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-crwn-text truncate">{m.title}</p>
                    <p className="text-sm text-crwn-text-secondary truncate">
                      {m.artistSlug ? (
                        <button
                          onClick={() => router.push(`/${m.artistSlug}`)}
                          className="hover:text-crwn-gold transition-colors"
                        >
                          {m.artistName}
                        </button>
                      ) : (
                        m.artistName
                      )}
                      {' '}· {MISSION_TYPE_LABELS[m.type]} · {current}/{m.goal_count}
                    </p>
                    <p className="text-xs text-crwn-text-secondary truncate mt-0.5">
                      Reward: {MISSION_REWARD_LABELS[m.reward_type]}
                      {m.reward_detail ? ` — ${m.reward_detail}` : ''}
                    </p>
                  </div>
                </div>

                <div className="mt-3 ml-14 h-1.5 rounded-full bg-crwn-elevated overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${goalMet ? 'bg-green-400' : 'bg-crwn-gold'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-4 mt-3 ml-14">
                  {m.artistSlug && (
                    <button
                      onClick={() => router.push(missionActionHref(m, m.artistSlug as string))}
                      className="inline-flex items-center gap-1.5 bg-crwn-gold text-crwn-bg text-sm font-semibold px-5 py-2 rounded-full hover:bg-crwn-gold/90 transition-colors"
                    >
                      {m.cta || 'Do it'}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleLeave(m.id)}
                    disabled={leaving === m.id}
                    className="text-sm font-medium text-crwn-text-secondary hover:text-red-400 disabled:opacity-40 transition-colors"
                  >
                    {leaving === m.id ? 'Leaving…' : 'Leave'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
