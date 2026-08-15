'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Fire once when an element has genuinely been ON SCREEN long enough that the visitor had a real
 * chance to notice it.
 *
 * WHY THIS EXISTS: `lead_magnet_lead_capture_viewed` used to fire from a mount effect. A component
 * mounted three screens below the fold is not a component anybody saw, so "exposure" was really
 * "existed in the DOM", and every rate measured against it would have been wrong in the flattering
 * direction. That is the same class of mistake as the zero it was added to explain.
 *
 * THE DWELL REQUIREMENT IS THE POINT. A visibility check alone still counts a smooth-scroll flyby:
 * the primary "Build my ..." CTA scrolls the page past this card in a few hundred milliseconds, and
 * an element that swept through the viewport on the way somewhere else was not an opportunity to
 * read an offer. Requiring the element to STAY visible separates the two.
 *
 * The threshold and dwell are deliberate product judgement, not science. They exist only to
 * distinguish "rendered somewhere in the DOM" from "the visitor had a fair chance to see it".
 */
export interface ViewportExposureOptions {
  /** Stable key for once-per-experience dedup. Skipped entirely when absent. */
  key: string;
  /** Fraction of the element that must be visible. */
  threshold?: number;
  /** How long it must STAY visible before it counts. */
  dwellMs?: number;
  /** Gate for surfaces that mount the element before it is reachable (the /worth entry wizard). */
  enabled?: boolean;
  onExposed: () => void;
}

/**
 * sessionStorage, not module state: it must survive a remount (the wizard's edit/recalculate round
 * trip remounts the result) and a scroll away and back, but a genuinely new visit in a new tab is a
 * new experience and should be counted again. That is the correct granularity for "once per result
 * experience", and it reuses a primitive the repo already uses rather than inventing an identity.
 */
function alreadyCounted(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === '1';
  } catch {
    return false; // storage-denied browsers get at-most-per-mount, which is better than silence
  }
}
function markCounted(key: string): void {
  try {
    window.sessionStorage.setItem(key, '1');
  } catch {
    /* private mode: fall through, the in-memory ref still prevents a scroll loop */
  }
}

export function useViewportExposure(
  ref: RefObject<HTMLElement | null>,
  { key, threshold = 0.5, dwellMs = 900, enabled = true, onExposed }: ViewportExposureOptions,
): void {
  // Guards a re-fire inside one mount even when sessionStorage is unavailable.
  const firedRef = useRef(false);
  // Keep the latest callback without making it an effect dependency, so an inline arrow in the
  // caller cannot tear down and rebuild the observer on every render.
  const cbRef = useRef(onExposed);
  cbRef.current = onExposed;

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el || typeof window === 'undefined') return;
    if (firedRef.current || alreadyCounted(key)) return;

    // No IntersectionObserver (very old browsers, some test envs): degrade to NOT firing rather
    // than to firing on mount. An absent number is honest; an inflated one is not.
    if (typeof IntersectionObserver === 'undefined') return;

    let timer: number | undefined;
    const clear = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e) return;
        if (e.isIntersecting && e.intersectionRatio >= threshold) {
          if (timer !== undefined || firedRef.current) return;
          timer = window.setTimeout(() => {
            if (firedRef.current || alreadyCounted(key)) return;
            firedRef.current = true;
            markCounted(key);
            cbRef.current();
            io.disconnect();
          }, dwellMs);
        } else {
          // Left the viewport before the dwell elapsed: it was a flyby, not an exposure.
          clear();
        }
      },
      { threshold: [threshold] },
    );

    io.observe(el);
    return () => {
      clear();
      io.disconnect();
    };
  }, [ref, key, threshold, dwellMs, enabled]);
}
