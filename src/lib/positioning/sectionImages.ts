/**
 * The artwork that opens each marketing section.
 *
 * Style: flat vector poster illustration, from a founder-supplied reference (2026-08-14). Bold
 * geometric colour blocks, a near-black silhouette figure with sculpted highlight planes, radiating
 * sunburst rays and repeating dot rows, hard vector edges, no gradients and no photorealism.
 *
 * The COMPOSITIONS are unchanged from the photographic set they replaced, deliberately: each one
 * was chosen to carry its section's beat, and the pairing is semantic rather than decorative. The
 * fragmentation section opens on an artist buried in paperwork, the path on a staircase climbing
 * into light, the operating loop on a corridor with one lit way forward, the assisted launch on
 * two people working a console together, and the close on an artist surrounded by the fans the
 * whole argument is about.
 *
 * PALETTE, the one deliberate adaptation from the reference: the reference runs bright red-orange,
 * and these sit on a #0D0D0D page beside #D4AF37 gold CTAs, where a second warm brand would fight
 * the first. So the style is the reference's and the palette is anchored on CRWN gold, amber and
 * burnt orange over near-black, which is the same warm family the reference works in.
 *
 * Every image was generated at 16:9 to match `SectionImage`, carries no text or logo, and was
 * reviewed individually before being assigned here: the house rule is that anyone shown is a Black
 * hip hop or R&B artist reading age 18 to 32, and that is checked by looking, not by prompting.
 */
export interface SectionArt {
  src: string;
  alt: string;
}

export const SECTION_ART = {
  /**
   * "What this reveals", the per-tool section on a calculator page. Shared rather than set to the
   * tool's OWN hero image, because that image is already on this page: showing it twice reads as
   * an oversight. The doorway stays distinct through its copy, which is genuinely per-tool.
   */
  reveals: {
    src: '/section-reveals.jpg',
    alt: 'Illustration of an artist singing to a camera under a hard gold key light',
  },
  /** Fragmentation: the cost of running the business across tools that cannot see the same fan. */
  problem: {
    src: '/section-problem.jpg',
    alt: 'Illustration of an artist at a desk, head in hand over scattered paperwork under a gold lamp',
  },
  /** The five-step path: climbing out of the dark toward the light at the top. */
  path: {
    src: '/section-path.jpg',
    alt: 'Illustration of an artist climbing a staircase toward a bright gold doorway',
  },
  /** The operating loop: one lit way forward instead of a dashboard of options. */
  operatingSystem: {
    src: '/section-operating-system.jpg',
    alt: 'Illustration of an artist in a corridor of receding gold light frames',
  },
  /** First Revenue Launch: someone working the desk alongside the artist, hands on. */
  launch: {
    src: '/section-launch.jpg',
    alt: 'Illustration of two artists working a mixing console together',
  },
  /** What the product operates: the unglamorous daily work the system keeps track of. */
  operates: {
    src: '/section-operates.jpg',
    alt: 'Illustration of an artist writing in a notebook at a studio desk beside a microphone',
  },
  /** Pricing: choosing the level you operate at, framed as a threshold. */
  pricing: {
    src: '/section-pricing.jpg',
    alt: 'Illustration of an artist stepping through a doorway of warm gold light',
  },
  /** Questions: the artist facing the room. */
  questions: {
    src: '/section-questions.jpg',
    alt: 'Illustration of an artist singing under a gold spotlight above an audience in silhouette',
  },
  /** The homepage close: the fans the entire argument was about. */
  close: {
    src: '/section-close.jpg',
    alt: 'Illustration of an artist surrounded by a close group of fans in gold light',
  },
  /** The one fan economy beat on a calculator page: identifiable people, not a follower count. */
  oneEconomy: {
    src: '/section-close.jpg',
    alt: 'Illustration of an artist surrounded by a close group of fans in gold light',
  },
  /**
   * The calculator close. Deliberately NOT the same image as `oneEconomy`, which already renders
   * higher up on that page: a page that shows one image twice looks like a mistake.
   */
  toolClose: {
    src: '/section-questions.jpg',
    alt: 'Illustration of an artist singing under a gold spotlight above an audience in silhouette',
  },
} as const satisfies Record<string, SectionArt>;
