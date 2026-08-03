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
//   - and every existing homepage marketing section renders BELOW the finished
//     funnel via the `below` slot.

import { WorthExperience } from './(public)/worth/WorthExperience';
import { PublicToolClient } from '@/components/lead-magnets/PublicToolClient';
import { getLeadMagnet } from '@/lib/leadMagnets/registry';
import { HomeNav } from './(public)/worth/WorthExperience';

const OPPORTUNITY_CALCULATOR = 'opportunity-calculator';

export function HomeFunnel() {
  const config = getLeadMagnet(OPPORTUNITY_CALCULATOR);

  // The registry is the source of truth for every tool. If the calculator were
  // ever removed from it, fall back to the previous homepage experience rather
  // than rendering a broken page.
  if (!config) return <WorthExperience homepage />;

  return (
    <div className="min-h-screen bg-crwn-bg text-crwn-text">
      <HomeNav />
      <PublicToolClient
        config={config}
        surface="homepage"
        below={
          // Every marketing section the homepage had, unchanged and in the same
          // order, now beneath the whole funnel. `marketingOnly` strips this
          // component's own nav, hero, and Streaming Loss calculator; it fires
          // no analytics, so nothing double-counts.
          <WorthExperience homepage marketingOnly />
        }
      />
    </div>
  );
}
