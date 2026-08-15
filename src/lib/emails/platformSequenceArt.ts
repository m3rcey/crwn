// The banner each platform sequence carries, keyed by `trigger_type`.
//
// Founder decision 2026-08-15: the post-signup lifecycle emails are image-led too, matching the
// prospect nurture. The visual system itself (flat vector poster, the exact five-colour palette,
// who is shown and at what age, the 65/35 split, WebP over JPEG) is owned by CLAUDE.md
// "Brand Imagery" and is deliberately not restated here. Executable prompts live in
// `generate-platform-art.mjs`.
//
// KEYED BY SEQUENCE, NOT BY STEP, unlike the nurture set. The nurture emails are fifteen distinct
// beats of one argument, so each earns its own picture. A platform sequence is ONE argument
// escalating across two or three steps ("your page is empty" said three ways), so a per-step image
// would be three pictures of the same idea. The sequence is the unit of meaning here.
//
// SIX concepts serve TEN sequences. Reuse only where the argument is genuinely identical: the two
// Stripe sequences are the same blocked-payment picture, the two upgrade sequences are the same
// ceiling, and the two win-back sequences are the same still-open door.
//
// `nurture-return` is the ONE asset shared with the prospect set, because "the path is still lit"
// is the same picture for a churned artist as for a cold lead. Everything else is new: these are
// ACTIVATION arguments (money cannot reach you, nobody has joined yet, you are hitting a ceiling)
// and the nurture set argues fragmentation to someone who has no account at all.

export interface PlatformArt {
  /** File basename under /public, without extension. */
  id: string;
  src: string;
  /** Concise and meaningful. The email must still argue with images blocked. */
  alt: string;
  /** The belief this picture moves. Internal. */
  job: string;
  /** For the set-level 65/35 audit. */
  shows: 'male' | 'female' | 'none';
}

const A = <T extends Record<string, PlatformArt>>(x: T) => Object.freeze(x);

export const PLATFORM_ART = A({
  ladder: {
    id: 'platform-ladder',
    src: '/platform-ladder.webp',
    alt: 'Illustration of four ascending platforms, the lowest an open gold outline',
    job: 'There is a shape to this, and the first rung is free.',
    shows: 'male',
  },
  paymentGate: {
    id: 'platform-payment-gate',
    src: '/platform-payment-gate.webp',
    alt: 'Illustration of a gold conduit with one segment missing, the flow stopping at the gap',
    job: 'Everything is built except the part that lets money reach you.',
    shows: 'female',
  },
  emptyStage: {
    id: 'platform-empty-stage',
    src: '/platform-empty-stage.webp',
    alt: 'Illustration of an empty lit stage with an artist holding one glowing piece at the edge',
    job: 'The room is ready and there is nothing in it yet.',
    shows: 'male',
  },
  openTheDoor: {
    id: 'platform-open-the-door',
    src: '/platform-open-the-door.webp',
    alt: 'Illustration of a solid wall with one gold doorway opening in it',
    job: 'Fans have no way in until you make one.',
    shows: 'male',
  },
  firstYes: {
    id: 'platform-first-yes',
    src: '/platform-first-yes.webp',
    alt: 'Illustration of rows of empty seats with a single one lit gold',
    job: 'It only takes the first one.',
    shows: 'female',
  },
  ceilingLift: {
    id: 'platform-ceiling-lift',
    src: '/platform-ceiling-lift.webp',
    alt: 'Illustration of an artist pushing up a heavy bar to reveal gold light above',
    job: 'You are pressing against a limit you can lift.',
    shows: 'male',
  },
  /** Shared with the prospect nurture set. Same argument, same picture. */
  stillOpen: {
    id: 'nurture-return',
    src: '/nurture-return.webp',
    alt: 'Illustration of an artist facing a gold path that is still lit and open',
    job: 'The door stayed open.',
    shows: 'male',
  },
});

export type PlatformArtKey = keyof typeof PLATFORM_ART;

/**
 * Every sequence must appear here. `platformSequenceEmail.test.ts` asserts this map covers exactly
 * the live `trigger_type` set, so adding a sequence without art fails the suite rather than sending
 * a bare email.
 */
export const ART_BY_TRIGGER: Readonly<Record<string, PlatformArtKey>> = Object.freeze({
  new_signup: 'ladder',
  onboarding_incomplete: 'paymentGate',
  activation_no_track: 'emptyStage',
  activation_no_tiers: 'openTheDoor',
  activation_no_stripe: 'paymentGate',
  activation_no_subscribers: 'firstYes',
  starter_upgrade_nudge: 'ceilingLift',
  upgrade_abandoned: 'ceilingLift',
  paid_at_risk: 'stillOpen',
  paid_churned: 'stillOpen',
});

export const ALL_PLATFORM_ART: readonly PlatformArt[] = Object.freeze(Object.values(PLATFORM_ART));

/** The banner for a sequence, or null for an unknown trigger (the email still sends, without art). */
export function artForTrigger(trigger: string | null | undefined): PlatformArt | null {
  const key = trigger ? ART_BY_TRIGGER[trigger] : undefined;
  return key ? PLATFORM_ART[key] : null;
}
