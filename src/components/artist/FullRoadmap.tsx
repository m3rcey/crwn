'use client';

// FullRoadmap — the five stages, behind the "View full roadmap" disclosure on Rise Mode.
//
// This is the ESCAPE HATCH, not the execution surface. It carries no primary button: the one
// action lives in NextMoveCard, and an artist who opens this is orienting, not deciding. Each
// open step is still a link, because a map you cannot walk from is a poster.
//
// Lifted out of the old RoadmapCard, minus everything that was competing rather than
// orienting: the whole-roadmap percentage and its bar, the member/paying/monthly stat tiles,
// the upcoming-promises list (the Promise Calendar owns that) and the gold "Do it now".
// The data still exists on /api/artist/roadmap and in those surfaces; it simply is not a
// next move, so it is not on the surface that answers "what do I do next".

import Link from 'next/link';
import { Check } from 'lucide-react';
import type { ArtistRoadmap } from '@/lib/artistRoadmap';
import { withReturnTo } from '@/lib/constraint/presentation';

export function FullRoadmap({ roadmap }: { roadmap: ArtistRoadmap }) {
  return (
    <div className="space-y-3" data-tour="roadmap">
      {roadmap.stages.map((s, i) => (
        <div
          key={s.key}
          className={`rounded-xl border p-3 ${
            i === roadmap.currentStageIndex ? 'border-crwn-gold/40' : 'border-crwn-elevated'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className={`text-sm font-semibold ${s.done ? 'text-crwn-text-secondary' : 'text-crwn-text'}`}>
              {i + 1}. {s.title}
            </h3>
            <span className="text-[11px] text-crwn-text-secondary shrink-0">
              {s.doneCount}/{s.total}
            </span>
          </div>
          <ul className="mt-2 space-y-1.5">
            {s.steps.map((step) => (
              <li key={step.key} className="flex items-start gap-2 text-xs">
                <span
                  className={`mt-0.5 w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                    step.done ? 'bg-crwn-gold border-crwn-gold text-crwn-bg' : 'border-crwn-elevated'
                  }`}
                  aria-hidden="true"
                >
                  {step.done && <Check className="w-2.5 h-2.5" />}
                </span>
                {step.done ? (
                  <span className="text-crwn-text-secondary line-through decoration-crwn-text-secondary/40">
                    {step.label}
                  </span>
                ) : (
                  <Link prefetch href={withReturnTo(step.href)} className="text-crwn-text hover:text-crwn-gold transition-colors">
                    {step.label}
                    {step.target > 1 && (
                      <span className="text-crwn-text-secondary">
                        {` (${Math.min(step.current, step.target)}/${step.target})`}
                      </span>
                    )}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
