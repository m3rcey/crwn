// Fan Testimonials — the pure brain. No I/O, no Supabase, no React.
//
// Canonical architecture: docs/crwn-brain/27-AUTOMATED-FAN-TESTIMONIALS-ARCHITECTURE.md
//
// A CRWN fan testimonial is a voluntary written statement, submitted by an AUTHENTICATED fan
// about a specific artist, stored with an explicit permission scope and an IMMUTABLE body.
// The artist controls whether it is displayed. The fan owns the statement.
//
// Everything in this file is deterministic and tested (core.test.ts). The server modules and the
// UI import from here so there is exactly ONE definition of: who is eligible, what a verification
// badge may say, and what leaves the server on a public page.

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** The two V1 triggers. Adding a third is a product decision, not a config change. */
export type TestimonialTrigger = 'promise_fulfilled' | 'member_30d';

/** What the statement is ABOUT. Null means "this artist generally". */
export type TestimonialContextKind = 'promise' | 'membership';

export type TestimonialRequestStatus = 'pending' | 'submitted' | 'declined' | 'expired';

/**
 * Publication permission. `external` (press kits, socials, paid media) is deliberately NOT a V1
 * value: it is a materially different right, and collecting a right the product cannot exercise is
 * dead weight with legal surface attached. Widening a stored scope always requires asking the fan
 * again, so this enum only ever narrows in place.
 */
export type ConsentScope = 'private_to_artist' | 'crwn_only';

/** How the fan chose to be shown. Two options, not four (see pickDisplayName). */
export type DisplayIdentity = 'display_name' | 'anonymous';

export type ModerationStatus = 'auto_ok' | 'flagged' | 'blocked';

/**
 * What a badge may say. Every value is BINARY or BUCKETED: none of them carries an amount, a
 * price, or a tier name, which is what makes the public payload non-invertible (see
 * deriveVerification).
 */
export type VerificationKind = 'founding_supporter' | 'paid_supporter' | 'supporter' | 'none';

// ---------------------------------------------------------------------------
// Timing constants
// ---------------------------------------------------------------------------

/** T2: one full billing cycle of experienced value before we ask. */
export const TENURE_TRIGGER_DAYS = 30;
/** T1: let the fan actually consume the delivered promise before we ask about it. */
export const PROMISE_TRIGGER_DELAY_DAYS = 3;
/** An unanswered ask stops being a live question. */
export const REQUEST_EXPIRY_DAYS = 30;
/** One ask per fan per artist per half year, across all triggers. */
export const REQUEST_COOLDOWN_DAYS = 180;
/** Bounded public render. V1 needs no pagination. */
export const MAX_PUBLIC_TESTIMONIALS = 6;

export const BODY_MIN_LENGTH = 2;
export const BODY_MAX_LENGTH = 600;

const DAY_MS = 86_400_000;

function daysBetween(fromIso: string, now: Date): number {
  const t = new Date(fromIso).getTime();
  if (Number.isNaN(t)) return Number.NaN;
  return (now.getTime() - t) / DAY_MS;
}

// ---------------------------------------------------------------------------
// Questions. DATA, never generated.
// ---------------------------------------------------------------------------
//
// The row stores `prompt_key`, not the rendered sentence, so rewording a question later does not
// orphan stored rows and a future consumer can group by what was actually asked.
//
// Copy rule (CLAUDE.md): no em dashes. These are read by fans.

export const TESTIMONIAL_PROMPTS: Record<TestimonialTrigger, { key: TestimonialTrigger; question: string }> = {
  promise_fulfilled: {
    key: 'promise_fulfilled',
    question: 'You just got something you were promised. What did you think?',
  },
  member_30d: {
    key: 'member_30d',
    question:
      'You have been on the inside for a month now. What do you get here that you do not get from just following along?',
  },
};

export function questionFor(trigger: TestimonialTrigger): string {
  return TESTIMONIAL_PROMPTS[trigger]?.question ?? TESTIMONIAL_PROMPTS.member_30d.question;
}

// ---------------------------------------------------------------------------
// Trigger eligibility (pure date math; the server supplies the facts)
// ---------------------------------------------------------------------------

/**
 * T2 — thirty days paid and STILL active.
 *
 * `status` is the live subscription status, so a fan who cancelled at day 20 never qualifies, and
 * one who cancels at day 40 stops qualifying. `isPaidTier` is a BOOLEAN on purpose: this function
 * must never see a price (see deriveVerification).
 */
export function isTenureTriggerDue(input: {
  startedAt: string | null;
  status: string | null;
  isPaidTier: boolean;
  now: Date;
}): boolean {
  if (!input.isPaidTier) return false;
  if (input.status !== 'active') return false;
  if (!input.startedAt) return false;
  const days = daysBetween(input.startedAt, input.now);
  return Number.isFinite(days) && days >= TENURE_TRIGGER_DAYS;
}

/**
 * T1 — a fan promise was delivered, and the delay has elapsed.
 *
 * `isFanPromise` MUST come from src/lib/fulfillment.ts (isFanPromiseEvent). A fulfillment row
 * carrying metadata.ramp_step_key is a Revenue Ramp step, an artist's own business task, and
 * asking a fan to comment on it would be incoherent as well as a ratified invariant violation.
 */
export function isPromiseTriggerDue(input: {
  status: string | null;
  completedAt: string | null;
  isFanPromise: boolean;
  fanIsEligibleForObligation: boolean;
  now: Date;
}): boolean {
  if (!input.isFanPromise) return false;
  if (!input.fanIsEligibleForObligation) return false;
  if (input.status !== 'completed') return false;
  if (!input.completedAt) return false;
  const days = daysBetween(input.completedAt, input.now);
  return Number.isFinite(days) && days >= PROMISE_TRIGGER_DELAY_DAYS;
}

/**
 * The cross-trigger gate, applied on top of the database's uniqueness constraints.
 *
 * The DB enforces "one outstanding request" and "never twice for the same trigger" as indexes,
 * because a rule enforced only in application code is a rule two concurrent cron runs can break.
 * This function is the readable statement of the same policy plus the parts an index cannot express.
 */
export function mayCreateRequest(input: {
  automationEnabled: boolean;
  hasOutstandingRequest: boolean;
  hasRequestForThisTrigger: boolean;
  hasSubmittedForArtist: boolean;
  lastRequestAt: string | null;
  now: Date;
}): boolean {
  if (!input.automationEnabled) return false;
  if (input.hasOutstandingRequest) return false;
  if (input.hasRequestForThisTrigger) return false;
  // A fan who already gave this artist a testimonial is not asked again in V1.
  if (input.hasSubmittedForArtist) return false;
  if (input.lastRequestAt) {
    const days = daysBetween(input.lastRequestAt, input.now);
    if (Number.isFinite(days) && days < REQUEST_COOLDOWN_DAYS) return false;
  }
  return true;
}

export function requestExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + REQUEST_EXPIRY_DAYS * DAY_MS);
}

// ---------------------------------------------------------------------------
// Verification. Derived from live evidence, never stored as a label, never client-supplied.
// ---------------------------------------------------------------------------

/**
 * Relationship evidence, as the SERVER reads it right now.
 *
 * Note what this interface cannot express: a price, an amount, a tier name, a tier id, a purchase
 * count, a lifetime value. That is not an oversight, it is the mechanism. `leaderboardPrivacy.ts`
 * exists because a redaction was defeated by the fields shipped beside it; here the sensitive
 * field never enters the function, so no combination of outputs can reconstruct it.
 */
export interface VerificationEvidence {
  /** subscriptions.status === 'active' for this (fan, artist). */
  active: boolean;
  /** The tier they are on costs more than zero. A BOOLEAN, never the price. */
  isPaidTier: boolean;
  /** subscriptions.is_founder — the Founder Window's permanent mark. */
  isFounder: boolean;
  /** subscriptions.started_at, or null when the relationship is gone. */
  startedAt: string | null;
}

/**
 * The badge, re-derived on every render.
 *
 * This is why the row stores an evidence POINTER rather than a snapshot: a refund, a chargeback or
 * a deleted subscription silently degrades the claim instead of leaving a stale one in public.
 * A cancelled member keeps their words and loses the present-tense badge, which is truthful: the
 * statement was true when written, the membership is not true now.
 */
export function deriveVerification(ev: VerificationEvidence | null): VerificationKind {
  if (!ev) return 'none';
  if (!ev.active) return 'none';
  if (ev.isFounder) return 'founding_supporter';
  if (ev.isPaidTier) return 'paid_supporter';
  return 'supporter';
}

export const VERIFICATION_LABEL: Record<VerificationKind, string | null> = {
  founding_supporter: 'Founding supporter',
  paid_supporter: 'Verified supporter',
  supporter: 'Member',
  none: null,
};

/**
 * Coarse tenure buckets.
 *
 * THE PAIR RULE. Tier name and tenure are each safe alone and are a spend disclosure together:
 * "Gold member for 8 months" beside a public $25/month price is roughly $200 of lifetime spend,
 * which is exactly the invertibility defect leaderboardPrivacy.ts was written to prevent. The
 * public payload therefore carries tenure and NO tier, and buckets rather than an exact date so
 * even the tenure half is imprecise.
 */
export function tenureBucketLabel(startedAt: string | null, now: Date): string | null {
  if (!startedAt) return null;
  const days = daysBetween(startedAt, now);
  if (!Number.isFinite(days) || days < 0) return null;
  if (days >= 365) return 'Supporter for over a year';
  if (days >= 180) return 'Supporter for 6+ months';
  if (days >= 90) return 'Supporter for 3+ months';
  return null; // Under 3 months says nothing useful and narrows the window on a join date.
}

// ---------------------------------------------------------------------------
// Display identity
// ---------------------------------------------------------------------------

/**
 * Two options, not four.
 *
 * profiles.display_name is PUBLIC and historically defaulted to the signup email, so a naive
 * "show their name" would publish fan email addresses on artist pages. `isEmailLike` in
 * src/lib/publicName.ts is the existing guard and is the one this defers to; the caller passes the
 * already-guarded result so this module stays free of imports.
 *
 * "First name plus last initial" was rejected: CRWN stores no structured name, so it would be a
 * split on display_name, which is fragile and can still leak an email local-part.
 */
export function pickDisplayName(input: {
  identity: DisplayIdentity;
  displayName: string | null;
  displayNameIsPresentable: boolean;
}): string | null {
  if (input.identity !== 'display_name') return null;
  if (!input.displayNameIsPresentable) return null; // forced anonymous rather than leaking an email
  const trimmed = (input.displayName ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

// ---------------------------------------------------------------------------
// Publication eligibility. ONE definition, used by the API, the library and the drift tests.
// ---------------------------------------------------------------------------

export interface TestimonialVisibilityState {
  consentScope: ConsentScope;
  featuredAt: string | null;
  hiddenAt: string | null;
  withdrawnAt: string | null;
  moderationStatus: ModerationStatus;
}

/**
 * May this testimonial be rendered to the public?
 *
 * ALL of these must hold, and the consent clause is load-bearing: automatic COLLECTION is not
 * automatic PUBLICATION, and an artist featuring a response the fan marked private must never
 * publish it. Featured-alone is the mutation that consentRegression proves fails.
 */
export function isTestimonialPubliclyEligible(s: TestimonialVisibilityState): boolean {
  if (s.consentScope !== 'crwn_only') return false;
  if (!s.featuredAt) return false;
  if (s.hiddenAt) return false;
  if (s.withdrawnAt) return false;
  if (s.moderationStatus !== 'auto_ok') return false;
  return true;
}

/**
 * EXACTLY what a public caller receives. Adding a field here is a privacy decision.
 *
 * Deliberately absent, and required to stay absent: fanId, fan email, tier id, tier NAME, tier
 * price, any amount, subscription id, the evidence pointer, consent internals, moderation state,
 * and an exact join date.
 */
export interface PublicTestimonial {
  id: string;
  artistId: string;
  /** The fan's exact words. Never edited by CRWN or by the artist. */
  body: string;
  /** null renders as the anonymous label; it is not a missing value. */
  displayName: string | null;
  /** null means "show no badge", which is what an invalidated relationship produces. */
  verificationLabel: string | null;
  /** null under three months, on purpose. */
  tenureLabel: string | null;
  submittedAt: string;
  contextKind: TestimonialContextKind | null;
}

/** The anonymous byline. A fan who hides their name is still a verified human. */
export const ANONYMOUS_DISPLAY_LABEL = 'A verified supporter';

/**
 * Project one stored row plus live evidence into the public payload.
 *
 * Returns null when the row is not publicly eligible, so a caller cannot accidentally publish by
 * forgetting to filter: the projection IS the filter.
 */
export function toPublicTestimonial(input: {
  id: string;
  artistId: string;
  body: string;
  submittedAt: string;
  contextKind: TestimonialContextKind | null;
  identity: DisplayIdentity;
  displayName: string | null;
  displayNameIsPresentable: boolean;
  visibility: TestimonialVisibilityState;
  evidence: VerificationEvidence | null;
  now: Date;
}): PublicTestimonial | null {
  if (!isTestimonialPubliclyEligible(input.visibility)) return null;

  const kind = deriveVerification(input.evidence);
  return {
    id: input.id,
    artistId: input.artistId,
    body: input.body,
    displayName: pickDisplayName({
      identity: input.identity,
      displayName: input.displayName,
      displayNameIsPresentable: input.displayNameIsPresentable,
    }),
    verificationLabel: VERIFICATION_LABEL[kind],
    // Tenure is PRESENT TENSE ("Supporter for 6+ months"), so it dies with the badge. A fan who
    // cancelled keeps their words and loses both claims about the relationship, which is truthful:
    // the statement was true when written, the membership is not true now. This also keeps the
    // TypeScript projection and the fan_testimonials_public view saying the same thing; they
    // disagreed here once, and the view was the one that was right.
    tenureLabel: kind === 'none' ? null : tenureBucketLabel(input.evidence?.startedAt ?? null, input.now),
    submittedAt: input.submittedAt,
    contextKind: input.contextKind,
  };
}

// ---------------------------------------------------------------------------
// Submission validation. Deterministic. No model, no sentiment, no classifier.
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/gi;

export interface BodyValidation {
  ok: boolean;
  body: string;
  /** True when a link was removed, so the UI can tell the fan rather than silently editing them. */
  linksRemoved: boolean;
  error: string | null;
}

/**
 * Normalize and bound a submitted testimonial.
 *
 * Links are STRIPPED, not rejected: rejecting loses the whole statement over one URL, and the fan
 * is told. Nothing here judges the CONTENT of the opinion. A critical response is a valid response
 * (see the negative-feedback path: it simply arrives with consent unchecked and is never publishable).
 *
 * XSS is not defended here, because escaping is a RENDERING control, not a storage one: CRWN
 * renders through React, which escapes, and no application file uses dangerouslySetInnerHTML.
 * Storing the fan's exact characters is what keeps the quote honest.
 */
export function validateTestimonialBody(raw: unknown): BodyValidation {
  if (typeof raw !== 'string') {
    return { ok: false, body: '', linksRemoved: false, error: 'Write a short answer first.' };
  }
  const stripped = raw.replace(CONTROL_CHARS, '');
  const delinked = stripped.replace(URL_PATTERN, '');
  const linksRemoved = delinked !== stripped;
  const body = delinked.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  if (body.length < BODY_MIN_LENGTH) {
    return { ok: false, body, linksRemoved, error: 'Write a short answer first.' };
  }
  if (body.length > BODY_MAX_LENGTH) {
    return {
      ok: false,
      body,
      linksRemoved,
      error: `Keep it under ${BODY_MAX_LENGTH} characters.`,
    };
  }
  return { ok: true, body, linksRemoved, error: null };
}

/** The consent checkbox, expressed as the stored scope. Unchecked is a real, valid answer. */
export function consentScopeFrom(allowPublicDisplay: unknown): ConsentScope {
  return allowPublicDisplay === true ? 'crwn_only' : 'private_to_artist';
}

/** Narrow an untrusted identity choice. Anything unrecognized falls to the safer option. */
export function displayIdentityFrom(value: unknown): DisplayIdentity {
  return value === 'display_name' ? 'display_name' : 'anonymous';
}
