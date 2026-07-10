'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { QuestInstance, CompletionEvent } from '@/lib/quests/types';
import { ArtistBuildPicker } from '@/components/quests/ArtistBuildPicker';
import { QuestCard } from '@/components/quests/QuestCard';
import { MovementMap } from '@/components/quests/MovementMap';
import { QuestCompletionModal } from '@/components/quests/QuestCompletionModal';
import { Confetti } from '@/components/quests/Confetti';
import { getArtistBuild } from '@/lib/quests/builds';
import { Flame, Zap, Loader2, Sparkles } from 'lucide-react';

// Count-up animation for XP. performance.now() is allowed (Date.now is not, but
// only in workflow scripts — this is app code). Animates whenever the target moves.
function useCountUp(target: number, durationMs = 900): { value: number; bumped: boolean } {
  const [value, setValue] = useState(target);
  const [bumped, setBumped] = useState(false);
  const prev = useRef(target);

  useEffect(() => {
    const from = prev.current;
    const to = target;
    if (from === to) return;
    setBumped(true);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else {
        prev.current = to;
        setTimeout(() => setBumped(false), 400);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return { value, bumped };
}

interface QuestsResponse {
  enabled: boolean;
  role: 'artist' | 'fan';
  artistId: string | null;
  quests: QuestInstance[];
  completions: CompletionEvent[];
  recommended: { questId: string; title: string; reason: string } | null;
  build: { primary: string | null; secondary: string | null };
  progression: {
    xp: number;
    level: number;
    levelTitle: string;
    percentToNext: number;
    xpForNextLevel: number | null;
    isMax: boolean;
    streak: number;
    fanRole: string | null;
  };
}

const OPEN = ['available', 'active', 'in_progress', 'ready_to_complete', 'locked'];

// Rise Mode — the artist's guided career board. Consumes /api/quests (which assigns
// eligible quests + auto-completes server-side) and lays out Main Quest / Daily Move /
// Weekly Goal / Side Quests / Movement Map. Degrades gracefully while dark-launched.
export function RiseMode() {
  const router = useRouter();
  const [data, setData] = useState<QuestsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [focus, setFocus] = useState(false);

  useEffect(() => {
    try {
      setFocus(localStorage.getItem('rise_focus') === '1');
    } catch {
      /* ignore */
    }
  }, []);

  const setFocusMode = useCallback((on: boolean) => {
    setFocus(on);
    try {
      localStorage.setItem('rise_focus', on ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);

  // Guard against concurrent loads (mount + rise:activate can fire together on
  // return) — the in-flight fetch already runs the completion cascade, so a second
  // one would only race and risk clobbering the completion result.
  const loadingRef = useRef(false);
  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const res = await fetch('/api/quests', { cache: 'no-store' });
      const json = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Refetch whenever the artist RETURNS — from a creator page (window focus /
  // tab visibility) or by switching back to the Rise tab (the dashboard dispatches
  // 'rise:activate'). This is what makes XP/progress update + the celebration fire
  // on return instead of showing a stale board.
  useEffect(() => {
    const refetch = () => load();
    const onVis = () => {
      if (document.visibilityState === 'visible') load();
    };
    window.addEventListener('focus', refetch);
    window.addEventListener('rise:activate', refetch);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', refetch);
      window.removeEventListener('rise:activate', refetch);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  // Fire confetti once per fresh completion.
  const [confetti, setConfetti] = useState(0);
  const seenCompletions = useRef<Set<string>>(new Set());
  useEffect(() => {
    const fresh = (data?.completions ?? []).filter((c) => !seenCompletions.current.has(c.questId));
    if (fresh.length > 0) {
      fresh.forEach((c) => seenCompletions.current.add(c.questId));
      setConfetti((n) => n + 1);
    }
  }, [data]);

  const xpAnim = useCountUp(data?.progression?.xp ?? 0);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-crwn-gold" />
      </div>
    );
  }

  if (!data || !data.enabled) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="text-5xl mb-3">👑</div>
        <h2 className="text-2xl font-bold text-crwn-text">Rise Mode is on its way</h2>
        <p className="text-lg text-crwn-text-secondary mt-3 leading-relaxed">
          Your guided career mode — your next move, every day — is being prepared for your CRWN.
        </p>
      </div>
    );
  }

  if (data.role === 'artist' && !data.build.primary) {
    return <ArtistBuildPicker onChosen={() => load()} />;
  }

  const open = data.quests.filter((q) => OPEN.includes(q.status));
  const completed = data.quests.filter((q) => q.status === 'completed');

  const pickType = (types: string[]) =>
    open.find((q) => types.includes(q.quest_type) && q.status !== 'locked');

  const mainQuest =
    pickType(['main_quest', 'boss_quest', 'onboarding_quest']) || open.find((q) => q.status !== 'locked');
  const dailyMove = pickType(['daily_move', 'daily_assignment']);
  const weeklyGoal = pickType(['weekly_goal']);
  const sideQuests = open.filter(
    (q) => q.id !== mainQuest?.id && q.id !== dailyMove?.id && q.id !== weeklyGoal?.id && q.status !== 'locked',
  );
  const rewardsClose = open.filter((q) => q.progress_percent >= 50 && (q.reward?.unlocks?.length || q.unlocks?.length));
  const recommendedQuest = data.recommended ? open.find((q) => q.id === data.recommended!.questId) : undefined;
  // Has the artist already launched a campaign? Drives the empty-state next move so
  // it never tells them to "launch a campaign" right after they launched one.
  const hasCampaign = data.quests.some(
    (q) => q.template_key === 'artist_create_road_campaign' && q.status === 'completed',
  );

  const p = data.progression;
  const build = getArtistBuild(data.build.primary);

  // Focus Mode: nothing but the next move. Guided, not caged — one tap back to full.
  if (focus) {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <Confetti trigger={confetti} />
        <QuestCompletionModal events={data.completions} />
        <div className="flex items-center justify-between gap-3">
          <span className="text-lg text-crwn-text-secondary">
            Level {p.level} · {p.levelTitle} ·{' '}
            <span className={`text-crwn-gold font-bold inline-block ${xpAnim.bumped ? 'crwn-xp-pop' : ''}`}>
              {xpAnim.value} XP
            </span>
          </span>
          <button onClick={() => setFocusMode(false)} className="text-base text-crwn-gold hover:underline shrink-0">
            Show full dashboard
          </button>
        </div>
        {mainQuest ? (
          <div>
            <div className="text-lg font-bold text-crwn-gold uppercase tracking-wide mb-2">👉 Your next move</div>
            <QuestCard quest={mainQuest} variant="hero" />
          </div>
        ) : (
          <NextGrowthMove router={router} hasCampaign={hasCampaign} />
        )}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Confetti trigger={confetti} />
      <QuestCompletionModal events={data.completions} />
      {/* Progression header */}
      <div className="rounded-2xl border border-[#2A2A2A] bg-[#1A1A1A] p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-bold tracking-widest text-crwn-gold uppercase">Rise Mode</span>
              {build && (
                <span className="text-base text-crwn-text-secondary">· {build.emoji} {build.title}</span>
              )}
            </div>
            <h2 className="text-3xl font-bold text-crwn-text mt-1.5">
              Level {p.level} — {p.levelTitle}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-crwn-text">
              <Zap className="w-5 h-5 text-crwn-gold" />
              <span className={`text-2xl font-bold inline-block ${xpAnim.bumped ? 'crwn-xp-pop' : ''}`}>{xpAnim.value}</span>
              <span className="text-base text-crwn-text-secondary">XP</span>
            </div>
            {p.streak > 0 && (
              <div className="flex items-center gap-2 text-crwn-text">
                <Flame className="w-5 h-5 text-orange-400" />
                <span className="text-2xl font-bold">{p.streak}</span>
                <span className="text-base text-crwn-text-secondary">day streak</span>
              </div>
            )}
            <button
              onClick={() => setFocusMode(true)}
              className="text-base text-crwn-text-secondary hover:text-crwn-gold border border-[#2A2A2A] rounded-full px-4 py-1.5"
            >
              Focus
            </button>
          </div>
        </div>
        {!p.isMax && (
          <div className="mt-4">
            <div className="h-2 rounded-full bg-[#2A2A2A] overflow-hidden">
              <div className="h-full bg-crwn-gold rounded-full transition-all duration-700 ease-out" style={{ width: `${p.percentToNext}%` }} />
            </div>
            <div className="text-sm text-crwn-text-secondary mt-1.5">{p.percentToNext}% to next level</div>
          </div>
        )}
      </div>

      {/* Your Next Move — the one dominant, obvious action */}
      {mainQuest ? (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg font-bold text-crwn-gold uppercase tracking-wide">👉 Your next move</span>
          </div>
          <QuestCard quest={mainQuest} variant="hero" />
        </div>
      ) : (
        <NextGrowthMove router={router} hasCampaign={hasCampaign} />
      )}

      {/* AI Recommended Quest */}
      {recommendedQuest && data.recommended && recommendedQuest.id !== mainQuest?.id && (
        <div>
          <h3 className="text-base font-bold uppercase tracking-wide text-crwn-text-secondary mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-crwn-gold" /> AI Recommended
          </h3>
          <div className="rounded-2xl border border-crwn-gold/30 bg-[#1A1A1A] p-4">
            <p className="text-lg text-crwn-text-secondary italic mb-3">“{data.recommended.reason}”</p>
            <QuestCard quest={recommendedQuest} variant="compact" />
          </div>
        </div>
      )}

      {/* Daily Move + Weekly Goal */}
      {(dailyMove || weeklyGoal) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dailyMove && (
            <div>
              <h3 className="text-base font-bold uppercase tracking-wide text-crwn-text-secondary mb-2">Daily Move</h3>
              <QuestCard quest={dailyMove} />
            </div>
          )}
          {weeklyGoal && (
            <div>
              <h3 className="text-base font-bold uppercase tracking-wide text-crwn-text-secondary mb-2">Weekly Goal</h3>
              <QuestCard quest={weeklyGoal} />
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Side quests + rewards */}
        <div className="lg:col-span-2 space-y-6">
          {sideQuests.length > 0 && (
            <div>
              <h3 className="text-base font-bold uppercase tracking-wide text-crwn-text-secondary mb-2">Side Quests</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {sideQuests.slice(0, 6).map((q) => (
                  <QuestCard key={q.id} quest={q} variant="compact" />
                ))}
              </div>
            </div>
          )}

          {rewardsClose.length > 0 && (
            <div>
              <h3 className="text-base font-bold uppercase tracking-wide text-crwn-text-secondary mb-2">
                Rewards Close to Unlock
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {rewardsClose.slice(0, 4).map((q) => (
                  <QuestCard key={q.id} quest={q} variant="compact" />
                ))}
              </div>
            </div>
          )}

          {completed.length > 0 && (
            <div>
              <h3 className="text-base font-bold uppercase tracking-wide text-crwn-text-secondary mb-2">
                Recent Milestones
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {completed.slice(-4).reverse().map((q) => (
                  <QuestCard key={q.id} quest={q} variant="compact" />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Movement Map */}
        <div className="space-y-4">
          <MovementMap role="artist" currentLevel={p.level} />
        </div>
      </div>
    </div>
  );
}

// The single, obvious growth move shown once the setup ladder is cleared — ONE
// action (per the "one obvious next move" principle). Context-aware: if they've
// already launched a campaign, it moves them on instead of repeating itself.
function NextGrowthMove({
  router,
  hasCampaign,
}: {
  router: ReturnType<typeof useRouter>;
  hasCampaign: boolean;
}) {
  const move = hasCampaign
    ? {
        title: 'Rally your fans with a mission',
        body: 'Your campaign is live. Give supporters one clear action — share, clip, or invite — and watch it move.',
        cta: 'Create a fan mission →',
        href: '/missions/new',
      }
    : {
        title: 'Launch a campaign',
        body: "You've built the foundation. Now give your supporters a goal to rally behind — a Road To campaign turns quiet fans into active backers.",
        cta: 'Launch a campaign →',
        href: '/campaigns/new?returnTo=%2Fprofile%2Fartist%3Ftab%3Drise',
      };
  return (
    <div className="rounded-2xl border border-crwn-gold/30 bg-[#1A1A1A] p-6">
      <div className="text-lg font-bold text-crwn-gold uppercase tracking-wide mb-2">👉 Your next move</div>
      <h3 className="text-2xl font-bold text-crwn-text">{move.title}</h3>
      <p className="text-crwn-text-secondary text-lg mt-2 leading-relaxed">{move.body}</p>
      <button
        onClick={() => router.push(move.href)}
        className="neu-button-accent w-full mt-5 py-3.5 rounded-full font-semibold text-base"
      >
        {move.cta}
      </button>
    </div>
  );
}
