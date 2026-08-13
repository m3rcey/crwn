'use client';

// The First Paid Member Guarantee checklist card (First Revenue Launch cohort,
// 2026-08-06). Renders NOTHING unless the artist is in the cohort
// (artist_profiles.launch_partner, flipped by the founder, served by
// /api/artist/launch-partner). For cohort artists it makes the guarantee's
// conditions visible and live: what is met, what is open, and where to do it.
// Both sides see the same evidence, which is what makes the guarantee real.
//
// COLLAPSED BY DEFAULT since 2026-08-13. It used to render seven conditions open on Rise Mode,
// six of them carrying their own "Do it" link, under its own "Next: ..." recommendation. Having
// no gold button did not stop that from being a second instruction: it was a second task list
// with a second priority. And it was a DUPLICATE one, because six of the seven conditions are
// evaluated by the very same DomainChecks as roadmap steps (stripe, free tier, purchasable tier,
// welcome post, campaign sent, first paid member), and the seventh is the contacts import at a
// higher threshold. The roadmap already walks the artist through all of it.
//
// What survives on first paint is the part the roadmap does NOT own and the offer requires: the
// contract status, measured, in one line. The evidence stays one tap away, which is what
// "both sides see the same evidence" needs; it does not need to be permanently open.
// See docs/crwn-brain/20-FIRST-REVENUE-LAUNCH-OFFER.md.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, ShieldCheck } from 'lucide-react';
import type { LaunchPartnerChecklist as Checklist } from '@/lib/launchPartner';

interface Response {
  enabled: boolean;
  checklist?: Checklist;
}

export function LaunchPartnerChecklist() {
  const [data, setData] = useState<Checklist | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/artist/launch-partner')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Response | null) => {
        if (active && j?.enabled && j.checklist) setData(j.checklist);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!data) return null;

  const statusCopy =
    data.status === 'achieved'
      ? 'Achieved. Your first paid member is in.'
      : data.status === 'eligible'
        ? 'Active. Every required step is done; the guarantee stands.'
        : `${data.requiredDone} of ${data.requiredTotal} required steps done. The guarantee activates when all of them are.`;

  return (
    <div className="neu-raised rounded-2xl p-5">
      <p className="text-[11px] uppercase tracking-wide text-crwn-text-secondary flex items-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-crwn-gold" />
        First Paid Member Guarantee
      </p>
      <p className="text-sm text-crwn-text mt-1.5">{statusCopy}</p>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="launch-partner-conditions"
        className="mt-2 inline-flex items-center gap-1 text-xs text-crwn-gold hover:underline"
      >
        {expanded ? 'Hide what it covers' : 'See what it covers'}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
      <ul id="launch-partner-conditions" className="mt-3 space-y-2">
        {data.conditions.map((c) => (
          <li key={c.key} className="flex items-start gap-2.5 text-sm">
            <span
              className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                c.done ? 'bg-crwn-gold border-crwn-gold text-crwn-bg' : 'border-crwn-elevated'
              }`}
            >
              {c.done && <Check className="w-3 h-3" />}
            </span>
            <span className={c.done ? 'text-crwn-text' : 'text-crwn-text-secondary'}>
              {c.label}
              {!c.done && c.target > 1 && (
                <span className="text-xs text-crwn-text-secondary"> ({c.current.toLocaleString()} of {c.target.toLocaleString()})</span>
              )}
              {!c.done && (
                <Link prefetch href={c.href} className="ml-2 text-crwn-gold hover:underline text-xs">
                  Do it
                </Link>
              )}
              {!c.done && <span className="block text-xs text-crwn-text-secondary/80">{c.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
      )}

      {/* The old "Next: <first open condition>" line is gone. It was a second recommendation on a
          screen whose entire job is to carry one, and it never said anything the list above it did
          not already say in the same order. `nextCondition` is untouched in the pure brain and is
          still what the admin Money Model view reads. */}
    </div>
  );
}
