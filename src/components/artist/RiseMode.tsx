'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { QuestInstance, CompletionEvent } from '@/lib/quests/types';
import { ArtistBuildPicker } from '@/components/quests/ArtistBuildPicker';
import { QuestCard } from '@/components/quests/QuestCard';
import { MovementMap } from '@/components/quests/MovementMap';
import { QuestCompletionModal } from '@/components/quests/QuestCompletionModal';
import { LiveQuestLauncher } from '@/components/quests/LiveQuestLauncher';
import { getArtistBuild } from '@/lib/quests/builds';
import { Flame, Zap, Loader2, Trophy, Sparkles } from 'lucide-react';

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

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/quests', { cache: 'no-store' });
      const json = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
        <div className="text-4xl mb-3">👑</div>
        <h2 className="text-xl font-bold text-crwn-text">Rise Mode is on its way</h2>
        <p className="text-crwn-text-secondary mt-2">
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

  const p = data.progression;
  const build = getArtistBuild(data.build.primary);

  // Focus Mode: nothing but the next move. Guided, not caged — one tap back to full.
  if (focus) {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <QuestCompletionModal events={data.completions} />
        <div className="flex items-center justify-between">
          <span className="text-sm text-crwn-text-secondary">
            Level {p.level} · {p.levelTitle} · <span className="text-crwn-gold font-semibold">{p.xp} XP</span>
          </span>
          <button onClick={() => setFocusMode(false)} className="text-xs text-crwn-gold hover:underline">
            Show full dashboard
          </button>
        </div>
        {mainQuest ? (
          <div>
            <div className="text-sm font-bold text-crwn-gold uppercase tracking-wide mb-2">👉 Your next move</div>
            <QuestCard quest={mainQuest} variant="hero" />
          </div>
        ) : (
          <div className="rounded-2xl border border-crwn-gold/30 bg-[#1A1A1A] p-6 text-center">
            <Trophy className="w-6 h-6 text-crwn-gold mx-auto mb-2" />
            <p className="text-crwn-text font-bold text-lg">You've cleared the essentials 🎉</p>
            <button
              onClick={() => setFocusMode(false)}
              className="neu-button-accent px-6 py-2.5 rounded-full font-semibold text-sm mt-4"
            >
              See growth moves
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <QuestCompletionModal events={data.completions} />
      {/* Progression header */}
      <div className="rounded-2xl border border-[#2A2A2A] bg-[#1A1A1A] p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-widest text-crwn-gold uppercase">Rise Mode</span>
              {build && (
                <span className="text-xs text-crwn-text-secondary">· {build.emoji} {build.title}</span>
              )}
            </div>
            <h2 className="text-2xl font-bold text-crwn-text mt-1">
              Level {p.level} — {p.levelTitle}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-crwn-text">
              <Zap className="w-4 h-4 text-crwn-gold" />
              <span className="font-bold">{p.xp}</span>
              <span className="text-xs text-crwn-text-secondary">XP</span>
            </div>
            {p.streak > 0 && (
              <div className="flex items-center gap-1.5 text-crwn-text">
                <Flame className="w-4 h-4 text-orange-400" />
                <span className="font-bold">{p.streak}</span>
                <span className="text-xs text-crwn-text-secondary">day streak</span>
              </div>
            )}
            <button
              onClick={() => setFocusMode(true)}
              className="text-xs text-crwn-text-secondary hover:text-crwn-gold border border-[#2A2A2A] rounded-full px-3 py-1"
            >
              Focus
            </button>
          </div>
        </div>
        {!p.isMax && (
          <div className="mt-4">
            <div className="h-2 rounded-full bg-[#2A2A2A] overflow-hidden">
              <div className="h-full bg-crwn-gold rounded-full transition-all" style={{ width: `${p.percentToNext}%` }} />
            </div>
            <div className="text-[11px] text-crwn-text-secondary mt-1">{p.percentToNext}% to next level</div>
          </div>
        )}
      </div>

      {/* Your Next Move — the one dominant, obvious action */}
      {mainQuest ? (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-bold text-crwn-gold uppercase tracking-wide">👉 Your next move</span>
          </div>
          <QuestCard quest={mainQuest} variant="hero" />
        </div>
      ) : (
        <div className="rounded-2xl border border-crwn-gold/30 bg-[#1A1A1A] p-6">
          <div className="text-center mb-4">
            <Trophy className="w-6 h-6 text-crwn-gold mx-auto mb-2" />
            <p className="text-crwn-text font-bold text-lg">You've cleared the essentials 🎉</p>
            <p className="text-crwn-text-secondary text-sm mt-1">Here's how to keep your movement growing.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              onClick={() => router.push('/campaigns/new')}
              className="neu-button-accent py-3 rounded-full font-semibold text-sm"
            >
              Launch a campaign
            </button>
            <button
              onClick={() => router.push('/missions/new')}
              className="py-3 rounded-full font-semibold text-sm border border-[#2A2A2A] text-crwn-text hover:border-crwn-gold/40"
            >
              Create a fan mission
            </button>
            <button
              onClick={() => router.push('/profile/artist?tab=livestreams')}
              className="py-3 rounded-full font-semibold text-sm border border-[#2A2A2A] text-crwn-text hover:border-crwn-gold/40"
            >
              Go live
            </button>
          </div>
        </div>
      )}

      {/* AI Recommended Quest */}
      {recommendedQuest && data.recommended && recommendedQuest.id !== mainQuest?.id && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-crwn-text-secondary mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-crwn-gold" /> AI Recommended
          </h3>
          <div className="rounded-2xl border border-crwn-gold/30 bg-[#1A1A1A] p-4">
            <p className="text-sm text-crwn-text-secondary italic mb-3">“{data.recommended.reason}”</p>
            <QuestCard quest={recommendedQuest} variant="compact" />
          </div>
        </div>
      )}

      {/* Daily Move + Weekly Goal */}
      {(dailyMove || weeklyGoal) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dailyMove && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-crwn-text-secondary mb-2">Daily Move</h3>
              <QuestCard quest={dailyMove} />
            </div>
          )}
          {weeklyGoal && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-crwn-text-secondary mb-2">Weekly Goal</h3>
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
              <h3 className="text-xs font-semibold uppercase tracking-wide text-crwn-text-secondary mb-2">Side Quests</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {sideQuests.slice(0, 6).map((q) => (
                  <QuestCard key={q.id} quest={q} variant="compact" />
                ))}
              </div>
            </div>
          )}

          {rewardsClose.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-crwn-text-secondary mb-2">
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
              <h3 className="text-xs font-semibold uppercase tracking-wide text-crwn-text-secondary mb-2">
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

        {/* Movement Map + Live Quest CTA */}
        <div className="space-y-4">
          <MovementMap role="artist" currentLevel={p.level} />
          <LiveQuestLauncher />
        </div>
      </div>
    </div>
  );
}
