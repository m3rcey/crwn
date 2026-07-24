'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';

// Rise Mode entry point for the Royalty Readiness Check.
//
// Renders NOTHING until the dark-launch flag is on, and never blocks the board:
// the fetch runs after Rise Mode has already painted, and any failure leaves the
// card hidden. Loss-framed per CLAUDE.md: name what is going uncollected first.
//
// Deliberately NOT a quest. The Quest Engine is a separate dark-launched ladder
// with its own XP and prerequisites; wiring this in as a template would couple two
// unlaunched features together and make each one harder to turn on alone.
export function RoyaltyReadinessCard() {
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [openGaps, setOpenGaps] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/royalty-readiness')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data?.enabled) return;
        setEnabled(true);
        if (data.result) {
          setScore(data.result.score);
          setOpenGaps(data.result.actions?.length ?? 0);
        }
      })
      .catch(() => {
        /* stay hidden */
      });
    return () => {
      active = false;
    };
  }, []);

  if (!enabled) return null;

  const started = score !== null;

  return (
    <div className="rounded-2xl border border-crwn-gold/30 bg-[#1A1A1A] p-6">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck className="w-5 h-5 text-crwn-gold" />
        <span className="text-lg font-bold text-crwn-gold uppercase tracking-wide">Royalty readiness</span>
      </div>

      {started ? (
        <>
          <h3 className="text-2xl font-bold text-crwn-text">
            {openGaps === 0 ? 'Every stream that applies to you is covered' : `${openGaps} royalty streams have nobody collecting them`}
          </h3>
          <p className="text-crwn-text-secondary text-lg mt-2 leading-relaxed">
            {openGaps === 0
              ? 'Come back after your next release. A new song is a new registration, and that is where the gaps reopen.'
              : 'Your distributor only pays you for the recording. The rest is collected by other organizations, and only if you are registered with them.'}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <span className="text-3xl font-bold text-crwn-gold">{score}</span>
            <span className="text-sm text-crwn-text-secondary">out of 100 covered</span>
          </div>
        </>
      ) : (
        <>
          <h3 className="text-2xl font-bold text-crwn-text">Your distributor is not collecting most of what your songs earn.</h3>
          <p className="text-crwn-text-secondary text-lg mt-2 leading-relaxed">
            Performance royalties, mechanicals, digital radio and everything outside the US are paid by different
            organizations, and none of them pay you unless you are registered. Twelve questions will show you which ones
            currently have nobody assigned to them.
          </p>
        </>
      )}

      <button
        onClick={() => router.push('/royalty-readiness')}
        className="neu-button-accent w-full mt-5 py-3.5 rounded-full font-semibold text-base"
      >
        {started ? 'Review my gaps →' : 'Check what I am missing →'}
      </button>
    </div>
  );
}
