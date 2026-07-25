'use client';

// The "here's what else your calculator suggested" card.
//
// It sits under the prefill banner in a builder and shows the parts of the calculator's plan that
// are NOT editable fields in this builder, so they are surfaced as guidance instead of faked as
// drafts. Everything here is display-only: it writes nothing, it just tells the artist what to do
// next and links to where they do it. It renders only when routed from a calculator (lm_prefill=1).
//
// Why guidance and not a draft, per the builder audit:
//   - the full membership ladder: the Free plan caps live paid tiers at 1, so only the entry tier
//     below is a real draft; the rest of the ladder is built in Tiers (Pro).
//   - replay: a live session records automatically; the replay is gated AFTER it airs, not here.
//   - tip goals: added to a session once it is live (and behind a rollout flag), not at create time.
//   - Vault release cadence: there is no scheduler; release timing is set per track in Music.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Lightbulb } from 'lucide-react';
import { decodeLadder } from '@/lib/leadResults/postSetupDestination';

interface Suggestions {
  tool: string;
  ladder: { name: string; price: number; subs: number }[];
  tipGoal: string | null;
  replay: boolean;
  cadence: boolean;
}

export function CalculatorSuggestions() {
  const [s, setS] = useState<Suggestions | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('lm_prefill') !== '1') return;
    setS({
      tool: q.get('lm_tool') || '',
      ladder: decodeLadder(q.get('lm_suggest_ladder')),
      tipGoal: q.get('lm_suggest_tip_goal'),
      replay: q.get('lm_suggest_replay') === '1',
      cadence: q.get('lm_suggest_cadence') === '1',
    });
  }, []);

  if (!s) return null;

  const items: React.ReactNode[] = [];

  if (s.ladder.length > 1) {
    items.push(
      <div key="ladder">
        <p className="text-crwn-text font-medium">Your suggested membership ladder</p>
        <ul className="mt-1 space-y-0.5">
          {s.ladder.map((t) => (
            <li key={t.name} className="text-sm text-crwn-text-secondary">
              {t.name}: ${t.price}/mo
              {t.subs > 0 ? ` (about ${t.subs.toLocaleString('en-US')} of your fans)` : ''}
            </li>
          ))}
        </ul>
        <p className="text-sm text-crwn-text-secondary mt-1">
          Start with the entry tier below. Build the full ladder in your{' '}
          <Link href="/account/tiers" className="text-crwn-gold hover:underline">
            Tiers
          </Link>{' '}
          when you go Pro.
        </p>
      </div>,
    );
  }

  if (s.tipGoal) {
    items.push(
      <p key="tip" className="text-sm text-crwn-text-secondary">
        Suggested tip goal for the night: <span className="text-crwn-text">${s.tipGoal}</span>. Add it from the
        session once you are live.
      </p>,
    );
  }

  if (s.replay) {
    items.push(
      <p key="replay" className="text-sm text-crwn-text-secondary">
        This session records automatically. After it airs, gate the replay to your members.
      </p>,
    );
  }

  if (s.cadence) {
    items.push(
      <p key="cadence" className="text-sm text-crwn-text-secondary">
        Plan your release cadence: set access and drop timing on each track in your{' '}
        <Link href="/studio/music" className="text-crwn-gold hover:underline">
          Music
        </Link>
        .
      </p>,
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-crwn-elevated bg-crwn-surface p-4 mb-5">
      <div className="flex items-center gap-2 mb-2">
        <Lightbulb className="w-4 h-4 text-crwn-gold" />
        <p className="text-xs font-bold text-crwn-gold uppercase tracking-wide">Suggested from your calculator</p>
      </div>
      <div className="space-y-3">{items}</div>
    </div>
  );
}
