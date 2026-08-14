/**
 * The brand photograph that opens each marketing section.
 *
 * Every one is an existing CRWN asset, shot to the house rules (near-black charcoal with warm gold
 * accent light, artists reading 18 to 32), and every one was reviewed before it was assigned here
 * rather than picked off a filename. The pairing is semantic, not decorative: the section about
 * fragmentation opens on an artist buried in paperwork, the path opens on a staircase climbing
 * into gold light, and the close opens on an artist surrounded by the fans the whole argument is
 * about.
 *
 * Reusing a `tool-*.jpg` outside its own tool page is intentional. These are mood photographs of
 * artists at work, not diagrams of a feature, so they carry the beat rather than the product, and
 * commissioning eleven more would buy nothing a reader could see.
 */
export interface SectionArt {
  src: string;
  alt: string;
}

export const SECTION_ART = {
  /**
   * "What this reveals", the per-tool section on a calculator page. Shared rather than set to the
   * tool's OWN hero photograph, because that photograph is already on this page: showing it twice
   * reads as an oversight. The doorway stays distinct through its copy, which is genuinely per-tool.
   */
  reveals: {
    src: '/tool-live-experience.jpg',
    alt: 'An artist singing alone to a camera in a dark room lit in gold',
  },
  /** Fragmentation: the cost of running the business across tools that cannot see the same fan. */
  problem: {
    src: '/tool-royalty-readiness.jpg',
    alt: 'An artist alone at a desk under a gold lamp, head in hand over scattered paperwork',
  },
  /** The five-step path: climbing out of the dark toward the light at the top. */
  path: {
    src: '/tool-fan-journey.jpg',
    alt: 'An artist climbing a dark stairwell toward a doorway of warm gold light',
  },
  /** The operating loop: one lit way forward instead of a dashboard of options. */
  operatingSystem: {
    src: '/tool-quest-path.jpg',
    alt: 'An artist standing in a long corridor lit by receding frames of gold light',
  },
  /** First Revenue Launch: someone working the desk alongside the artist, hands on. */
  launch: {
    src: '/tool-team-split.jpg',
    alt: 'Two artists working a mixing console together in a dark studio lit in gold',
  },
  /** What the product operates: the unglamorous daily work the system keeps track of. */
  operates: {
    src: '/tool-supporter-promise.jpg',
    alt: 'An artist writing in a notebook at a studio desk under a gold lamp',
  },
  /** Pricing: choosing the level you operate at, framed as a threshold. */
  pricing: {
    src: '/tool-founder-window.jpg',
    alt: 'An artist stepping out of a warmly lit studio doorway into a dark brick alley',
  },
  /** Questions: the artist facing the room. */
  questions: {
    src: '/tool-movement-page.jpg',
    alt: 'An artist singing under a single gold spotlight with the audience in silhouette',
  },
  /** The homepage close: the fans the entire argument was about. */
  close: {
    src: '/tool-top-fan.jpg',
    alt: 'An artist surrounded by a small group of fans in warm gold light',
  },
  /** The one fan economy beat on a calculator page: identifiable people, not a follower count. */
  oneEconomy: {
    src: '/tool-top-fan.jpg',
    alt: 'An artist surrounded by a small group of fans in warm gold light',
  },
  /**
   * The calculator close. Deliberately NOT the same photograph as `oneEconomy`, which already
   * renders higher up on that page: a page that shows one image twice looks like a mistake.
   */
  toolClose: {
    src: '/tool-movement-page.jpg',
    alt: 'An artist singing under a single gold spotlight with the audience in silhouette',
  },
} as const satisfies Record<string, SectionArt>;
