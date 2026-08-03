'use client';

// useTierViewTracker — reports a tier card as VIEWED once it is actually on screen.
//
// "Viewed" deliberately does not mean "rendered". A rung sitting below the fold, or on a page
// the fan bounced off in 300ms, was never really seen, and counting it would inflate the
// denominator of every conversion rate the ladder produces. So the bar is: at least half the
// card visible, via IntersectionObserver.
//
// Deduplication is layered, and the render-driven duplication the brief warns about is
// stopped by the first two:
//   1. Each element is observed once and UNOBSERVED the moment it qualifies, so scrolling a
//      card in and out cannot re-fire.
//   2. trackTierView keeps a per-page-load Set, so a remount (tab focus, state change,
//      React Strict Mode's double-invoke in dev) reports nothing new.
//   3. The tier_events unique grain (artist, tier, type, visitor, day) is the real guarantee,
//      because layers 1 and 2 die with the page.

import { useCallback, useEffect, useRef } from 'react';
import { trackTierView } from '@/lib/analytics/trackTierViewClient';

/** Fraction of the card that must be visible before it counts as seen. */
const VISIBLE_THRESHOLD = 0.5;

export function useTierViewTracker(opts?: { source?: string | null; enabled?: boolean }) {
  const enabled = opts?.enabled !== false;
  const source = opts?.source ?? null;

  const observerRef = useRef<IntersectionObserver | null>(null);
  // Element -> tierId, so the observer callback can resolve what became visible without
  // reading anything off the DOM node.
  const watchedRef = useRef(new Map<Element, string>());

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;

    const watched = watchedRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < VISIBLE_THRESHOLD) continue;
          const tierId = watched.get(entry.target);
          if (!tierId) continue;
          trackTierView(tierId, { source });
          // Seen once is seen. Unobserving here is what stops a scroll back and forth from
          // producing a second report before the per-load Set is even consulted.
          observer.unobserve(entry.target);
          watched.delete(entry.target);
        }
      },
      { threshold: VISIBLE_THRESHOLD },
    );
    observerRef.current = observer;

    // Adopt anything the ref callback registered before the observer existed (refs run
    // before effects on the first paint).
    for (const el of watched.keys()) observer.observe(el);

    return () => {
      observer.disconnect();
      observerRef.current = null;
      watched.clear();
    };
  }, [enabled, source]);

  /**
   * Ref callback for a tier card element. Stable across renders, so attaching it does not
   * churn the observer.
   */
  return useCallback(
    (tierId: string) => (el: HTMLElement | null) => {
      if (!enabled || !tierId) return;
      const watched = watchedRef.current;
      if (!el) return;
      if (watched.has(el)) return;
      watched.set(el, tierId);
      observerRef.current?.observe(el);
    },
    [enabled],
  );
}
