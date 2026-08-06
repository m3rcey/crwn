'use client';

// The First Paid Member Guarantee checklist card (First Revenue Launch cohort,
// 2026-08-06). Renders NOTHING unless the artist is in the cohort
// (artist_profiles.launch_partner, flipped by the founder, served by
// /api/artist/launch-partner). For cohort artists it makes the guarantee's
// conditions visible and live: what is met, what is open, and where to do it.
// Both sides see the same evidence, which is what makes the guarantee real.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ShieldCheck } from 'lucide-react';
import type { LaunchPartnerChecklist as Checklist } from '@/lib/launchPartner';

interface Response {
  enabled: boolean;
  checklist?: Checklist;
}

export function LaunchPartnerChecklist() {
  const [data, setData] = useState<Checklist | null>(null);

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
    <div className="neu-raised rounded-2xl p-5 mb-6">
      <p className="text-[11px] uppercase tracking-wide text-crwn-text-secondary flex items-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-crwn-gold" />
        First Paid Member Guarantee
      </p>
      <p className="text-sm text-crwn-text mt-1.5">{statusCopy}</p>

      <ul className="mt-3 space-y-2">
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

      {data.status === 'pending' && data.nextCondition && (
        <p className="text-xs text-crwn-text-secondary mt-3">
          Next: {data.nextCondition.label}. Every open step above is a step your launch is not protected on.
        </p>
      )}
    </div>
  );
}
