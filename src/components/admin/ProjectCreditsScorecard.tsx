'use client';

// The project-credits verdict on /admin (Money Model tab). Same numbers and same pre-committed rules
// as scripts/project-credits.mjs, from one function (loadCreditsScorecards), so nothing here needs a
// terminal. Read-only.

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Scorecard {
  artistSlug: string;
  albumTitle: string;
  path: string;
  verdict: { key: string; headline: string; next: string };
  lines: string[];
}

export default function ProjectCreditsScorecard() {
  const [state, setState] = useState<{ applied: boolean; scorecards: Scorecard[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch('/api/admin/project-credits', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setState)
      .catch(() => setFailed(true));
  }, []);

  return (
    <section className="mb-8 rounded-2xl bg-[#1A1A1A] p-5">
      <h2 className="text-lg font-semibold text-white">Project credits</h2>
      <p className="mt-1 text-xs text-white/50">
        Verdict rules were fixed before any traffic. No verdict until 50 people have seen the Founding offer.
      </p>
      {failed && <p className="mt-4 text-sm text-red-400">Could not load the scorecard.</p>}
      {!failed && !state && <p className="mt-4 text-sm text-white/50">Loading</p>}
      {state && !state.applied && (
        <p className="mt-4 text-sm text-white/70">Waiting on the project credits migration. Nothing is on sale yet.</p>
      )}
      {state?.applied && state.scorecards.length === 0 && (
        <p className="mt-4 text-sm text-white/70">No project sells credits yet.</p>
      )}
      {state?.scorecards.map((c) => (
        <div key={c.path} className="mt-5 border-t border-white/5 pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-semibold text-white">{`${c.albumTitle} (${c.artistSlug})`}</p>
            <Link href={c.path} prefetch className="text-sm text-[#D4AF37]">
              Open the page
            </Link>
          </div>
          <p className="mt-2 text-sm font-semibold text-[#D4AF37]">{c.verdict.headline}</p>
          <p className="mt-1 text-sm text-white/70">{c.verdict.next}</p>
          <pre className="mt-3 overflow-x-auto whitespace-pre text-xs leading-relaxed text-white/60">{c.lines.join('\n')}</pre>
        </div>
      ))}
    </section>
  );
}
