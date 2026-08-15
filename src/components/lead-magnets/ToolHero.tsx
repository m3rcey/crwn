'use client';

import Image from 'next/image';

// The shared calculator hero. Extracted from PublicToolClient so /worth renders the IDENTICAL hero
// as every other tool page: image, eyebrow, headline, subheadline, time + free line, gold CTA.
//
// ONE CENTRED COLUMN, image on top, at every breakpoint (2026-08-14). It used to be a two-column
// desktop grid with the image beside the copy, which put the artwork and the headline in a reading
// race and left the CTA hanging off the left edge of a half-width column.
//
// THE CONSTRAINT THAT SHAPES EVERYTHING HERE: the CTA must stay above the fold. Stacking the image
// on top spends vertical space that the side-by-side layout got for free, so the image is sized by
// HEIGHT in viewport units and lets its width follow the 4:3 ratio, rather than the usual
// width-first sizing. That is what guarantees it can never grow past its share of the screen on a
// short laptop. Worst realistic case, a 1366x768 desktop: 34vh image (261px) + ~20px gap + ~320px
// of copy and button = ~600px inside ~656px of usable height. A 390x844 phone has more room still.
//
// So: before changing any height here, or adding an element, re-measure on a 1366x768 desktop AND a
// 375x667 phone. Growing the image or the type by a little is exactly how the button falls off.
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
    <div className="mx-auto flex max-w-2xl flex-col items-center text-center gap-5 md:gap-6 py-2 md:py-4">
      {/*
        Height-first sizing: `h-[Nvh]` with `aspect-[4/3]` means the height is the fixed side and
        the width derives from it, so the artwork always fits its share of the viewport instead of
        being as tall as the column is wide. `object-cover` on a container already at the source's
        own 4:3 ratio crops nothing.
      */}
      <div className="relative h-[28vh] md:h-[34vh] aspect-[4/3] shrink-0 rounded-2xl overflow-hidden border border-crwn-elevated">
        <Image src={image} alt={imageAlt} fill priority sizes="(max-width: 768px) 70vw, 480px" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-crwn-bg/70 via-transparent to-transparent" />
      </div>

      <div className="flex flex-col items-center text-center">
        {eyebrow && <div className="text-xs font-semibold uppercase tracking-wide text-crwn-gold mb-2">{eyebrow}</div>}
        <h1 className="text-3xl md:text-4xl font-bold text-crwn-text leading-tight">{headline}</h1>
        <p className="text-base text-crwn-text-secondary mt-3 leading-relaxed">{subheadline}</p>
        <p className="text-xs text-crwn-text-secondary mt-4">Takes about {timeToComplete}. Free.</p>
        {/* No `mt-auto` any more: the column is content-sized, so the button sits directly under
            the copy rather than being pushed to the bottom of a full-screen box. */}
        <div className="w-full mt-5">
          <button
            onClick={onStart}
            className="w-full sm:w-auto sm:px-12 py-3.5 rounded-full bg-crwn-gold text-crwn-bg font-semibold"
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
