'use client';

// ConstraintCard — the one corrective action, above the roadmap on Rise Mode.
//
// It renders ONLY when the deterministic engine diagnosed something with enough evidence.
// Loading, error, insufficient evidence and "nothing is blocking you" all render nothing at
// all, which leaves today's experience exactly as it was. That is deliberate: the roadmap is
// the artist's map, and an empty state here would be a worse version of it.
//
// No charts, no metric grid, no second recommendation. One constraint, the evidence for it,
// one action. The evidence is shown so an artist can DISAGREE with the diagnosis, which is the
// difference between coaching someone and managing them.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import type { ConstraintResult } from '@/lib/constraint/types';
import { decideNextAction, confidenceLabel } from '@/lib/constraint/presentation';

export function ConstraintCard() {
  const [result, setResult] = useState<ConstraintResult | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/artist/constraint')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!active) return;
        setResult(j?.constraint ?? null);
      })
      .catch(() => {
        // Silent: the roadmap below is unaffected.
      });
    return () => {
      active = false;
    };
  }, []);

  const decision = decideNextAction(result);
  if (!decision.showConstraintCard || !decision.constraint) return null;

  const c = decision.constraint;

  return (
    <div className="neu-raised rounded-2xl p-5 mb-6 border border-crwn-gold/40" data-tour="constraint">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-4 h-4 text-crwn-gold shrink-0" />
        <p className="text-[11px] uppercase tracking-wide text-crwn-text-secondary">
          What is holding you back
        </p>
      </div>

      <h3 className="font-bold text-crwn-text">{c.title}</h3>
      <p className="text-xs text-crwn-text-secondary mt-1">{c.explanation}</p>

      <ul className="mt-3 space-y-1.5">
        {c.evidence.map((e, i) => (
          <li key={`${e.metric}:${i}`} className="flex items-start gap-2 text-xs text-crwn-text">
            <span className="mt-1.5 w-1 h-1 rounded-full bg-crwn-gold shrink-0" />
            {e.label}
          </li>
        ))}
      </ul>

      <div className="mt-4 border border-crwn-gold/40 bg-crwn-gold/5 rounded-xl p-4">
        <p className="font-semibold text-crwn-text">{c.action.label}</p>
        <p className="text-xs text-crwn-text-secondary mt-1">{c.action.why}</p>
        <Link
          prefetch
          href={c.action.href}
          className="inline-flex items-center gap-2 mt-3 bg-crwn-gold text-crwn-bg text-sm font-semibold px-5 py-2 rounded-full hover:bg-crwn-gold/90 transition-colors"
        >
          Do it now
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <p className="text-[10px] text-crwn-text-secondary mt-3">
        {confidenceLabel(c.confidence)}. Based on your own numbers, not an estimate.
      </p>
    </div>
  );
}
