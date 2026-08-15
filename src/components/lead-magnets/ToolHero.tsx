'use client';

import Image from 'next/image';

// The shared calculator hero. Extracted from PublicToolClient so /worth renders the IDENTICAL hero
// as every other tool page: image, headline, subheadline, gold CTA. Four elements, deliberately.
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
// automatically as large as that particular page can afford. Mobile keeps natural flow and sizes
// the photo by a height-aware aspect ratio instead; see the image block below.
//
// The practical rule if you edit this: you may add or remove copy freely, and the image will give
// or take the space. What you must NOT do is give the image a fixed or aspect-derived height on
// desktop again, because that is what put the button below the fold both times.
//
// The EYEBROW and the "Takes about N. Free." line are both GONE (founder call, 2026-08-15). The
// homepage had already dropped them; this brings the six calculator pages in line, so the hero is
// image, headline, subheadline, button and nothing else. They are removed rather than made
// optional: an optional prop nobody passes is dead surface that invites the elements back.
//
// The registry still carries `hero.eyebrow` and `timeToComplete` because the /tools directory
// listing reads them. Deleting them there would be a different change to a different surface.
//
// On desktop the reclaimed height goes straight to the photo with no other adjustment, because the
// image is the flexible element. Mobile has no such slack, so its aspect ratio was opened up by
// hand instead; see the image block below.
export function ToolHero({
  headline,
  subheadline,
  image,
  imageAlt,
  ctaLabel,
  onStart,
}: {
  headline: string;
  subheadline: string;
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
        child refuses to shrink below its content.

        MOBILE crop is height-aware, and that is the whole trick. A phone gets the taller 4:3
        frame (more photograph, which is the point) ONLY when the viewport is tall enough to
        still finish with the button on screen. Below 700px of viewport height, an iPhone SE
        class device, it stays 16:9, because measurement showed 4:3 there pushes the CTA under
        the fold. Do not flatten this back to a single ratio without re-measuring at 375x667.
      */}
      <div className="relative w-full aspect-[16/9] [@media(min-height:700px)]:aspect-[4/3] md:aspect-auto md:flex-1 md:min-h-0 rounded-2xl overflow-hidden border border-crwn-elevated">
        <Image src={image} alt={imageAlt} fill priority sizes="(max-width: 768px) 100vw, 672px" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-crwn-bg/70 via-transparent to-transparent" />
      </div>

      {/* `shrink-0`: the copy takes the height it needs and the image yields, never the reverse. */}
      <div className="w-full shrink-0 flex flex-col items-center text-center">
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
      </div>
    </div>
  );
}
