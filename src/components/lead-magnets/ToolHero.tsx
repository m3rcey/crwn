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
// on top spends vertical space that the side-by-side layout got for free, so the artwork is drawn
// at 16:9 and rendered at full column width with a `max-h` viewport cap. 16:9 is the whole trick:
// at this column width it costs ~378px of height where 4:3 would cost ~500px, which is the
// difference between the button sitting above the fold and below it.
//
// Worst realistic case, a 1366x768 desktop (~660px of viewport): the 42vh cap binds at ~277px of
// image, plus ~24px gap and ~320px of copy and button, so ~620px inside ~660px. A 390x844 phone has
// far more room. So: before changing any height here, or adding an element, re-measure on a
// 1366x768 desktop AND a 375x667 phone. Growing the image or the type a little is exactly how the
// button falls off.
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
        FULL COLUMN WIDTH at 16:9, with a viewport cap as the safety net.

        The previous version sized by height (`h-[34vh] aspect-[4/3]`) so the artwork could never
        outgrow the fold, and it worked, but it made the image only about 60% of the column width
        and it read as small. The real constraint was the RATIO, not the pixel budget: a 4:3 image
        in this column is either wide enough to fill it and ~500px tall, or short enough to fit and
        too narrow. The heroes are now drawn at 16:9, so full width costs ~378px of height instead
        of ~500px and nothing has to be cropped.

        `max-h` is what keeps the CTA above the fold on a short laptop: the aspect ratio sets the
        natural height, and the cap takes over when the viewport cannot afford it (object-cover
        trims top and bottom rather than letterboxing).
      */}
      <div className="relative w-full aspect-[16/9] max-h-[38vh] md:max-h-[42vh] shrink-0 rounded-2xl overflow-hidden border border-crwn-elevated">
        <Image src={image} alt={imageAlt} fill priority sizes="(max-width: 768px) 100vw, 672px" className="object-cover" />
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
