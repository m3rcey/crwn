// The nurture creative system: one canonical registry binding each email to its banner.
//
// FOUNDER DECISION (2026-08-15): prospect nurture is an image-led CRWN editorial campaign, not a
// SaaS drip with a decorative header. Every shipping nurture email renders a banner ABOVE its copy,
// and the artwork carries a persuasion job rather than decoration.
//
// The visual system itself (flat vector poster art, the exact five-colour palette, who is shown and
// at what age, the 65/35 gender split across a set, WebP over JPEG) is owned by CLAUDE.md
// "Brand Imagery". It is deliberately NOT restated here. The executable generation prompts live in
// `generate-nurture-art.mjs`; the human-readable manifest is
// `docs/acquisition/nurture-creative-manifest.md`.
//
// TWELVE concepts serve SIXTEEN emails. That is intentional (see the manifest): a set of reusable
// creative CONCEPTS beats both extremes, 16 near-duplicate portraits and one hero on everything. An
// asset is reused only where the persuasion job genuinely repeats, never because it is gold.

/** How the composition argues, not how it looks. Used by the manifest and the drift test. */
export type ArtComposition =
  | 'hero' //           one subject, one idea
  | 'contrast' //       two states side by side in one frame
  | 'transformation' // the same material, disordered then ordered
  | 'journey' //        connected stages advancing
  | 'objection'; //     the feared outcome answered by the safer alternative

export interface NurtureArt {
  /** Stable id. Also the file basename: `/{id}.webp`. Never renumber. */
  id: string;
  /** Public path. Absolute-from-root so the email can prefix it with APP_URL. */
  src: string;
  /** Concise, meaningful. The email must still argue with images blocked. */
  alt: string;
  /** The belief this picture is here to move. Internal. */
  job: string;
  composition: ArtComposition;
  /** Gender of the artist shown, for the set-level 65/35 audit. `none` = no person. */
  shows: 'male' | 'female' | 'none';
}

const A = <T extends Record<string, NurtureArt>>(x: T) => Object.freeze(x);

export const NURTURE_ART = A({
  discovery: {
    id: 'nurture-discovery',
    src: '/nurture-discovery.webp',
    alt: 'Illustration of an artist watching scattered marks converge into a single bright point',
    job: 'The calculator found something real, and the scatter has a shape.',
    composition: 'hero',
    shows: 'male',
  },
  fragmentation: {
    id: 'nurture-fragmentation',
    src: '/nurture-fragmentation.webp',
    alt: 'Illustration of an artist surrounded by five separate clusters with no lines between them',
    job: 'The problem is not selling. It is that nothing is connected.',
    composition: 'hero',
    shows: 'female',
  },
  firstMove: {
    id: 'nurture-first-move',
    src: '/nurture-first-move.webp',
    alt: 'Illustration of an artist facing seven paths with one lit in gold',
    job: 'There is one sensible first move, and it is already chosen.',
    composition: 'hero',
    shows: 'male',
  },
  provenBuyers: {
    id: 'nurture-proven-buyers',
    src: '/nurture-proven-buyers.webp',
    alt: 'Illustration of a small bright cluster of fans highlighted inside a vast dim crowd',
    job: 'You already have buyers. They are just invisible right now.',
    composition: 'contrast',
    shows: 'female',
  },
  oneRecord: {
    id: 'nurture-one-record',
    src: '/nurture-one-record.webp',
    alt: 'Illustration of an artist at the centre of six connected shapes joined by gold lines',
    job: 'The mechanism: one fan record with every sale attached to it.',
    composition: 'hero',
    shows: 'male',
  },
  parallelBridge: {
    id: 'nurture-parallel-bridge',
    src: '/nurture-parallel-bridge.webp',
    alt: 'Illustration of two intact structures joined by a single gold bridge',
    job: 'Nothing gets torn down. The new thing runs alongside the old.',
    composition: 'objection',
    shows: 'male',
  },
  onePiece: {
    id: 'nurture-one-piece',
    src: '/nurture-one-piece.webp',
    alt: 'Illustration of an artist placing one small gold block into an almost finished structure',
    job: 'The ask is one piece, not a rebuild.',
    composition: 'objection',
    shows: 'female',
  },
  stackCollapse: {
    id: 'nurture-stack-collapse',
    src: '/nurture-stack-collapse.webp',
    alt: 'Illustration of a cluttered leaning stack consolidating into one clean gold form',
    job: 'This replaces tools rather than adding one more.',
    composition: 'transformation',
    shows: 'male',
  },
  compounding: {
    id: 'nurture-compounding',
    src: '/nurture-compounding.webp',
    alt: 'Illustration of four linked stages each larger and brighter than the last',
    job: 'Offers feed each other when the buyer is remembered.',
    composition: 'journey',
    shows: 'male',
  },
  ownership: {
    id: 'nurture-ownership',
    src: '/nurture-ownership.webp',
    alt: 'Illustration contrasting a vast unconnected crowd with a few direct gold connections',
    job: 'Owning the relationship is different from renting the attention.',
    composition: 'contrast',
    shows: 'female',
  },
  transformation: {
    id: 'nurture-transformation',
    src: '/nurture-transformation.webp',
    alt: 'Illustration of scattered fragments on one side and the same pieces ordered on the other',
    job: 'Same fans, same effort, different plumbing.',
    composition: 'transformation',
    shows: 'male',
  },
  returning: {
    id: 'nurture-return',
    src: '/nurture-return.webp',
    alt: 'Illustration of an artist facing a gold path that is still lit and open',
    job: 'The door stayed open, and the numbers have moved since.',
    composition: 'journey',
    shows: 'male',
  },
});

export type NurtureArtKey = keyof typeof NURTURE_ART;

export const ALL_NURTURE_ART: readonly NurtureArt[] = Object.freeze(Object.values(NURTURE_ART));

/** Resolve an art key to an absolute URL for an email. Returns null for an unknown key. */
export function artUrl(art: NurtureArt | undefined, appUrl: string): string | null {
  if (!art) return null;
  return `${appUrl.replace(/\/+$/, '')}${art.src}`;
}
