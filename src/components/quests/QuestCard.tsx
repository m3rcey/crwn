'use client';

import { useRouter } from 'next/navigation';
import type { QuestInstance } from '@/lib/quests/types';
import { questCta } from './questRoutes';
import { CheckCircle2, Circle, Zap } from 'lucide-react';

const DIFF_COLOR: Record<string, string> = {
  easy: 'text-emerald-400',
  medium: 'text-crwn-gold',
  hard: 'text-orange-400',
  boss: 'text-red-400',
};

// One quest, rendered as a card. `variant='hero'` is the big Main Quest treatment;
// `compact` is used in side-quest grids. Progress + reward come straight off the
// server-evaluated instance — the client never asserts completion.
export function QuestCard({
  quest,
  variant = 'default',
  ctaHref,
}: {
  quest: QuestInstance;
  variant?: 'hero' | 'default' | 'compact';
  ctaHref?: string; // override (e.g. fan quests needing the artist slug)
}) {
  const router = useRouter();
  const done = quest.status === 'completed';
  const cta = questCta(quest);
  const href = ctaHref || cta.href;
  const xp = quest.reward?.xp ?? 0;
  const isHero = variant === 'hero';

  const nextStep = (quest.steps || [])[quest.current_step]?.title;

  return (
    <div
      className={`rounded-2xl border bg-[#1A1A1A] ${
        done ? 'border-emerald-500/30' : isHero ? 'border-crwn-gold/40' : 'border-[#2A2A2A]'
      } ${isHero ? 'p-6' : 'p-4'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {done ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <Circle className="w-4 h-4 text-crwn-text-secondary shrink-0" />
            )}
            <span className={`text-[10px] uppercase tracking-wide font-semibold ${DIFF_COLOR[quest.difficulty] || 'text-crwn-text-secondary'}`}>
              {quest.quest_type.replace(/_/g, ' ')}
            </span>
            {quest.estimated_time && (
              <span className="text-[10px] text-crwn-text-secondary/60">· {quest.estimated_time}</span>
            )}
          </div>
          <h3 className={`font-bold text-crwn-text ${isHero ? 'text-xl' : 'text-base'} truncate`}>
            {quest.title}
          </h3>
          {quest.subtitle && <p className="text-sm text-crwn-text-secondary mt-0.5">{quest.subtitle}</p>}
        </div>
        {xp > 0 && (
          <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-crwn-gold bg-crwn-gold/10 rounded-full px-2.5 py-1">
            <Zap className="w-3 h-3" />+{xp}
          </span>
        )}
      </div>

      {isHero && quest.why_it_matters && (
        <p className="text-sm text-crwn-text-secondary mt-3 leading-relaxed">{quest.why_it_matters}</p>
      )}

      {isHero && nextStep && !done && (
        <div className="mt-3 text-sm">
          <span className="text-crwn-text-secondary">Next step: </span>
          <span className="text-crwn-text font-medium">{nextStep}</span>
        </div>
      )}

      {quest.progress_percent > 0 && !done && (
        <div className="mt-3">
          <div className="h-1.5 rounded-full bg-[#2A2A2A] overflow-hidden">
            <div className="h-full bg-crwn-gold rounded-full transition-all" style={{ width: `${quest.progress_percent}%` }} />
          </div>
          <div className="text-[11px] text-crwn-text-secondary mt-1">{quest.progress_percent}%</div>
        </div>
      )}

      {!done && href && (
        <button
          onClick={() => router.push(href)}
          className={`rounded-full font-semibold ${
            isHero
              ? 'neu-button-accent w-full mt-5 py-3.5 text-base'
              : 'mt-4 text-sm text-crwn-gold hover:underline'
          }`}
        >
          {cta.label} →
        </button>
      )}

      {done && <div className="mt-3 text-xs font-semibold text-emerald-400">Completed</div>}
    </div>
  );
}
