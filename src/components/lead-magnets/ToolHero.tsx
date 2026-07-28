'use client';

import Image from 'next/image';

// The shared calculator hero. Extracted from PublicToolClient so /worth renders the IDENTICAL
// hero as every other tool page: eyebrow, left-aligned headline, subheadline, time + free line,
// gold CTA, photo beside the copy on desktop and above it on mobile.
//
// MOBILE: the hero claims the screen (min-h in svh, so Safari's toolbars are counted) and the CTA
// is pushed to the bottom with mt-auto, so there is no dead space under it. The photo keeps its own
// 4:3 ratio so it is NOT cropped, capped so a short phone (iPhone SE) still fits the CTA above the
// fold. DESKTOP: the photo sits beside the copy, costing no vertical height.
// Re-measure the fold on a 375x667 phone before growing any of these heights.
export function ToolHero({
  eyebrow,
  headline,
  subheadline,
  timeToComplete,
  image,
  imageAlt,
  ctaLabel,
  onStart,
}: {
  eyebrow?: string;
  headline: string;
  subheadline: string;
  timeToComplete: string;
  image: string;
  imageAlt: string;
  ctaLabel: string;
  onStart: () => void;
}) {
  return (
    <div className="flex flex-col md:grid md:grid-cols-2 md:items-center gap-5 md:gap-10 min-h-[calc(100svh-9rem)] md:min-h-0 md:py-6">
      <div className="relative w-full aspect-[4/3] max-md:max-h-[30vh] max-md:[@media(min-height:700px)]:max-h-[45vh] md:aspect-auto md:h-[420px] shrink-0 rounded-2xl overflow-hidden border border-crwn-elevated md:order-2">
        <Image src={image} alt={imageAlt} fill priority sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-crwn-bg/70 via-transparent to-transparent" />
      </div>

      <div className="flex flex-1 flex-col md:block md:order-1">
        {eyebrow && <div className="text-xs font-semibold uppercase tracking-wide text-crwn-gold mb-2">{eyebrow}</div>}
        <h1 className="text-3xl md:text-4xl font-bold text-crwn-text leading-tight">{headline}</h1>
        <p className="text-base text-crwn-text-secondary mt-3 leading-relaxed">{subheadline}</p>
        <p className="text-xs text-crwn-text-secondary mt-4">Takes about {timeToComplete}. Free.</p>
        <div className="mt-auto pt-5 md:mt-5 md:pt-0">
          <button onClick={onStart} className="w-full md:w-auto md:px-12 py-3.5 rounded-full bg-crwn-gold text-crwn-bg font-semibold">
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
