// Song Lab — pure domain logic for GB The G1ft's fan co-creation experiment.
//
// Schema: supabase/schema-phase2-song-lab.sql. Everything here is deterministic and
// side-effect free so it can be tested in node without a database. The routes are thin
// wrappers over these functions; do not re-derive any of this in a component.
//
// Ratified rules this module encodes:
// - A decision is ADVISORY. Tallies inform; the ARTIST picks the winner. Nothing here
//   auto-finalizes a decision from vote counts.
// - Eligibility mirrors the platform's one entitlement vocabulary: is_free means any
//   signed-in fan; otherwise the fan's active tier must appear in allowed_tier_ids
//   (exact match, no tier inheritance — same as hasTierAccess in src/lib/live/access.ts).
// - Recognition is Special-Thanks-class only. RECOGNITION_DISCLAIMER is the one copy of
//   the legal boundary and every recognition surface renders it.

export interface DecisionOption {
  id: string;
  label: string;
}

export type DecisionStatus = 'draft' | 'open' | 'closed';

export interface SongLabDecisionCore {
  status: DecisionStatus;
  options: DecisionOption[];
  is_free: boolean;
  allowed_tier_ids: string[];
  opens_at: string | null;
  closes_at: string | null;
  winning_option_id: string | null;
}

/** What a decision is actually doing right now, windows included. */
export type EffectiveStatus = 'draft' | 'scheduled' | 'open' | 'closed';

export const MAX_OPTIONS = 4;
export const MIN_OPTIONS = 2;
export const MAX_LABEL_LENGTH = 120;
export const MAX_TITLE_LENGTH = 120;
export const MAX_HEADLINE_LENGTH = 140;
export const MAX_DESCRIPTION_LENGTH = 600;

/**
 * The one copy of the recognition legal boundary. Rendered on every Song Lab surface that
 * names a fan's participation. No em dashes (copy rule).
 */
export const RECOGNITION_DISCLAIMER =
  'Participation and recognition here are community thanks only. They do not grant or imply ' +
  'songwriting, production, or ownership credit, publishing, royalties, revenue, approval ' +
  'rights, or creative control.';

/**
 * Derive what the decision is doing right now. Status is the artist's word; the time
 * windows only ever NARROW it (a closed decision never reopens because closes_at moved).
 */
export function effectiveStatus(d: SongLabDecisionCore, now: Date): EffectiveStatus {
  if (d.status === 'draft') return 'draft';
  if (d.status === 'closed') return 'closed';
  if (d.opens_at && new Date(d.opens_at).getTime() > now.getTime()) return 'scheduled';
  if (d.closes_at && new Date(d.closes_at).getTime() <= now.getTime()) return 'closed';
  return 'open';
}

export type VoteDenial =
  | 'not_open'
  | 'invalid_option'
  | 'not_eligible';

export interface VoteCheckInput {
  decision: SongLabDecisionCore;
  now: Date;
  optionId: string;
  /** The fan's active tier for THIS artist, resolved server-side. Null = no membership. */
  fanTierId: string | null;
}

/**
 * May this authenticated fan cast this vote right now? The route resolves fanTierId from
 * the subscriptions table server-side; this function never sees a client claim.
 */
export function checkVote(input: VoteCheckInput): { ok: true } | { ok: false; reason: VoteDenial } {
  const { decision, now, optionId, fanTierId } = input;
  if (effectiveStatus(decision, now) !== 'open') return { ok: false, reason: 'not_open' };
  if (!decision.options.some((o) => o.id === optionId)) return { ok: false, reason: 'invalid_option' };
  if (decision.is_free) return { ok: true };
  const allowed = Array.isArray(decision.allowed_tier_ids) ? decision.allowed_tier_ids : [];
  if (!fanTierId || !allowed.includes(fanTierId)) return { ok: false, reason: 'not_eligible' };
  return { ok: true };
}

/** Aggregate votes into per-option counts. Unknown option ids are counted under their id. */
export function tally(
  options: DecisionOption[],
  votes: Array<{ option_id: string }>,
): { counts: Record<string, number>; total: number; leading: string | null } {
  const counts: Record<string, number> = {};
  for (const o of options) counts[o.id] = 0;
  for (const v of votes) counts[v.option_id] = (counts[v.option_id] ?? 0) + 1;
  const total = votes.length;
  let leading: string | null = null;
  let best = 0;
  for (const o of options) {
    if ((counts[o.id] ?? 0) > best) {
      best = counts[o.id];
      leading = o.id;
    }
  }
  return { counts, total, leading };
}

/**
 * Validate an artist-supplied options array into the stored shape. Returns null when the
 * input cannot make a legal ballot. Ids are stable a/b/c/d so votes survive label edits.
 */
export function normalizeOptions(raw: unknown): DecisionOption[] | null {
  if (!Array.isArray(raw)) return null;
  const labels = raw
    .map((o) => (o && typeof o === 'object' && typeof (o as { label?: unknown }).label === 'string'
      ? (o as { label: string }).label.trim()
      : typeof o === 'string' ? o.trim() : ''))
    .filter((l) => l.length > 0 && l.length <= MAX_LABEL_LENGTH);
  if (labels.length < MIN_OPTIONS || labels.length > MAX_OPTIONS) return null;
  const ids = ['a', 'b', 'c', 'd'];
  return labels.map((label, i) => ({ id: ids[i], label }));
}

/**
 * Preserve existing option ids on edit: labels update in place by position, so cast votes
 * keep pointing at the same choice. Adding options appends new ids; removing is only legal
 * while the decision is a draft (the route enforces that; this stays pure).
 */
export function mergeOptionEdit(
  existing: DecisionOption[],
  nextLabels: string[],
): DecisionOption[] | null {
  const cleaned = nextLabels.map((l) => l.trim()).filter((l) => l.length > 0 && l.length <= MAX_LABEL_LENGTH);
  if (cleaned.length < MIN_OPTIONS || cleaned.length > MAX_OPTIONS) return null;
  const ids = ['a', 'b', 'c', 'd'];
  return cleaned.map((label, i) => ({ id: existing[i]?.id ?? ids[i], label }));
}

const OFFER_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

/** Offer link slugs: lowercase, digits, hyphens, 3-64 chars, no leading/trailing hyphen. */
export function normalizeOfferSlug(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase().replace(/\s+/g, '-');
  return OFFER_SLUG_RE.test(s) ? s : null;
}

/**
 * Derive a legal offer slug from a human show name. The manager derives the link
 * from the NAME field with no visible slug input, so "St. James Live September 26"
 * must become st-james-live-september-26 instead of erroring about a slug the
 * artist never typed (that really happened, 2026-08-20). Same character policy as
 * the shared src/lib/slugify.ts but with the offer slug's own 64-char cap, kept
 * here so it stays dependency-free with the rest of this module. Returns null
 * only when nothing usable remains (under 3 characters).
 */
export function offerSlugFromName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
  return OFFER_SLUG_RE.test(s) ? s : null;
}

export type OfferBenefitKind = 'vote' | 'content' | 'recognition' | 'other';

export interface SongLabOfferCore {
  benefit_kind: OfferBenefitKind;
  decision_id: string | null;
  project_id: string | null;
  destination_path: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
}

/** Is the offer claimable right now (active and inside its window)? */
export function offerIsLive(offer: SongLabOfferCore, now: Date): boolean {
  if (!offer.is_active) return false;
  if (offer.starts_at && new Date(offer.starts_at).getTime() > now.getTime()) return false;
  if (offer.ends_at && new Date(offer.ends_at).getTime() <= now.getTime()) return false;
  return true;
}

/** Same shape as safeInternalPath in src/lib/safeRedirect.ts, kept dependency-free here. */
export function safeLabPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > 512) return null;
  if (!s.startsWith('/') || s.startsWith('//')) return null;
  if (s.includes('\\') || s.includes('://')) return null;
  if (/[\x00-\x1f]/.test(s)) return null;
  return s;
}

/**
 * Where a successful claim lands the fan. Always an internal path; a vote offer deep-links
 * its decision, everything else lands on the Lab (or the artist-entered internal path).
 */
export function claimDestination(offer: SongLabOfferCore, artistSlug: string): string {
  const lab = `/${artistSlug}/lab`;
  if (offer.benefit_kind === 'vote' && offer.decision_id) return `${lab}?d=${offer.decision_id}`;
  if ((offer.benefit_kind === 'content' || offer.benefit_kind === 'other') && offer.destination_path) {
    return safeLabPath(offer.destination_path) ?? lab;
  }
  return lab;
}

/* ── Vote-first landing (live show mode) ──────────────────────────────────────
 * A vote offer can render its decision's ballot ON the landing page, so the first
 * screen a visitor sees is the vote itself (built for artists whose acquisition
 * moment is a live room, e.g. a QR on stage). One submission then performs the
 * free join AND casts the carried vote in the claim route. Everything here stays
 * pure; the routes and pages consume it. */

/**
 * Validate a client-carried preselected option (the `o` query param that rides
 * through signup) against the decision's real ballot. Anything unknown is null:
 * the fan still joins, they just pick by hand on the Lab.
 */
export function preselectedOption(raw: unknown, options: DecisionOption[]): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > 8) return null;
  return options.some((o) => o.id === s) ? s : null;
}

/**
 * Should the landing show this decision as a castable ballot? Only when the vote
 * is effectively open AND the tier the claim will enroll (or any signed-in fan,
 * for is_free) is allowed to cast it. A ballot the join cannot deliver is a
 * promise the page must not make.
 */
export function ballotOpenForFreeJoin(
  decision: SongLabDecisionCore,
  enrollTierId: string | null,
  now: Date,
): boolean {
  if (effectiveStatus(decision, now) !== 'open') return false;
  if (decision.is_free) return true;
  if (!enrollTierId) return false;
  const allowed = Array.isArray(decision.allowed_tier_ids) ? decision.allowed_tier_ids : [];
  return allowed.includes(enrollTierId);
}

/**
 * The submit label in ballot mode. An artist who left the offer's CTA at the
 * stock join label gets the vote verb, because in ballot mode the button casts
 * a vote; an artist who wrote their own label keeps their words.
 */
export function ballotCtaLabel(ctaLabel: string | null | undefined): string {
  const c = (ctaLabel || '').trim();
  if (!c || c.toLowerCase() === 'join free') return 'Cast my vote';
  return c;
}

/** An account created within this window of the claim is attributed as a fresh signup. */
export const FRESH_SIGNUP_WINDOW_MS = 30 * 60 * 1000;

export function isFreshSignup(accountCreatedAt: string | null | undefined, now: Date): boolean {
  if (!accountCreatedAt) return false;
  const created = new Date(accountCreatedAt).getTime();
  if (Number.isNaN(created)) return false;
  return now.getTime() - created <= FRESH_SIGNUP_WINDOW_MS;
}
