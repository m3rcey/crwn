'use client';

import { useCallback, useEffect, useRef } from 'react';
import { DriveStep } from 'driver.js';
import { startTour } from '@/lib/tour';
import { useTourCheck } from '@/hooks/useTourCheck';

interface UsePageTourOptions {
  /** Key stored in profiles.completed_tours (JSONB is open-keyed, no migration needed). */
  tourId: string;
  steps: DriveStep[];
  userId?: string;
  /** Gate the auto-start (e.g. wait for page data / role check). Defaults to true. */
  enabled?: boolean;
  /** Delay before the first-visit auto-start. Defaults to 800ms. */
  delayMs?: number;
}

/**
 * The one per-page tour trigger. Wraps the pattern previously duplicated in
 * every page (useTourCheck + useEffect + setTimeout + startTour):
 *
 * - Auto-starts the tour on first visit (completed_tours[tourId] unset),
 *   resuming from a partially-saved step, and marks it complete on finish
 *   or dismiss (dismiss=complete is intentional — a replay button exists).
 * - Returns `replay`, which re-runs the tour on demand WITHOUT touching the
 *   completion flag in the DB. Wire it to <TourReplayButton />.
 */
export function usePageTour({
  tourId,
  steps,
  userId,
  enabled = true,
  delayMs = 800,
}: UsePageTourOptions) {
  const { shouldShowTour, startStep, markComplete, saveStep } = useTourCheck(tourId, userId);

  // Steps live in a ref so callers can pass a freshly-built array each render
  // (e.g. plan-aware steps) without re-triggering the effect.
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  // Guard against double-starts across effect re-runs (checked at fire time,
  // not schedule time, so a cancelled timer doesn't burn the one auto-start).
  const startedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !shouldShowTour || startedRef.current) return;
    const timer = setTimeout(() => {
      if (startedRef.current || stepsRef.current.length === 0) return;
      startedRef.current = true;
      startTour(stepsRef.current, markComplete, saveStep, startStep);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [enabled, shouldShowTour, startStep, markComplete, saveStep, delayMs]);

  const replay = useCallback(() => {
    if (stepsRef.current.length === 0) return;
    startTour(stepsRef.current);
  }, []);

  return { replay };
}
