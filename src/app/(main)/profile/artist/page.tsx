'use client';

// /profile/artist — Rise Mode, and nothing else.
//
// This route used to be the whole artist dashboard: 16 lazy tabs behind a
// horizontal scroll strip, every visited tab kept mounted so its state survived
// a tab switch. Three things were wrong with that:
//   1. On a phone, tabs 8 through 16 (Sync, Profile, Albums, Shop, Billing,
//      Tiers, Payouts, Referrals) were off-screen and effectively unreachable.
//   2. Only SEVEN of the sixteen ?tab= values were honored from the URL, so 40+
//      internal deep links, including the account menu's own "Payouts and tax",
//      silently dumped the artist on Rise Mode.
//   3. Switching to a tab downloaded its chunk right then, at tap time, behind a
//      spinner. Nothing could be prefetched, because nothing was a route.
//
// Every tab is now a real route (see src/lib/dashboardRoutes.ts). Management
// screens live under /account and are reached from the hamburger; work screens
// live under /studio. Both are prefetched by <Link>, so the chunk is already in
// the browser before the tap. This page keeps the /profile/artist URL because
// the bottom tab bar points at it, and it redirects every legacy ?tab= link to
// wherever that tab went.

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { RiseMode } from '@/components/artist/RiseMode';
import { RoadmapCard } from '@/components/artist/RoadmapCard';
import { ConstraintCard } from '@/components/artist/ConstraintCard';
import { LaunchPartnerChecklist } from '@/components/artist/LaunchPartnerChecklist';
import { StrategyCard } from '@/components/artist/StrategyCard';
import { PlatformTierModal } from '@/components/onboarding/PlatformTierModal';
import { BackgroundImage } from '@/components/ui/BackgroundImage';
import { TourReplayButton } from '@/components/shared/TourReplayButton';
import { getPostSetupTourSteps } from '@/lib/artistTourSteps';
import { usePageTour } from '@/hooks/usePageTour';
import { useArtistContext } from '@/hooks/useArtistContext';
import { resolveTabRoute } from '@/lib/dashboardRoutes';
import { resolveOperatingFlow } from '@/lib/constraint/presentation';
import type { ConstraintResult } from '@/lib/constraint/types';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

function ArtistDashboardContent() {
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { status, context } = useArtistContext();
  const [showPlatformTierModal, setShowPlatformTierModal] = useState(false);
  const [constraintResult, setConstraintResult] = useState<ConstraintResult | null>(null);

  // ONE read of the canonical diagnosis for the whole screen. The cards used to fetch
  // independently, which is how each of them came to believe it was the most important thing on
  // the page. A failure leaves `null`, which resolves to the pre-existing behavior (roadmap leads).
  useEffect(() => {
    if (status !== 'artist') return;
    let active = true;
    fetch('/api/artist/constraint')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (active) setConstraintResult(j?.constraint ?? null);
      })
      .catch(() => {
        /* Silent: the roadmap is unaffected. */
      });
    return () => {
      active = false;
    };
  }, [status]);

  const flow = resolveOperatingFlow(constraintResult);

  // Legacy ?tab= forwarding, computed during render rather than in an effect:
  // Rise Mode is expensive to mount and must not paint for a frame just to
  // navigate away. Every param except `tab` is carried across, because links
  // already sitting in artists' notification rows and inboxes look like
  // ?tab=payouts&earning=<id>, and dropping `earning` would land them on the
  // payouts screen with nothing highlighted. Stripe's Connect return carries no
  // tab at all (?stripe=success) and used to mean "open the Tiers tab".
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
          <div className="px-4 sm:px-6 lg:px-8 pt-4 pb-2 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-crwn-text">Rise Mode</h1>
              <p className="text-crwn-text-secondary mt-1">Your next move, and what skipping it costs.</p>
            </div>
            <TourReplayButton onClick={replayDashboardTour} className="shrink-0 mt-1" />
          </div>

          {context?.slug && (
            <div className="px-4 sm:px-6 lg:px-8 pb-3">
              <Link
                href={`/${context.slug}?preview=visitor`}
                data-tour="view-as-fan"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-crwn-text-secondary hover:text-crwn-gold border border-crwn-elevated rounded-full transition-colors"
              >
                <Eye className="w-4 h-4" />
                View as fan
              </Link>
            </div>
          )}
        </div>

        <div className="px-4 sm:px-6 lg:px-8 py-8">
          {/* ONE PRIMARY ACTION.
              The canonical diagnosis is fetched once here and handed down, so exactly one card
              renders a gold CTA. Before this, the constraint, the roadmap and the strategy card
              each rendered their own primary button (two of them labelled "Do it now") pointing at
              different destinations, and the artist had to decide which CRWN subsystem to believe.
              `resolveOperatingFlow` adds no opinion: it reads back which canonical owner should
              hold the action from what the engine already returned. */}
          {flow.phase === 'launch' && flow.launchBlockers.length > 0 && (
            <div className="neu-raised rounded-2xl p-5 mb-6 border border-crwn-gold/40">
              <p className="text-[11px] uppercase tracking-wide text-crwn-text-secondary">
                Finish launching first
              </p>
              <h3 className="font-bold text-crwn-text mt-1">
                Your page cannot take money yet, so there is nothing to grow.
              </h3>
              <p className="text-xs text-crwn-text-secondary mt-1">
                CRWN is holding back growth advice on purpose. Until this is done, any number it
                showed you would be measuring a business that does not exist yet.
              </p>
              <ul className="mt-3 space-y-1.5">
                {flow.launchBlockers.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-xs text-crwn-text">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-crwn-gold shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Renders nothing unless a constraint was diagnosed. */}
          <ConstraintCard constraint={flow.constraint} />

          {/* Cohort-only: the First Paid Member Guarantee made visible. Renders
              nothing unless the founder flipped launch_partner for this artist. */}
          <LaunchPartnerChecklist />

          {/* Launch-gated or steady: the roadmap leads. Diagnosed: it recedes to context. */}
          <RoadmapCard emphasis={flow.primary === 'roadmap' ? 'primary' : 'secondary'} />

          {/* The membership strategy sits between the roadmap (what to do next)
              and Rise Mode (the quests): it is the WHY behind both. Deliberately UNCHANGED: its
              only gold control sits behind a collapsed disclosure, so it never competed for the
              primary action on first paint and needed no emphasis prop. */}
          <StrategyCard />
          <RiseMode />
        </div>
      </div>

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
