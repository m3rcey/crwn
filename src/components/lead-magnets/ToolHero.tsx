'use client';

import Image from 'next/image';

// The shared calculator hero. Extracted from PublicToolClient so /worth renders the IDENTICAL hero
// as every other tool page: image, eyebrow, headline, subheadline, time + free line, gold CTA.
//
// ONE CENTRED COLUMN, image on top, at every breakpoint (2026-08-14). It used to be a two-column
// desktop grid with the image beside the copy, which put the artwork and the headline in a reading
// race and left the CTA hanging off the left edge of a half-width column.
//
// THE CTA MUST STAY ABOVE THE FOLD, AND IT IS GUARANTEED BY CONSTRUCTION, NOT BY ARITHMETIC.
//
// Two earlier versions budgeted it by hand ("a 42vh image plus ~320px of copy fits in 660px") and
// both were wrong on a real screen, because the copy block is not a fixed height: the headline
// wraps to two or three lines depending on the tool and the viewport width, and every estimate of
// it was optimistic. Guessing harder was not going to work.
//
// So on desktop the hero is exactly one viewport tall and the IMAGE ABSORBS THE REMAINDER: the copy
// is `shrink-0` and takes the height it needs, the image is `flex-1` and takes whatever is left.
// The button therefore cannot be pushed off screen by a headline that wraps, and the artwork is
// automatically as large as that particular page can afford. Mobile keeps natural flow at 16:9,
// where there was never a shortage of room.
//
// The practical rule if you edit this: you may add or remove copy freely, and the image will give
// or take the space. What you must NOT do is give the image a fixed or aspect-derived height on
// desktop again, because that is what put the button below the fold both times.
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
    <div
      className={
        'mx-auto flex max-w-2xl flex-col items-center text-center gap-4 md:gap-5 ' +
        // Desktop: exactly one viewport, minus the chrome above (nav or the "All tools" control)
        // and this page's own padding. `max-h` stops the hero becoming a poster on a tall monitor.
        'md:h-[calc(100svh-8rem)] md:max-h-[760px]'
      }
    >
      {/*
        The image is the FLEXIBLE element. On desktop it has no height of its own: `flex-1` hands it
        whatever the copy below did not take, so it is always the largest it can be on that screen
        and it can never be the reason the button is off screen. `min-h-0` is required or a flex
        child refuses to shrink below its content. Mobile keeps the natural 16:9 block.
      */}
      <div className="relative w-full aspect-[16/9] md:aspect-auto md:flex-1 md:min-h-0 rounded-2xl overflow-hidden border border-crwn-elevated">
        <Image src={image} alt={imageAlt} fill priority sizes="(max-width: 768px) 100vw, 672px" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-crwn-bg/70 via-transparent to-transparent" />
      </div>

      {/* `shrink-0`: the copy takes the height it needs and the image yields, never the reverse. */}
      <div className="w-full shrink-0 flex flex-col items-center text-center">
        {eyebrow && <div className="text-xs font-semibold uppercase tracking-wide text-crwn-gold mb-2">{eyebrow}</div>}
        <h1 className="text-3xl md:text-4xl font-bold text-crwn-text leading-tight">{headline}</h1>
        <p className="text-base text-crwn-text-secondary mt-3 leading-relaxed">{subheadline}</p>
        <div className="w-full mt-5">
          <button
            onClick={onStart}
            className="w-full sm:w-auto sm:px-12 py-3.5 rounded-full bg-crwn-gold text-crwn-bg font-semibold"
          >
            {ctaLabel}
          </button>
        </div>
        {/* Moved BELOW the button. It is reassurance about the click, not a prerequisite for it,
            and above the button it was pure cost between the promise and the action. */}
        <p className="text-xs text-crwn-text-secondary mt-3">Takes about {timeToComplete}. Free.</p>
      </div>
    </div>
  );
}
