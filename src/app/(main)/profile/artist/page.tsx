'use client';

// /profile/artist — Rise Mode: ONE next move, and nothing else.
//
// This route used to be the whole artist dashboard: 16 lazy tabs behind a horizontal scroll
// strip. Every tab is now a real route (see src/lib/dashboardRoutes.ts), and this page keeps the
// URL because the bottom tab bar points at it and 40+ legacy ?tab= links still arrive here.
//
// THE 2026-08-13 SIMPLIFICATION, and the measured problem behind it.
// The screen had become a collage of CRWN's own architecture. On one load an artist could meet:
// a launch-blocker panel, the Constraint Engine's card, the roadmap's card (with its own next
// milestone, a percentage, a progress bar, three stat tiles and an upcoming-promises list), the
// membership strategy card (with a revenue model, a "why this was recommended" line and three
// suggested action pills), then the quest board (artist build, level, XP total, XP bar, Focus
// mode, an AI recommended quest, a daily move, a weekly goal, six side quests and a movement
// map). CRWN had already decided what mattered most; the interface then asked the artist to
// decide again, between four subsystems, none of which knew about the others.
//
// The page now fetches the two canonical answers (the Constraint Engine's diagnosis and the
// roadmap), resolves them into ONE move with `resolveRiseNextMove`, and renders that. Nothing
// underneath was removed: the quest board moved to /quests (and this page still MOUNTS the
// engine, because /api/quests is what assigns and completes quests), the membership strategy
// moved to /account/tiers where the ladder it describes is edited, and the stats and promises
// are still owned by /studio/analytics and /studio/promise.

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { RiseMode } from '@/components/artist/RiseMode';
import { NextMoveCard } from '@/components/artist/NextMoveCard';
import { LaunchPartnerChecklist } from '@/components/artist/LaunchPartnerChecklist';
import { PlatformTierModal } from '@/components/onboarding/PlatformTierModal';
import { BackgroundImage } from '@/components/ui/BackgroundImage';
import { TourReplayButton } from '@/components/shared/TourReplayButton';
import { getPostSetupTourSteps } from '@/lib/artistTourSteps';
import { usePageTour } from '@/hooks/usePageTour';
import { useArtistContext } from '@/hooks/useArtistContext';
import { resolveTabRoute } from '@/lib/dashboardRoutes';
import { resolveOperatingFlow } from '@/lib/constraint/presentation';
import { resolveRiseNextMove } from '@/lib/riseNextMove';
import type { ConstraintResult } from '@/lib/constraint/types';
import type { ArtistRoadmap } from '@/lib/artistRoadmap';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

function ArtistDashboardContent() {
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { status, context } = useArtistContext();
  const [showPlatformTierModal, setShowPlatformTierModal] = useState(false);
  const [constraintResult, setConstraintResult] = useState<ConstraintResult | null>(null);
  const [roadmap, setRoadmap] = useState<ArtistRoadmap | null>(null);
  const [fetched, setFetched] = useState(false);

  // ONE read of each canonical answer for the whole screen, resolved into one move. The cards
  // used to fetch independently, which is how each of them came to believe it was the most
  // important thing on the page. A failure on either side leaves null, and the resolver falls
  // back to whatever the other one still knows.
  useEffect(() => {
    // A signed-in non-artist can reach this URL, and both routes would 403 for them. That case is
    // DERIVED below rather than written here: setting state synchronously in an effect body
    // cascades a render, and there is nothing to wait for.
    if (status !== 'artist') return;
    let active = true;
    const json = (r: Response) => (r.ok ? r.json() : null);
    Promise.all([
      fetch('/api/artist/constraint').then(json).catch(() => null),
      fetch('/api/artist/roadmap').then(json).catch(() => null),
    ]).then(([c, r]) => {
      if (!active) return;
      setConstraintResult(c?.constraint ?? null);
      setRoadmap(r?.roadmap ?? null);
      setFetched(true);
    });
    return () => {
      active = false;
    };
  }, [status]);

  const flow = resolveOperatingFlow(constraintResult);
  const nextMove = resolveRiseNextMove(flow, roadmap);
  // Settled: an artist once both reads land, anyone else as soon as we know they are not one.
  const resolved = status === 'artist' ? fetched : status !== 'loading';

  // Legacy ?tab= forwarding, computed during render rather than in an effect: Rise Mode is
  // expensive to mount and must not paint for a frame just to navigate away. Every param except
  // `tab` is carried across, because links already sitting in artists' notification rows look
  // like ?tab=payouts&earning=<id>. Stripe's Connect return carries no tab at all.
  const extra = new URLSearchParams(searchParams.toString());
  extra.delete('tab');
  const query = extra.toString();
  const redirectTo =
    resolveTabRoute(searchParams.get('tab'), query) ??
    (searchParams.get('stripe') === 'success' ? `/account/tiers?${query}` : null);

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  // Artists who never picked a platform tier still get the picker here, because
  // Rise Mode is the screen they land on.
  useEffect(() => {
    if (status !== 'artist') return;
    let active = true;
    const supabase = createBrowserSupabaseClient();
    supabase
      .from('artist_profiles')
      .select('platform_tier')
      .eq('id', context!.artistId)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data && !data.platform_tier) setShowPlatformTierModal(true);
      });
    return () => {
      active = false;
    };
  }, [status, context]);

  const { replay: replayDashboardTour } = usePageTour({
    tourId: 'dashboard',
    steps: getPostSetupTourSteps(context?.platformTier ?? 'starter'),
    userId: profile?.id,
    enabled: false,
    delayMs: 1500,
  });

  if (!profile || status === 'loading' || redirectTo) {
    return (
      <div className="relative min-h-screen">
        <BackgroundImage src="/backgrounds/bg-dashboard.jpg" />
        <div className="relative z-10 min-h-screen flex items-center justify-center">
          <Loader2 className="w-12 h-12 text-crwn-gold animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      <BackgroundImage src="/backgrounds/bg-dashboard.jpg" overlayOpacity="bg-black/80" />
      <div className="relative z-10">
        <div className="border-b border-crwn-elevated">
          <div className="px-4 sm:px-6 lg:px-8 pt-4 pb-4 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-crwn-text">Rise Mode</h1>
              <p className="text-crwn-text-secondary mt-1">Your next move, and what skipping it costs.</p>
            </div>
            <TourReplayButton onClick={replayDashboardTour} className="shrink-0 mt-1" />
          </div>
        </div>

        <div className="px-4 sm:px-6 lg:px-8 py-8">
          <div className="max-w-2xl mx-auto space-y-6">
            {resolved ? (
              <NextMoveCard next={nextMove} roadmap={roadmap} />
            ) : (
              <div className="flex justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-crwn-gold" />
              </div>
            )}

            {/* Cohort-only: the First Paid Member Guarantee made visible. Renders nothing unless
                the founder flipped launch_partner for this artist. Its status is a CONTRACT the
                artist is owed, not a recommendation; its conditions sit behind a disclosure so
                they cannot read as a second task list. */}
            <LaunchPartnerChecklist />

            {/* No quest-board link here. It was explaining CRWN's architecture to the artist
                ("levels and rewards live over there, you never have to open it") on the one
                screen built to hide it, and it helped nobody finish the move above. The board
                is indexed in the AccountHub hamburger under Grow, which is where the complete
                index of destinations belongs. */}
          </div>
        </div>
      </div>

      {/* The Quest Engine, mounted with no board. /api/quests assigns eligible quests and
          auto-completes them server-side, so this call is the engine running, not a render.
          Removing it along with the board would have frozen XP for every artist who does not
          go looking for /quests. */}
      <RiseMode variant="driver" />

      <PlatformTierModal
        isOpen={showPlatformTierModal}
        onComplete={() => setShowPlatformTierModal(false)}
      />
    </div>
  );
}

export default function ArtistDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-crwn-bg flex items-center justify-center">
          <Loader2 className="w-12 h-12 text-crwn-gold animate-spin" />
        </div>
      }
    >
      <ArtistDashboardContent />
    </Suspense>
  );
}
