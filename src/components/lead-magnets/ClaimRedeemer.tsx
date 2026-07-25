'use client';

// Redeems a result claim that was stranded by the signup funnel.
//
// The problem it solves: an artist taps "Save my result", is not logged in, and gets sent
// through /signup. But /signup ignores ?next and always routes to /welcome (via /verify when
// email confirmation is on), so the token does not survive the funnel. Their result sits
// unclaimed and they have to go back to the link.
//
// The fix has to live OUTSIDE the auth flow. /welcome and useAuth are the two files that
// silently broke artist onboarding for months, and a claim feature does not justify touching
// them. So instead: the claim page stashes the token in localStorage (exactly as the repo
// already stashes crwn_recruiter and crwn_invite), and this component redeems it the moment
// the artist lands anywhere inside (main).
//
// It is mounted in (main)/layout.tsx, which only renders AFTER both gates pass. So by the
// time this runs, the artist_profiles row exists and setup is complete, which is precisely
// when a claim can link both user_id and artist_id in one shot.
//
// It renders nothing, never blocks, and never redirects. If it fails, it fails silently and
// the artist's result link still works: this is a convenience, not a load-bearing path.

import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';

const STORAGE_KEY = 'crwn_claim';

export function ClaimRedeemer() {
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();
  // Guards against a double-invoke in React strict mode and against re-running on re-render.
  const attempted = useRef(false);

  useEffect(() => {
    if (isLoading || !user || attempted.current) return;
    attempted.current = true;

    // Durable path: match any pre-signup result to this VERIFIED account server-side (by email
    // and by the signup-carried token) and backfill artist_id now that the artist row exists.
    // No browser storage is required for this to work.
    fetch('/api/lead-results/auto-claim', { method: 'POST' })
      .then((res) => res.json())
      .then((json) => {
        if (json?.claimed > 0) {
          showToast('Your result is saved to your account!', 'success');
        }
      })
      .catch(() => {
        // Silent. The result page still works and they can claim from there.
      });

    // Belt-and-suspenders: the specific "clicked a /claim link on this device" case.
    const token = localStorage.getItem(STORAGE_KEY);
    if (token) {
      // Clear FIRST so a failure does not retry on every navigation for the rest of their life.
      localStorage.removeItem(STORAGE_KEY);
      fetch(`/api/lead-results/${encodeURIComponent(token)}/claim`, { method: 'POST' }).catch(() => {});
    }
  }, [user, isLoading, showToast]);

  return null;
}
