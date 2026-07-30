'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { QuestInstance, CompletionEvent } from '@/lib/quests/types';
import { ArtistBuildPicker } from '@/components/quests/ArtistBuildPicker';
import { QuestCard } from '@/components/quests/QuestCard';
import { MovementMap } from '@/components/quests/MovementMap';
import { QuestCompletionModal } from '@/components/quests/QuestCompletionModal';
import { Confetti } from '@/components/quests/Confetti';
import { RoyaltyReadinessCard } from '@/components/artist/RoyaltyReadinessCard';
import { StarterOfferCard } from '@/components/artist/StarterOfferCard';
import { getArtistBuild } from '@/lib/quests/builds';
import { Flame, Zap, Loader2, Sparkles } from 'lucide-react';

interface QuestsResponse {
  enabled: boolean;
  role: 'artist' | 'fan';
  artistId: string | null;
  quests: QuestInstance[];
  completions: CompletionEvent[];
  recap: {
    count: number;
    xpAwarded: number;
    leveledUp: boolean;
    newLevel: number;
    levelTitle: string;
    titles: string[];
  } | null;
  victory: {
    tracks: number;
    supporters: number;
    campaigns: number;
    referrals: number;
    xp: number;
    level: number;
  } | null;
  recommended: { questId: string; title: string; reason: string } | null;
  leadMagnet: {
    toolSlug: string;
    toolName: string;
    title: string;
    monthlyValue: string | null;
    href: string;
  } | null;
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
  const [recapDismissed, setRecapDismissed] = useState(false);
  const [showMap, setShowMap] = useState(false);

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

  // Re-show the catch-up recap whenever a new one arrives (an established artist's
  // first Rise load auto-recognizes multiple quests). Server grants XP idempotently,
  // so this banner is purely informational.
  const recapCount = data?.recap?.count ?? 0;
  useEffect(() => {
    if (recapCount >= 2) setRecapDismissed(false);
  }, [recapCount]);

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

  // Celebration trigger. Fires on ANY XP increase since the artist last viewed Rise
  // Mode (persisted in localStorage). This is robust: it does NOT depend on the
  // completion landing in THIS response, so completing a quest on a creator page and
  // returning always celebrates, even if the completion was recorded on a background
  // load. Drives confetti, the XP count-up, and the congrats modal.
  const [confetti, setConfetti] = useState(0);
  const [xpGain, setXpGain] = useState<{ delta: number; nonce: number } | null>(null);
  const [displayXp, setDisplayXp] = useState(0);
  const [xpBumped, setXpBumped] = useState(false);
  const [barWidth, setBarWidth] = useState(0);
  const lastXpRef = useRef<number | null>(null);
  const initedXpRef = useRef(false);
  const xpRafRef = useRef(0);

  useEffect(() => {
    const xp = data?.progression?.xp;
    if (xp == null) return;

    if (!initedXpRef.current) {
      initedXpRef.current = true;
      let stored: number | null = null;
      try {
        const raw = localStorage.getItem('rise_last_xp');
        if (raw != null && raw !== '' && !isNaN(Number(raw))) stored = Number(raw);
      } catch {
        /* ignore */
      }
      lastXpRef.current = stored ?? xp;
    }

    const last = lastXpRef.current ?? xp;
    if (xp > last) {
      setConfetti((n) => n + 1);
      setXpGain((g) => ({ delta: xp - last, nonce: (g?.nonce ?? 0) + 1 }));
      // Count XP up from the old value to the new one.
      setXpBumped(true);
      cancelAnimationFrame(xpRafRef.current);
      const start = performance.now();
      const from = last;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / 1000);
        const eased = 1 - Math.pow(1 - t, 3);
        setDisplayXp(Math.round(from + (xp - from) * eased));
        if (t < 1) xpRafRef.current = requestAnimationFrame(tick);
        else setTimeout(() => setXpBumped(false), 400);
      };
      xpRafRef.current = requestAnimationFrame(tick);
    } else {
      setDisplayXp(xp);
    }

    lastXpRef.current = xp;
    try {
      localStorage.setItem('rise_last_xp', String(xp));
    } catch {
      /* ignore */
    }
  }, [data]);

  // Animate the progress bar filling on each render of the board (a visible "boost"
  // on return). Sets width one frame after data arrives so the CSS transition runs.
  useEffect(() => {
    const pct = data?.progression?.percentToNext;
    if (pct == null) return;
    setBarWidth(0);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setBarWidth(pct)));
    return () => cancelAnimationFrame(id);
  }, [data]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-crwn-gold" />
      </div>
    );
  }

  if (!data || !data.enabled) {
    // Quest Engine dark or unavailable: the slot still earns its keep. The starter-offer
    // card answers "what do I launch, what do I charge, what next" from the artist's own
    // claimed calculator data, and degrades to the old placeholder on any failure.
    return <StarterOfferCard />;
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
  // Infrastructure-ready: the L1-L4 foundation capstone is complete. Distinct from
  // the L10 main-game victory; this marks the handoff from setup to growth.
  const infraReady = data.quests.some(
    (q) => q.template_key === 'artist_infrastructure_ready' && q.status === 'completed',
  );
  const beatGame = data.quests.some((q) => q.template_key === 'artist_beat_rise_mode' && q.status === 'completed');

  const p = data.progression;
  const build = getArtistBuild(data.build.primary);

  // Focus Mode: nothing but the next move. Guided, not caged — one tap back to full.
  if (focus) {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <Confetti trigger={confetti} />
        <QuestCompletionModal events={data.completions} />
        {xpGain && (data.completions?.length ?? 0) === 0 && (
          <XpGainModal key={xpGain.nonce} delta={xpGain.delta} onClose={() => setXpGain(null)} />
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-lg text-crwn-text-secondary">
            Level {p.level} · {p.levelTitle} ·{' '}
            <span className={`text-crwn-gold font-bold inline-block ${xpBumped ? 'crwn-xp-pop' : ''}`}>
              {displayXp} XP
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
      {xpGain && (data.completions?.length ?? 0) === 0 && (
        <XpGainModal key={xpGain.nonce} delta={xpGain.delta} onClose={() => setXpGain(null)} />
      )}
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
              Level {p.level}: {p.levelTitle}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-crwn-text">
              <Zap className="w-5 h-5 text-crwn-gold" />
              <span className={`text-2xl font-bold inline-block ${xpBumped ? 'crwn-xp-pop' : ''}`}>{displayXp}</span>
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
              <div className="h-full bg-crwn-gold rounded-full transition-all duration-700 ease-out" style={{ width: `${barWidth}%` }} />
            </div>
            <div className="text-sm text-crwn-text-secondary mt-1.5">{p.percentToNext}% to next level</div>
          </div>
        )}
      </div>

      {/* Adaptive recap: you already did the work, we caught you up */}
      {data.recap && data.recap.count >= 2 && !recapDismissed && (
        <div className="rounded-2xl border border-crwn-gold/40 bg-crwn-gold/10 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-crwn-gold" />
                <h3 className="text-lg font-bold text-crwn-text">You are ahead of the game</h3>
              </div>
              <p className="text-base text-crwn-text-secondary mt-1.5">
                We scanned your account and recognized {data.recap.count} quest
                {data.recap.count === 1 ? '' : 's'} you already completed
                {data.recap.xpAwarded > 0 ? `, worth ${data.recap.xpAwarded} XP` : ''}. You are starting at Level{' '}
                {data.recap.newLevel}: {data.recap.levelTitle}.
              </p>
              {data.recap.titles.length > 0 && (
                <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                  {data.recap.titles.slice(0, 8).map((t, i) => (
                    <li key={i} className="text-sm text-crwn-text-secondary flex items-center gap-2">
                      <span className="text-crwn-gold">✓</span> {t}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              onClick={() => setRecapDismissed(true)}
              className="text-sm text-crwn-text-secondary hover:text-crwn-gold shrink-0"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Infrastructure-ready handoff: setup is done, growth is next (hidden once the
          full game is beaten, so the two celebrations never stack). */}
      {infraReady && !beatGame && (
        <div className="rounded-2xl border border-crwn-gold/40 bg-crwn-gold/10 p-6">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🚀</span>
            <h2 className="text-xl font-bold text-crwn-text">Your artist infrastructure is ready</h2>
          </div>
          <p className="text-base text-crwn-text-secondary mt-2">
            Credible page, organized catalog, membership ladder, payments, a free path, a paid path, and a welcome are
            all live and tested. The next Rise Mode stage is growth: recruit your founding fans, get your first paid
            supporter, build the first ten, then community, campaigns, and repeatable growth.
          </p>
        </div>
      )}

      {/* Main-game victory — only real, available data */}
      {data.victory && (
        <div className="rounded-2xl border border-crwn-gold/50 bg-gradient-to-br from-crwn-gold/15 to-transparent p-6 text-center">
          <div className="text-4xl mb-2">👑</div>
          <h2 className="text-2xl font-bold text-crwn-text">You Beat Rise Mode</h2>
          <p className="text-lg text-crwn-gold font-semibold mt-1">You built an artist-owned business.</p>
          <div className="mt-5 grid grid-cols-3 sm:grid-cols-6 gap-3">
            {[
              ['Level', data.victory.level],
              ['XP', data.victory.xp],
              ['Tracks', data.victory.tracks],
              ['Supporters', data.victory.supporters],
              ['Campaigns', data.victory.campaigns],
              ['Referrals', data.victory.referrals],
            ].map(([label, val]) => (
              <div key={label} className="rounded-xl border border-crwn-elevated bg-[#1A1A1A] py-3">
                <div className="text-xl font-bold text-crwn-text">{val}</div>
                <div className="text-xs text-crwn-text-secondary">{label}</div>
              </div>
            ))}
          </div>
          <p className="text-sm text-crwn-text-secondary mt-4">
            Empire Mode is unlocked. Keep scaling with repeatable milestones below.
          </p>
        </div>
      )}

      {/* Personalized first mission: generated from the calculator this artist completed. It leads
          the board, above the generic next move. Opens the prefilled builder. Degrades to null. */}
      {data.leadMagnet && (
        <button
          onClick={() => router.push(data.leadMagnet!.href)}
          className="w-full text-left rounded-2xl border border-crwn-gold/40 bg-crwn-gold/10 p-5 hover:bg-crwn-gold/15 transition-colors"
        >
          <div className="text-xs font-bold text-crwn-gold uppercase tracking-wide mb-1">
            Your first mission, from the {data.leadMagnet.toolName}
          </div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-bold text-crwn-text">{data.leadMagnet.title}</span>
            {data.leadMagnet.monthlyValue && (
              <span className="text-base text-crwn-gold font-semibold">{data.leadMagnet.monthlyValue}</span>
            )}
          </div>
          <div className="mt-1 text-sm text-crwn-text-secondary">
            {data.leadMagnet.monthlyValue
              ? `You already saw the number. Until you build this, ${data.leadMagnet.monthlyValue} stays a screenshot, not income.`
              : 'You already did the work in the calculator. This is the one step between the plan and the payout.'}
          </div>
          <div className="mt-2 text-sm font-semibold text-crwn-gold">Start this mission</div>
        </button>
      )}

      {/* Your Next Move — the one dominant, obvious action */}
      {mainQuest ? (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg font-bold text-crwn-gold uppercase tracking-wide">👉 Your next move</span>
          </div>
          <QuestCard quest={mainQuest} variant="hero" onManualComplete={load} />
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
            <QuestCard quest={recommendedQuest} variant="compact" onManualComplete={load} />
          </div>
        </div>
      )}

      {/* Daily Move + Weekly Goal */}
      {(dailyMove || weeklyGoal) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dailyMove && (
            <div>
              <h3 className="text-base font-bold uppercase tracking-wide text-crwn-text-secondary mb-2">Daily Move</h3>
              <QuestCard quest={dailyMove} onManualComplete={load} />
            </div>
          )}
          {weeklyGoal && (
            <div>
              <h3 className="text-base font-bold uppercase tracking-wide text-crwn-text-secondary mb-2">Weekly Goal</h3>
              <QuestCard quest={weeklyGoal} onManualComplete={load} />
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
                  <QuestCard key={q.id} quest={q} variant="compact" onManualComplete={load} />
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

          {/* Royalty Readiness — hidden entirely until its own flag is on */}
          <RoyaltyReadinessCard />

          {/* Broader quest map — opt-in, so the board is never the whole catalog */}
          <div>
            <button
              onClick={() => setShowMap((v) => !v)}
              className="text-base text-crwn-gold hover:underline"
            >
              {showMap ? 'Hide full quest map' : 'Open full quest map'}
            </button>
            {showMap && (
              <div className="mt-3 space-y-2">
                {data.quests
                  .filter((q) => q.status !== 'completed')
                  .map((q) => (
                    <div
                      key={q.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-crwn-elevated bg-[#1A1A1A] px-3 py-2.5"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm text-crwn-text truncate">{q.title}</span>
                        <span className="text-xs text-crwn-text-secondary">
                          {q.quest_type.replace(/_/g, ' ')}
                          {q.status === 'locked' ? ' · locked' : ''}
                        </span>
                      </span>
                      {(q.reward?.xp ?? 0) > 0 && (
                        <span className="text-xs text-crwn-gold shrink-0">+{q.reward?.xp}</span>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Movement Map */}
        <div className="space-y-4">
          <MovementMap role="artist" currentLevel={p.level} />
        </div>
      </div>
    </div>
  );
}

// Simple congrats shown when XP went up but no detailed completion event was in
// the response (e.g. the quest completed on a background load). Confetti fires
// separately. Robust fallback so a real XP gain is never silent.
function XpGainModal({ delta, onClose }: { delta: number; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
      <div
        className="relative w-full max-w-sm rounded-2xl border border-crwn-gold/30 bg-[#1A1A1A] p-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-5xl mb-2">🎉</div>
        <div className="text-sm font-bold uppercase tracking-widest text-crwn-gold">Nice work</div>
        <h2 className="text-2xl font-bold text-crwn-text mt-2">You made progress</h2>
        <div className="mt-4 flex items-center justify-center gap-2 text-crwn-text">
          <Zap className="w-5 h-5 text-crwn-gold" />
          <span className="text-2xl font-bold">+{delta} XP</span>
        </div>
        <button onClick={onClose} className="neu-button-accent px-7 py-3 rounded-full font-bold text-lg mt-6">
          Keep rising
        </button>
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
        body: 'Your campaign is live. Give supporters one clear action (share, clip, or invite) and watch it move.',
        cta: 'Create a fan mission →',
        href: '/missions/new',
      }
    : {
        title: 'Launch a campaign',
        body: "You've built the foundation. Now give your supporters a goal to rally behind. A Road To campaign turns quiet fans into active backers.",
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
