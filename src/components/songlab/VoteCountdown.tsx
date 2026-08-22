'use client';

// The live countdown above an open vote.
//
// Renders NOTHING until it has run on the client. A countdown is the one thing on the
// page that cannot be server-rendered honestly: the server's "now" is not the reader's,
// so a prerendered value would be stale the instant it arrived and would mismatch on
// hydration. First paint shows nothing, the first tick shows the truth.
//
// It also refuses to render when there is no closing time at all, rather than showing a
// zeroed clock that reads as "already over".

import { useEffect, useState } from 'react';
import {
  countdownFrom,
  formatCountdown,
  hasDeadline,
  isUrgent,
  tickIntervalMs,
  closingLabel,
  type CountdownParts,
} from '@/lib/songLab/countdown';

interface VoteCountdownProps {
  closesAt: string | null | undefined;
  /**
   * Fired once when the clock crosses zero, so the surface can refetch and show the
   * closed state without the fan refreshing. The server is still the authority: it
   * refuses a vote whose window has passed regardless of what this component believes.
   */
  onExpire?: () => void;
  /** Larger treatment for the ballot, where the countdown is the urgency of the page. */
  size?: 'lead' | 'inline';
}

export function VoteCountdown({ closesAt, onExpire, size = 'inline' }: VoteCountdownProps) {
  const [parts, setParts] = useState<CountdownParts | null>(null);
  const [fired, setFired] = useState(false);

  useEffect(() => {
    if (!hasDeadline(closesAt)) return;

    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const next = countdownFrom(closesAt, new Date());
      setParts(next);
      if (next.expired) {
        // Stop scheduling; the surface takes over from here.
        setFired((already) => {
          if (!already) onExpire?.();
          return true;
        });
        return;
      }
      timer = setTimeout(tick, tickIntervalMs(next));
    };
    tick();
    return () => clearTimeout(timer);
    // onExpire is intentionally not a dependency: callers pass an inline function, and
    // depending on it would tear down and restart the clock on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closesAt]);

  if (!hasDeadline(closesAt) || !parts) return null;

  const urgent = isUrgent(parts);
  const label = closingLabel(closesAt);

  if (parts.expired) {
    return (
      <div className="mb-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-crwn-text-secondary">
          Voting has closed
        </p>
      </div>
    );
  }

  return (
    <div className="mb-4" aria-live="off">
      <div
        className={`inline-flex items-baseline gap-2 rounded-full px-4 py-2 ${
          urgent
            ? 'bg-crwn-gold/15 ring-1 ring-crwn-gold/50'
            : 'bg-crwn-surface ring-1 ring-white/10'
        }`}
      >
        <span className="text-xs font-semibold uppercase tracking-widest text-crwn-text-secondary">
          Closes in
        </span>
        <span
          className={`font-bold tabular-nums ${urgent ? 'text-crwn-gold' : 'text-crwn-text'} ${
            size === 'lead' ? 'text-2xl' : 'text-lg'
          }`}
        >
          {formatCountdown(parts)}
        </span>
      </div>
      {label ? (
        <p className="mt-1.5 text-xs text-crwn-text-secondary">{label}</p>
      ) : null}
    </div>
  );
}
