// Client beacon for tier-card views. POSTs to /api/tier-events, which derives the visitor
// identity and the owning artist SERVER-SIDE, so the event store stays server-side and a
// browser can neither choose who it is nor which artist it is reporting against.
//
// Deliberately separate from src/lib/analytics/tierEvents.ts (the server recorder) and from
// funnelEvents.ts (which imports node:crypto and must never reach a client bundle).
//
// TWO LAYERS OF DEDUPLICATION, because one is not enough:
//   1. HERE, per page load: a module-level Set of tier ids already reported. React rerenders,
//      a re-observed element after a layout shift, and a component remount on tab focus all
//      hit this and send nothing. Without it a busy page would fire on every render.
//   2. AT THE DATABASE, per visitor per day: the unique grain on tier_events. This is the one
//      that actually guarantees correctness, because layer 1 dies with the page.
//
// Views are also BATCHED on a microtask-ish timer: a fan scrolling past four rungs produces
// one request carrying four ids, not four requests.

import type { TierEventType } from './tierEvents';

/** Ids already reported in this page load. Cleared only by a real navigation. */
const reported = new Set<string>();

let pending: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSource: string | null = null;

const FLUSH_DELAY_MS = 400;

function flush(): void {
  flushTimer = null;
  const tierIds = pending;
  const source = pendingSource;
  pending = [];
  pendingSource = null;
  if (tierIds.length === 0) return;

  try {
    const body = JSON.stringify({ tierIds, ...(source ? { source } : {}) });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/tier-events', new Blob([body], { type: 'application/json' }));
    } else {
      void fetch('/api/tier-events', {
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

/**
 * Report that a tier card became visible. Safe to call on every render: the first call for a
 * given tier in this page load sends, every later call is a no-op.
 *
 * Only `tier_card_viewed` is accepted. Checkout starts are recorded server-side at the real
 * checkout boundary, where they cannot be forged and where a failed session records nothing.
 */
export function trackTierView(tierId: string, opts?: { source?: string | null }): void {
  if (typeof window === 'undefined') return;
  if (!tierId || reported.has(tierId)) return;
  reported.add(tierId);

  pending.push(tierId);
  if (opts?.source && !pendingSource) pendingSource = opts.source;
  if (flushTimer === null) flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
}

/** Exported for the type contract only; the client never sends anything else. */
export const CLIENT_TIER_EVENT: TierEventType = 'tier_card_viewed';

/** Test seam: forget what this page load has already reported. */
export function __resetTierViewTracking(): void {
  reported.clear();
  pending = [];
  pendingSource = null;
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}
