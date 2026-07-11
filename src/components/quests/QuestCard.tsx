'use client';

import { useState } from 'react';
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

// One quest card. `variant='hero'` is the big Main Quest treatment; `compact` is
// used in grids. Text is sized to the app's readable scale (lg/xl body, 2xl hero).
export function QuestCard({
  quest,
  variant = 'default',
  ctaHref,
  onManualComplete,
}: {
  quest: QuestInstance;
  variant?: 'hero' | 'default' | 'compact';
  ctaHref?: string;
  onManualComplete?: () => void;
}) {
  const router = useRouter();
  const done = quest.status === 'completed';
  const cta = questCta(quest);
  const href = ctaHref || cta.href;
  const xp = quest.reward?.xp ?? 0;
  const isHero = variant === 'hero';
  // Coaching quests (no product signal) complete via the guarded manual route, which
  // server-side refuses anything that is not kind:'manual' (financial/supporter
  // milestones stay authoritative). XP is granted idempotently.
  const isManual = quest.completion_condition?.kind === 'manual';
  const [submitting, setSubmitting] = useState(false);

  const markDone = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await fetch('/api/quests/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questId: quest.id }),
      });
      onManualComplete?.();
    } catch {
      /* ignore — a failed mark can be retried */
    } finally {
      setSubmitting(false);
    }
  };

  const nextStep = (quest.steps || [])[quest.current_step]?.title;

  return (
    <div
      className={`rounded-2xl border bg-[#1A1A1A] ${
        done ? 'border-emerald-500/30' : isHero ? 'border-crwn-gold/40' : 'border-[#2A2A2A]'
      } ${isHero ? 'p-6' : 'p-5'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            {done ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <Circle className="w-5 h-5 text-crwn-text-secondary shrink-0" />
            )}
            <span className={`text-sm uppercase tracking-wide font-bold ${DIFF_COLOR[quest.difficulty] || 'text-crwn-text-secondary'}`}>
              {quest.quest_type.replace(/_/g, ' ')}
            </span>
            {quest.estimated_time && (
              <span className="text-sm text-crwn-text-secondary/70">· {quest.estimated_time}</span>
            )}
          </div>
          <h3 className={`font-bold text-crwn-text ${isHero ? 'text-2xl' : 'text-lg'}`}>{quest.title}</h3>
          {quest.subtitle && <p className="text-base text-crwn-text-secondary mt-1">{quest.subtitle}</p>}
        </div>
        {xp > 0 && (
          <span className="shrink-0 inline-flex items-center gap-1 text-base font-bold text-crwn-gold bg-crwn-gold/10 rounded-full px-3 py-1.5">
            <Zap className="w-4 h-4" />+{xp}
          </span>
        )}
      </div>

      {isHero && quest.why_it_matters && (
        <p className="text-lg text-crwn-text-secondary mt-4 leading-relaxed">{quest.why_it_matters}</p>
      )}

      {/* Inline "how" — the concrete steps, current one highlighted */}
      {isHero && (quest.steps?.length ?? 0) > 0 && !done && (
        <div className="mt-5">
          <div className="text-sm font-bold uppercase tracking-wide text-crwn-text-secondary mb-3">How</div>
          <ol className="space-y-2.5">
            {quest.steps.map((s, idx) => (
              <li key={idx} className="flex items-center gap-3 text-lg">
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                    idx < quest.current_step
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : idx === quest.current_step
                      ? 'bg-crwn-gold text-black'
                      : 'bg-[#2A2A2A] text-crwn-text-secondary'
                  }`}
                >
                  {idx + 1}
                </span>
                <span className={idx === quest.current_step ? 'text-crwn-text font-semibold' : 'text-crwn-text-secondary'}>
                  {s.title}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {isHero && nextStep && !done && (quest.steps?.length ?? 0) === 0 && (
        <div className="mt-4 text-lg">
          <span className="text-crwn-text-secondary">Next step: </span>
          <span className="text-crwn-text font-semibold">{nextStep}</span>
        </div>
      )}

      {quest.progress_percent > 0 && !done && (
        <div className="mt-4">
          <div className="h-2 rounded-full bg-[#2A2A2A] overflow-hidden">
            <div className="h-full bg-crwn-gold rounded-full transition-all" style={{ width: `${quest.progress_percent}%` }} />
          </div>
          <div className="text-sm text-crwn-text-secondary mt-1.5">{quest.progress_percent}%</div>
        </div>
      )}

      {!done && isManual ? (
        <div className={isHero ? 'mt-6 space-y-2' : 'mt-4 flex items-center gap-4'}>
          <button
            onClick={markDone}
            disabled={submitting}
            className={`rounded-full font-bold disabled:opacity-50 ${
              isHero ? 'neu-button-accent w-full py-4 text-lg' : 'text-base text-crwn-gold hover:underline'
            }`}
          >
            {submitting ? 'Saving...' : 'Mark as done'}
          </button>
          {href && href !== '/home' && (
            <button
              onClick={() => router.push(href)}
              className={`text-base text-crwn-text-secondary hover:text-crwn-gold ${isHero ? 'block' : ''}`}
            >
              {cta.label} →
            </button>
          )}
        </div>
      ) : (
        !done &&
        href && (
          <button
            onClick={() => router.push(href)}
            className={`rounded-full font-bold ${
              isHero ? 'neu-button-accent w-full mt-6 py-4 text-lg' : 'mt-4 text-base text-crwn-gold hover:underline'
            }`}
          >
            {cta.label} →
          </button>
        )
      )}

      {done && <div className="mt-3 text-base font-bold text-emerald-400">Completed</div>}
    </div>
  );
}
