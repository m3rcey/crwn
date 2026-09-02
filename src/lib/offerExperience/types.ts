// The Tier Offer Experience: how a tier's value is PRESENTED before purchase.
//
// THE ARCHITECTURAL LINE, stated once and enforced everywhere: subscription_tiers and the
// canonical entitlement oracle define WHAT A FAN GETS. This config defines how that value
// is shown and demonstrated BEFORE they buy. Nothing in this file can grant, widen, or
// imply an entitlement: there is no tier id to point at content, no price field, no
// benefit flag. It is words, ordered previews, and references to media the artist already
// owns. The future Offer Builder writes THIS shape; the renderer reads it; entitlement
// truth never passes through it.
//
// REAL vs EXAMPLE is a field, not a convention. Every preview carries `truth`, and the
// renderer prints the "Example experience" disclosure from that field, so honesty cannot
// depend on a developer remembering a label. The normalizer refuses a preview without it.

/** The preview vocabulary. Small on purpose: each kind is one way of making a benefit
 *  tangible, and several benefits share a shape (Vault and member music are both
 *  'collection'; a beat and a vocal submission are both 'submission'). */
export const PREVIEW_KINDS = [
  'audio',       // a playable-looking track representation (never protected bytes)
  'video',       // BTS / session / commentary poster representation
  'image',       // BTS shot, screenshot, artwork
  'decision',    // A/B/C vote demonstration
  'submission',  // submit-for-consideration demonstration
  'collection',  // Vault-like grid of items
  'timeline',    // project journey: beat -> hook -> verse -> cover -> release
  'session',     // Executive Producer Session / event card
  'window',      // submission window: open / upcoming / closed
  'status',      // member badge / recognition treatment
] as const;
export type PreviewKind = (typeof PREVIEW_KINDS)[number];

/** REAL: an actual artist asset or CRWN experience. EXAMPLE: a demonstration of what the
 *  benefit can look like, clearly disclosed as such on the page. */
export type PreviewTruth = 'real' | 'example';

export interface DecisionOption {
  label: string;
  sublabel?: string;
}

export interface CollectionItem {
  title: string;
  subtitle?: string;
  /** Rendered with the member-lock treatment. Presentation only; the oracle still gates. */
  locked?: boolean;
  /** Public artwork URL the artist already exposes (album art). Never audio. */
  artUrl?: string;
}

export interface TimelineStep {
  label: string;
  /** Where THIS tier participates. */
  participates?: boolean;
}

export interface SubmissionField {
  label: string;
  placeholder?: string;
}

export interface OfferPreview {
  kind: PreviewKind;
  truth: PreviewTruth;
  title: string;
  description?: string;
  /** decision */
  options?: DecisionOption[];
  /** collection */
  items?: CollectionItem[];
  /** timeline */
  steps?: TimelineStep[];
  /** submission */
  fields?: SubmissionField[];
  /** submission / decision demo action label, e.g. "Submit for consideration" */
  actionLabel?: string;
  /** status */
  badge?: string;
  /** window */
  windowState?: 'open' | 'upcoming' | 'closed';
  /** image/video/audio/session poster. PUBLIC urls only; the normalizer refuses
   *  anything that looks like signed or private storage. */
  posterUrl?: string;
}

export interface OfferVsl {
  /** Hosted mp4. NULL means no video exists yet, and per the ratified VSL-catalog rule
   *  (src/lib/vsl/catalog.ts) null renders NOTHING fan-facing: a sales page must never
   *  show a broken or promissory video slot to a real fan. */
  url: string | null;
  posterUrl?: string;
  /** True when the video is stand-in content the artist did not record (e.g. a CRWN
   *  example video). The renderer prints an "Example video" chip from this field. */
  isPlaceholder?: boolean;
}

export interface OfferFaq {
  q: string;
  a: string;
}

export interface TierOfferExperience {
  /** The tier promise, e.g. "Put your own ideas in the room while GB is creating." */
  promise: string;
  /** One or two supporting sentences under the promise. */
  description: string;
  /** The benefit-based CTA. A universal CRWN sales rule: never "Join <tier>"; the button
   *  answers "what do I get by doing this?". The artist will eventually edit this in the
   *  Offer Builder; validation lives in the normalizer. */
  cta: string;
  /** e.g. "See what you get" (the down-cue). */
  secondaryCue?: string;
  vsl?: OfferVsl;
  /** Merchandising order, deliberately independent of entitlement order. */
  previews: OfferPreview[];
  /** The inherited-value strip: heading + compact category lines. Presentation of
   *  canonical cumulative entitlements, never a second source of them. */
  inherited?: { heading: string; items: string[] };
  faqs?: OfferFaq[];
}

/** Bounds. The normalizer enforces these so a stored config can never bloat a page. */
export const OFFER_LIMITS = {
  promise: 120,
  description: 300,
  cta: 40,
  secondaryCue: 40,
  previewTitle: 80,
  previewDescription: 280,
  maxPreviews: 12,
  maxOptions: 4,
  maxItems: 6,
  maxSteps: 6,
  maxFields: 4,
  maxFaqs: 8,
  faqQ: 120,
  faqA: 500,
  maxInherited: 8,
  inheritedItem: 90,
} as const;
