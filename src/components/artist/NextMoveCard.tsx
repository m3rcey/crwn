'use client';

// NextMoveCard — the whole primary Rise Mode surface.
//
// It replaced three stacked cards (ConstraintCard, RoadmapCard, StrategyCard) that each carried
// their own heading, their own evidence and their own button. CRWN had already decided which one
// mattered; the interface then asked the artist to decide again, which is CRWN's internal
// architecture leaking into the product.
//
// This component holds NO business rule. Everything it renders arrives resolved from
// `resolveRiseNextMove`, which itself only reads back what the Constraint Engine and the Roadmap
// already returned. There is exactly one gold control on this surface, and it is the CTA below.

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';
import type { ArtistRoadmap } from '@/lib/artistRoadmap';
import type { RiseNextMove } from '@/lib/riseNextMove';
import { FullRoadmap } from '@/components/artist/FullRoadmap';

export function NextMoveCard({
  next,
  roadmap,
}: {
  next: RiseNextMove;
  roadmap: ArtistRoadmap | null;
}) {
  const [showRoadmap, setShowRoadmap] = useState(false);

  return (
    <section aria-labelledby="rise-next-move-heading" data-tour="next-move">
      {/* Where am I. Discrete milestones, because "68%" is precision the model does not have. */}
      {next.stageTitle && (
        <p className="text-[11px] uppercase tracking-wide text-crwn-text-secondary mb-3">
          {next.stageTitle}
          {next.stageProgress ? ` · ${next.stageProgress}` : ''}
        </p>
      )}

      {next.launchNote && (
        <p className="text-xs text-crwn-text-secondary mb-3">{next.launchNote}</p>
      )}

      {next.move ? (
        <div className="neu-raised rounded-2xl p-6 border border-crwn-gold/40">
          <p className="text-[11px] uppercase tracking-wide text-crwn-gold">Your next move</p>
          <h2 id="rise-next-move-heading" className="text-2xl font-bold text-crwn-text mt-1.5">
            {next.move.title}
          </h2>
          <p className="text-sm text-crwn-text-secondary mt-2 leading-relaxed">{next.move.reason}</p>

          {/* The fact, once. Never repeated in the heading, the body and a bullet. */}
          {next.move.fact && (
            <p className="text-xs text-crwn-text-secondary mt-3">{next.move.fact}</p>
          )}

          <Link
            prefetch
            href={next.move.href}
            className="inline-flex items-center gap-2 mt-5 bg-crwn-gold text-crwn-bg text-sm font-semibold px-6 py-2.5 rounded-full hover:bg-crwn-gold/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-crwn-gold focus-visible:ring-offset-2 focus-visible:ring-offset-crwn-bg transition-colors"
          >
            {next.move.ctaLabel}
            <ArrowRight className="w-4 h-4" />
          </Link>

          {/* A line, never a second CTA: the artist should know a path exists without
              being asked to choose between two of them. */}
          {next.afterThis && (
            <p className="text-xs text-crwn-text-secondary mt-4">
              After this: <span className="text-crwn-text">{next.afterThis}</span>
            </p>
          )}
        </div>
      ) : (
        <div className="neu-raised rounded-2xl p-6">
          <h2 id="rise-next-move-heading" className="text-xl font-bold text-crwn-text">
            {next.allComplete ? 'Every stage is complete.' : 'Nothing is waiting on you right now.'}
          </h2>
          <p className="text-sm text-crwn-text-secondary mt-2">
            {next.allComplete
              ? 'The system is built and delivering. Keep your promises and keep inviting.'
              : 'CRWN will name the next move as soon as your numbers say what it should be.'}
          </p>
        </div>
      )}

      {roadmap && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowRoadmap((v) => !v)}
            aria-expanded={showRoadmap}
            aria-controls="rise-full-roadmap"
            className="inline-flex items-center gap-1 text-xs text-crwn-gold hover:underline"
          >
            {showRoadmap ? 'Hide the full roadmap' : 'View full roadmap'}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showRoadmap ? 'rotate-180' : ''}`} />
          </button>
          {showRoadmap && (
            <div id="rise-full-roadmap" className="mt-3">
              <FullRoadmap roadmap={roadmap} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
