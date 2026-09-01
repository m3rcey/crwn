// The four pre-signup VSLs, as data.
//
// One identifier, reused: a slug here IS the slide-deck id in scripts/vsl/decks/, which is also the
// PNG folder under videos/vsl/ and the poster filename under public/vsl/. Renaming one renames
// nothing else, so do not rename any of them.
//
// `url` is the whole gate. It is null until a rendered MP4 is actually hosted, and every consumer
// treats null as "this video does not exist yet": the email block renders nothing, the watch page
// does not list it, and /watch/<slug> is a 404. That is deliberate. The emails ship before the
// videos are cut, so the failure mode of shipping early has to be an email that reads exactly as it
// does today, never a broken thumbnail in a real lead's inbox. Turning one on is one line.

export interface Vsl {
  /** Stable id, shared with the slide deck. Never rename. */
  slug: string;
  /** Position in the series, used for ordering and the "N of 4" label. */
  n: number;
  title: string;
  /** The question the video answers, in the lead's own words. Used as the list line. */
  question: string;
  /** Runtime in minutes, measured with ffprobe against the cut. 0 means not cut yet. */
  minutes: number;
  /** Absolute or app-relative poster image. Slide 01 of the deck is literally the opening frame. */
  poster: string;
  /** Hosted MP4. NULL until it exists. See the note above: null means "not live", everywhere. */
  url: string | null;
}

export const VSLS: Vsl[] = [
  {
    slug: 'vsl-1-fan-worth',
    n: 1,
    title: 'How much is one real fan actually worth?',
    question: 'Why the number is bigger than a follower count suggests.',
    minutes: 9,
    poster: '/vsl/vsl-1-fan-worth.webp',
    url: 'https://pub-490263a6ac304986851fbf65e6f3ff13.r2.dev/vsl/vsl-1-fan-worth.mp4',
  },
  {
    slug: 'vsl-2-what-fans-pay-for',
    n: 2,
    title: 'What would your fans actually pay for?',
    question: 'How to decide what goes inside the offer without guessing.',
    minutes: 9,
    poster: '/vsl/vsl-2-what-fans-pay-for.webp',
    url: 'https://pub-490263a6ac304986851fbf65e6f3ff13.r2.dev/vsl/vsl-2-what-fans-pay-for.mp4',
  },
  {
    slug: 'vsl-3-first-100-fans',
    n: 3,
    title: "How I'd launch a membership to your first 100 fans",
    question: 'Who should see the offer first, and in what order.',
    minutes: 9,
    poster: '/vsl/vsl-3-first-100-fans.webp',
    url: 'https://pub-490263a6ac304986851fbf65e6f3ff13.r2.dev/vsl/vsl-3-first-100-fans.mp4',
  },
  {
    slug: 'vsl-4-if-nobody-buys',
    n: 4,
    title: 'What happens if nobody buys?',
    question: 'What CRWN does differently when the first launch produces nothing.',
    minutes: 6,
    poster: '/vsl/vsl-4-if-nobody-buys.webp',
    url: 'https://pub-490263a6ac304986851fbf65e6f3ff13.r2.dev/vsl/vsl-4-if-nobody-buys.mp4',
  },
];

/**
 * The Calculator VSL. Deliberately NOT in `VSLS`.
 *
 * It is a different job: the four in the series are the pre-signup nurture drip, this one plays on
 * the calculator result page for someone who just saw their number and is deciding whether to
 * believe it. Keeping it out of `VSLS` keeps it out of `liveVsls()`, so it never appears in the
 * nurture rail and is never counted as one of the four.
 */
export const CALCULATOR_VSL: Vsl = {
  slug: 'vsl-calculator',
  n: 0,
  title: 'Why your number is what it is',
  question: 'The full walk through of how the estimate is built, and what it is not.',
  minutes: 16,
  poster: '/vsl/vsl-calculator.webp',
  url: 'https://pub-490263a6ac304986851fbf65e6f3ff13.r2.dev/vsl/vsl-calculator.mp4',
};

/** Everything the watch route can resolve: the nurture series plus the calculator explainer. */
export const ALL_VSLS: Vsl[] = [...VSLS, CALCULATOR_VSL];

/** One VSL by slug, whether or not it is live. Searches the series AND the calculator explainer. */
export function getVsl(slug: string): Vsl | null {
  return ALL_VSLS.find((v) => v.slug === slug) ?? null;
}

/**
 * A VSL is LIVE only when a hosted video URL exists. Everything user-facing asks this, never
 * `getVsl` alone, so an unhosted video cannot reach a lead through any surface.
 */
export function isVslLive(v: Vsl | null): v is Vsl {
  return Boolean(v && v.url);
}

/**
 * The live NURTURE SERIES, in order. This is what the watch page's rail lists, so it deliberately
 * excludes the calculator explainer: that video is not one of the four and listing it would make
 * the "N of 4" counter lie.
 */
export function liveVsls(): Vsl[] {
  return VSLS.filter(isVslLive);
}

/** The watch-page URL for a VSL. Relative, so an email caller prefixes the app origin. */
export function watchPath(slug: string): string {
  return `/watch/${slug}`;
}
