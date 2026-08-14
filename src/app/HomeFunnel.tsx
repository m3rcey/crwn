'use client';

// The homepage funnel.
//
// The homepage runs the SAME Opportunity Calculator funnel as
// /tools/opportunity-calculator, by mounting the same production component
// (`PublicToolClient`) with the same registry config. There is deliberately no
// homepage copy of the calculator, the result, the transition, the builder, or
// the save boundary: hero photo -> one CTA -> wizard -> result -> transition ->
// builder -> save/signup is owned in one place, and both routes get every fix.
//
// The homepage differs only in chrome and attribution:
//   - it renders the CRWN nav above the funnel (the tool route has its own
//     "All tools" back control, which is suppressed here),
//   - signup refs read `?ref=homepage`,
//   - funnel events carry `surface: 'homepage'` so homepage and tool traffic
//     stay separable without renaming or duplicating a single event,
//   - and the marketing narrative renders BELOW the finished funnel via the
//     `below` slot. Since the Zero to One homepage rebuild (2026-08-13) that
//     narrative is `HomeMarketing` (fragmentation -> first-revenue path ->
//     operating loop -> evidence -> First Revenue Launch -> capabilities ->
//     pricing -> FAQ -> final CTA), which owns the ENTIRE lower page: the
//     generic tool-route showcase (CrwnShowcase) does not render on the
//     homepage surface.

import { WorthExperience } from './(public)/worth/WorthExperience';
import { HomeNav } from './(public)/worth/WorthExperience';
import { HomeMarketing } from './HomeMarketing';
import { PublicToolClient } from '@/components/lead-magnets/PublicToolClient';
import { getLeadMagnet } from '@/lib/leadMagnets/registry';

const OPPORTUNITY_CALCULATOR = 'opportunity-calculator';

export function HomeFunnel() {
  const config = getLeadMagnet(OPPORTUNITY_CALCULATOR);

  // The registry is the source of truth for every tool. If the calculator were
  // ever removed from it, fall back to the standalone Streaming Loss experience
  // rather than rendering a broken page.
  if (!config) return <WorthExperience homepage />;

  return (
    <div className="min-h-screen bg-crwn-bg text-crwn-text">
      <HomeNav />
      <PublicToolClient
        config={config}
        surface="homepage"
        below={<HomeMarketing />}
      />
    </div>
  );
}
