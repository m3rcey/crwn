// Client-side funnel beacon for the pure-UI stages (Setup Started, Builder Published) that have no
// natural server route. It POSTs to /api/funnel/track, which derives identity from the session and
// records the event SERVER-SIDE, so the event store stays server-side. Fire-and-forget; it must
// never break the flow it measures.
//
// This is deliberately separate from src/lib/analytics/funnelEvents.ts (the server recorder, which
// imports node:crypto and must never be bundled into a client component).

import type { FunnelStage } from './funnelEvents';

export interface TrackFunnelPayload {
  calculator?: string;
  campaign?: string;
  referrer?: string;
  resultId?: string;
  /** Deterministic key for dedup. Omit to let the server dedup once-per-user for this stage. */
  dedupeKey?: string;
  metadata?: Record<string, unknown>;
}

export function trackFunnel(stage: FunnelStage, payload: TrackFunnelPayload = {}): void {
  if (typeof window === 'undefined') return;
  try {
    const body = JSON.stringify({ stage, ...payload });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/funnel/track', new Blob([body], { type: 'application/json' }));
    } else {
      void fetch('/api/funnel/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      });
    }
  } catch {
    // analytics never breaks the UX
  }
}
