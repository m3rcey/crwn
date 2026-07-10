'use client';

import { useEffect, useState } from 'react';
import type { CompletionEvent } from '@/lib/quests/types';
import { Zap, Trophy, ArrowUp, Sparkles, Share2, X } from 'lucide-react';

// One data-driven celebration modal covering all completion variants (Quest
// Complete / Milestone Passed / Level Up / Boss / Feature Unlocked / Proof Card).
// Fed the `completions` array from /api/quests; shows them one at a time.

function prettify(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Variant {
  banner: string;
  icon: React.ReactNode;
  accent: string;
}

function variantFor(e: CompletionEvent): Variant {
  if (e.leveledUp)
    return { banner: 'Level Up', icon: <ArrowUp className="w-8 h-8" />, accent: 'text-crwn-gold' };
  if (e.questType === 'live_quest')
    return { banner: 'Live Quest Complete', icon: <Sparkles className="w-8 h-8" />, accent: 'text-crwn-gold' };
  if (e.questType === 'boss_quest' || e.difficulty === 'boss')
    return { banner: 'Milestone Passed', icon: <Trophy className="w-8 h-8" />, accent: 'text-crwn-gold' };
  return { banner: 'Quest Complete', icon: <Trophy className="w-8 h-8" />, accent: 'text-emerald-400' };
}

export function QuestCompletionModal({
  events,
  onDismiss,
}: {
  events: CompletionEvent[];
  onDismiss?: () => void;
}) {
  const [queue, setQueue] = useState<CompletionEvent[]>([]);
  const [i, setI] = useState(0);

  // Enqueue whenever a fresh batch arrives (dedupe by questId).
  useEffect(() => {
    if (!events?.length) return;
    setQueue((prev) => {
      const seen = new Set(prev.map((e) => e.questId));
      const fresh = events.filter((e) => !seen.has(e.questId));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
  }, [events]);

  if (i >= queue.length || queue.length === 0) return null;

  const e = queue[i];
  const v = variantFor(e);
  const last = i >= queue.length - 1;

  function next() {
    if (last) {
      setQueue([]);
      setI(0);
      onDismiss?.();
    } else {
      setI((n) => n + 1);
    }
  }

  async function share() {
    const text = `I just ${e.leveledUp ? `reached ${e.levelTitle}` : `completed "${e.title}"`} on CRWN 👑`;
    try {
      if (navigator.share) await navigator.share({ text });
      else await navigator.clipboard.writeText(text);
    } catch {
      /* user cancelled */
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4" onClick={next}>
      <div
        className="relative w-full max-w-sm rounded-2xl border border-crwn-gold/30 bg-[#1A1A1A] p-6 text-center"
        onClick={(ev) => ev.stopPropagation()}
      >
        <button onClick={next} className="absolute top-3 right-3 text-crwn-text-secondary hover:text-crwn-text">
          <X className="w-4 h-4" />
        </button>

        <div className={`mx-auto mb-3 flex items-center justify-center ${v.accent}`}>{v.icon}</div>
        <div className="text-[11px] font-semibold uppercase tracking-widest text-crwn-gold">{v.banner}</div>
        <h2 className="text-xl font-bold text-crwn-text mt-1">
          {e.leveledUp ? e.levelTitle : e.title}
        </h2>

        {/* Rewards */}
        <div className="mt-4 space-y-2 text-sm">
          {e.xpAwarded > 0 && (
            <div className="flex items-center justify-center gap-1.5 text-crwn-text">
              <Zap className="w-4 h-4 text-crwn-gold" />
              <span className="font-semibold">+{e.xpAwarded} XP</span>
            </div>
          )}
          {e.badges.length > 0 && (
            <div className="text-crwn-text-secondary">
              Badge earned: <span className="text-crwn-text font-medium">{e.badges.map(prettify).join(', ')}</span>
            </div>
          )}
          {e.unlocked.length > 0 && (
            <div className="text-crwn-text-secondary">
              Unlocked: <span className="text-crwn-text font-medium">{e.unlocked.map(prettify).join(', ')}</span>
            </div>
          )}
          {e.proofCard && <div className="text-crwn-text-secondary">Proof card created 🧾</div>}
        </div>

        <div className="mt-6 flex items-center justify-center gap-2">
          {(e.proofCard || e.leveledUp) && (
            <button
              onClick={share}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#2A2A2A] text-sm text-crwn-text hover:border-crwn-gold/40"
            >
              <Share2 className="w-4 h-4" /> Share
            </button>
          )}
          <button onClick={next} className="neu-button-accent px-6 py-2 rounded-full font-semibold">
            {last ? 'Continue' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
