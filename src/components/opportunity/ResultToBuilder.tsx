'use client';

import { ArrowDown } from 'lucide-react';
import { OPPORTUNITY_EVENTS, trackOpportunity } from '@/lib/opportunityFunnels/analytics';

// The result-to-builder transition: the ONLY primary CTA between a tool's result and its builder.
//
// It names what was discovered, says the tool has already prepared the deliverable, and advances
// the page to the builder (scroll + focus). It NEVER navigates to signup, never gates on an email,
// and never opens a booking flow: those are secondary actions that live BELOW the builder. This is
// the universal Opportunity Funnel page-composition contract in component form.

export function ResultToBuilder({
  toolSlug,
  transition,
  buildCta,
  builderRef,
}: {
  toolSlug: string;
  transition: string;
  buildCta: string;
  builderRef: React.RefObject<HTMLDivElement | null>;
}) {
  const go = () => {
    trackOpportunity(OPPORTUNITY_EVENTS.ctaClicked, { toolKey: toolSlug, opportunityKey: toolSlug });
    const el = builderRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Focus the first meaningful editable field once the scroll settles.
    window.setTimeout(() => {
      const field = el.querySelector<HTMLElement>('input, textarea, select, button[aria-haspopup]');
      field?.focus({ preventScroll: true });
    }, 450);
  };

  return (
    <div className="rounded-2xl border border-crwn-gold/30 bg-crwn-gold/[0.06] p-5 text-center">
      <h3 className="text-lg font-bold text-crwn-text">{transition}</h3>
      <p className="text-sm text-crwn-text-secondary mt-1">
        We prefilled it from your numbers. Edit anything below. Nothing is live yet.
      </p>
      <button
        onClick={go}
        className="mt-4 w-full sm:w-auto sm:px-10 py-3.5 rounded-full bg-crwn-gold text-crwn-bg font-semibold inline-flex items-center justify-center gap-2"
      >
        {buildCta}
        <ArrowDown className="w-4 h-4" />
      </button>
    </div>
  );
}
