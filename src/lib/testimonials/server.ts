// Fan Testimonials — the server surface. Every function takes the SERVICE-ROLE admin client.
//
// Canonical architecture: docs/crwn-brain/27-AUTOMATED-FAN-TESTIMONIALS-ARCHITECTURE.md
// All decision logic lives in ./core.ts (pure, tested). This file only reads canonical state,
// applies those decisions, and writes.
//
// FAIL SOFT BEFORE THE MIGRATION. Every entry point here returns an empty/skipped result when the
// relations do not exist yet, so the cron reports skipped, the fan card renders nothing, the artist
// library shows an empty state, and the public section is absent. Nothing throws at a user.

import { isFanPromiseEvent } from '@/lib/fulfillment';
import { fanEligibleForObligation } from '@/lib/calendarProjection';
import { isPresentableArtistName } from '@/lib/publicName';
import {
  type ConsentScope,
  type DisplayIdentity,
  type TestimonialContextKind,
  type TestimonialTrigger,
  type VerificationEvidence,
  PROMISE_TRIGGER_DELAY_DAYS,
  TENURE_TRIGGER_DAYS,
  REQUEST_COOLDOWN_DAYS,
  deriveVerification,
  isPromiseTriggerDue,
  isTenureTriggerDue,
  mayCreateRequest,
  questionFor,
  requestExpiresAt,
  tenureBucketLabel,
  VERIFICATION_LABEL,
} from './core';

type Admin = any;

const DAY_MS = 86_400_000;

/** Postgres codes meaning "the migration has not run": undefined table / undefined column. */
function isMissingSchema(err: any): boolean {
  const code = err?.code;
  return code === '42P01' || code === '42703';
}

/** How far back the generator looks. Bounded so a daily run never rescans all history. */
const PROMISE_LOOKBACK_DAYS = 14;
/** Per-run ceiling, so one artist with a huge list cannot make the cron unbounded. */
const MAX_REQUESTS_PER_RUN = 500;

// ---------------------------------------------------------------------------
// Request generation (the automation)
// ---------------------------------------------------------------------------

export interface GenerationResult {
  skipped: boolean;
  reason?: string;
  scannedTenure: number;
  scannedPromises: number;
  created: number;
  createdByTrigger: Record<TestimonialTrigger, number>;
}

const emptyResult = (): GenerationResult => ({
  skipped: false,
  scannedTenure: 0,
  scannedPromises: 0,
  created: 0,
  createdByTrigger: { promise_fulfilled: 0, member_30d: 0 },
});

/**
 * Create testimonial requests for every fan who became eligible. Idempotent by construction:
 * the unique indexes in the migration reject a duplicate, and a rejected insert is counted as
 * "already asked" rather than an error.
 *
 * Ordering note: promises are processed BEFORE tenure. When a fan qualifies for both on the same
 * day, the promise ask is the better question (a specific delivered thing beats a generic month),
 * and the one-outstanding-request index makes the second attempt a no-op.
 */
export async function generateTestimonialRequests(admin: Admin, now: Date): Promise<GenerationResult> {
  const result = emptyResult();

  // D4: only artists who have not switched the automation off. Read once, up front.
  let enabledArtists: Map<string, boolean>;
  try {
    const { data, error } = await admin
      .from('artist_profiles')
      .select('id, testimonial_requests_enabled');
    if (error) throw error;
    enabledArtists = new Map(
      (data || []).map((a: any) => [a.id as string, a.testimonial_requests_enabled !== false]),
    );
  } catch (err) {
    if (isMissingSchema(err)) return { ...result, skipped: true, reason: 'migration_pending' };
    console.error('[testimonials] artist toggle read failed:', err);
    return { ...result, skipped: true, reason: 'artist_read_failed' };
  }

  try {
    await processPromiseTrigger(admin, now, enabledArtists, result);
    await processTenureTrigger(admin, now, enabledArtists, result);
  } catch (err) {
    if (isMissingSchema(err)) return { ...result, skipped: true, reason: 'migration_pending' };
    console.error('[testimonials] generation failed:', err);
    return { ...result, skipped: true, reason: 'generation_failed' };
  }

  return result;
}

/** T1 — a fan promise was DELIVERED to this fan, and the delay has elapsed. */
async function processPromiseTrigger(
  admin: Admin,
  now: Date,
  enabledArtists: Map<string, boolean>,
  result: GenerationResult,
): Promise<void> {
  const until = new Date(now.getTime() - PROMISE_TRIGGER_DELAY_DAYS * DAY_MS).toISOString();
  const since = new Date(now.getTime() - PROMISE_LOOKBACK_DAYS * DAY_MS).toISOString();

  const { data: events, error } = await admin
    .from('fulfillment_events')
    .select('id, artist_id, obligation_id, status, completed_at, metadata')
    .eq('status', 'completed')
    .gte('completed_at', since)
    .lte('completed_at', until);
  if (error) throw error;

  for (const ev of events || []) {
    if (result.created >= MAX_REQUESTS_PER_RUN) return;
    if (!enabledArtists.get(ev.artist_id)) continue;

    // FAN-PROMISE BOUNDARY. A row carrying metadata.ramp_step_key is a Revenue Ramp step, the
    // artist's own business task, never something owed to a fan.
    if (!isFanPromiseEvent(ev)) continue;

    const { data: obligation } = await admin
      .from('fulfillment_obligations')
      .select('id, audience_kind, audience_id, metadata')
      .eq('id', ev.obligation_id)
      .maybeSingle();
    if (!obligation) continue;

    const supporters = await activeSupportersOf(admin, ev.artist_id);
    result.scannedPromises += supporters.length;

    for (const sub of supporters) {
      if (result.created >= MAX_REQUESTS_PER_RUN) return;
      // Squad-audience obligations resolve to false with an empty set, which is the fail-CLOSED
      // direction: an unasked fan is a smaller mistake than asking someone who was owed nothing.
      const eligible = fanEligibleForObligation(obligation, sub.tierId, new Set<string>());
      const due = isPromiseTriggerDue({
        status: ev.status,
        completedAt: ev.completed_at,
        isFanPromise: true,
        fanIsEligibleForObligation: eligible,
        now,
      });
      if (!due) continue;

      await tryCreateRequest(admin, now, result, {
        artistId: ev.artist_id,
        fanId: sub.fanId,
        trigger: 'promise_fulfilled',
        evidenceKind: 'fulfillment_event',
        evidenceId: ev.id,
      });
    }
  }
}

/** T2 — thirty days paid and still active. */
async function processTenureTrigger(
  admin: Admin,
  now: Date,
  enabledArtists: Map<string, boolean>,
  result: GenerationResult,
): Promise<void> {
  const cutoff = new Date(now.getTime() - TENURE_TRIGGER_DAYS * DAY_MS).toISOString();

  const { data: subs, error } = await admin
    .from('subscriptions')
    .select('id, fan_id, artist_id, tier_id, status, started_at, created_at')
    .eq('status', 'active')
    .lte('started_at', cutoff);
  if (error) throw error;

  const tierPaid = await paidTierMap(admin, (subs || []).map((s: any) => s.tier_id));

  for (const sub of subs || []) {
    if (result.created >= MAX_REQUESTS_PER_RUN) return;
    if (!enabledArtists.get(sub.artist_id)) continue;
    result.scannedTenure += 1;

    const due = isTenureTriggerDue({
      startedAt: sub.started_at,
      status: sub.status,
      isPaidTier: tierPaid.get(sub.tier_id) === true,
      now,
    });
    if (!due) continue;

    await tryCreateRequest(admin, now, result, {
      artistId: sub.artist_id,
      fanId: sub.fan_id,
      trigger: 'member_30d',
      evidenceKind: 'subscription',
      evidenceId: sub.id,
    });
  }
}

/**
 * Apply the cross-trigger policy, then insert. The unique indexes are the real enforcement: this
 * check saves a round trip and states the policy readably, but two concurrent runs are stopped by
 * the database, not by this function.
 */
async function tryCreateRequest(
  admin: Admin,
  now: Date,
  result: GenerationResult,
  input: {
    artistId: string;
    fanId: string;
    trigger: TestimonialTrigger;
    evidenceKind: 'fulfillment_event' | 'subscription';
    evidenceId: string;
  },
): Promise<void> {
  const { data: existingRequests } = await admin
    .from('fan_testimonial_requests')
    .select('id, status, trigger_kind, created_at')
    .eq('artist_id', input.artistId)
    .eq('fan_id', input.fanId);

  const rows = existingRequests || [];
  const { count: submitted } = await admin
    .from('fan_testimonials')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', input.artistId)
    .eq('fan_id', input.fanId);

  const lastRequestAt = rows
    .map((r: any) => r.created_at as string)
    .sort()
    .slice(-1)[0] ?? null;

  const allowed = mayCreateRequest({
    automationEnabled: true, // already filtered by the caller
    hasOutstandingRequest: rows.some((r: any) => r.status === 'pending'),
    hasRequestForThisTrigger: rows.some((r: any) => r.trigger_kind === input.trigger),
    hasSubmittedForArtist: (submitted || 0) > 0,
    lastRequestAt,
    now,
  });
  if (!allowed) return;

  const { error } = await admin.from('fan_testimonial_requests').insert({
    artist_id: input.artistId,
    fan_id: input.fanId,
    trigger_kind: input.trigger,
    evidence_kind: input.evidenceKind,
    evidence_id: input.evidenceId,
    prompt_key: input.trigger,
    status: 'pending',
    expires_at: requestExpiresAt(now).toISOString(),
  });

  // 23505 = a concurrent run won the race. That is the dedupe working, not a failure.
  if (error) {
    if (error.code !== '23505') console.error('[testimonials] request insert failed:', error.message);
    return;
  }
  result.created += 1;
  result.createdByTrigger[input.trigger] += 1;
}

async function activeSupportersOf(
  admin: Admin,
  artistId: string,
): Promise<Array<{ fanId: string; tierId: string | null }>> {
  const { data } = await admin
    .from('subscriptions')
    .select('fan_id, tier_id')
    .eq('artist_id', artistId)
    .eq('status', 'active');
  return (data || []).map((s: any) => ({ fanId: s.fan_id, tierId: s.tier_id ?? null }));
}

/** tier id -> "costs more than zero". A BOOLEAN map: no price ever reaches the decision layer. */
async function paidTierMap(admin: Admin, tierIds: string[]): Promise<Map<string, boolean>> {
  const unique = [...new Set(tierIds.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data } = await admin.from('subscription_tiers').select('id, price').in('id', unique);
  return new Map((data || []).map((t: any) => [t.id as string, (Number(t.price) || 0) > 0]));
}

// ---------------------------------------------------------------------------
// The fan's side
// ---------------------------------------------------------------------------

export interface PendingRequestView {
  requestId: string;
  artistId: string;
  artistName: string;
  artistSlug: string | null;
  question: string;
}

/**
 * The single pending ask for this fan, or null. Reads the request the SERVER created; the caller
 * never names an artist or a context, which is what keeps a caller-supplied id out of the path.
 */
export async function pendingRequestForFan(admin: Admin, fanId: string): Promise<PendingRequestView | null> {
  try {
    const { data, error } = await admin
      .from('fan_testimonial_requests')
      .select('id, artist_id, trigger_kind, expires_at, status')
      .eq('fan_id', fanId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);
    if (error) throw error;

    const req = (data || [])[0];
    if (!req) return null;
    if (req.expires_at && new Date(req.expires_at).getTime() < Date.now()) return null;

    const { data: artist } = await admin
      .from('artist_profiles')
      .select('id, slug, user_id')
      .eq('id', req.artist_id)
      .maybeSingle();
    if (!artist) return null;

    const { data: profile } = await admin
      .from('profiles')
      .select('display_name')
      .eq('id', artist.user_id)
      .maybeSingle();

    const rawName = profile?.display_name ?? null;
    return {
      requestId: req.id,
      artistId: req.artist_id,
      // display_name defaults to the signup email on legacy rows, so an email-like name never
      // reaches a fan-facing string. The slug is the safe fallback identity.
      artistName: isPresentableArtistName(rawName) ? String(rawName) : (artist.slug ?? 'this artist'),
      artistSlug: artist.slug ?? null,
      question: questionFor(req.trigger_kind as TestimonialTrigger),
    };
  } catch (err) {
    if (!isMissingSchema(err)) console.error('[testimonials] pendingRequestForFan failed:', err);
    return null;
  }
}

export type SubmitOutcome =
  | { ok: true; testimonialId: string }
  | { ok: false; status: number; error: string };

/**
 * Store a fan's statement against a request the SERVER created.
 *
 * AUTHORITY. `fanId` is the authenticated session's user id, resolved by the route. The request row
 * supplies the artist and the context; the caller supplies only a request id and the words. This is
 * the concrete fix for the pattern in POST /api/surveys, which trusts a respondent id carried in a
 * token and therefore lets a forwarded link submit as somebody else.
 */
export async function submitTestimonial(
  admin: Admin,
  input: {
    fanId: string;
    requestId: string;
    body: string;
    displayIdentity: DisplayIdentity;
    consentScope: ConsentScope;
  },
): Promise<SubmitOutcome> {
  try {
    // Ownership: the request must belong to THIS fan and still be open.
    const { data: req, error } = await admin
      .from('fan_testimonial_requests')
      .select('id, artist_id, fan_id, status, trigger_kind, evidence_kind, evidence_id, expires_at')
      .eq('id', input.requestId)
      .maybeSingle();
    if (error) throw error;
    if (!req || req.fan_id !== input.fanId) {
      return { ok: false, status: 404, error: 'Request not found' };
    }
    if (req.status !== 'pending') {
      return { ok: false, status: 409, error: 'This request has already been answered' };
    }
    if (req.expires_at && new Date(req.expires_at).getTime() < Date.now()) {
      return { ok: false, status: 410, error: 'This request has expired' };
    }

    // RE-DERIVE eligibility now. The request's existence is not sufficient: a fan who cancelled
    // between the ask and the answer is no longer a verified supporter, and the badge must reflect
    // the relationship as it stands at submit, not as it stood when the cron ran.
    const evidence = await readVerificationEvidence(admin, input.fanId, req.artist_id);

    const contextKind: TestimonialContextKind =
      req.trigger_kind === 'promise_fulfilled' ? 'promise' : 'membership';

    const { data: inserted, error: insErr } = await admin
      .from('fan_testimonials')
      .insert({
        request_id: req.id,
        artist_id: req.artist_id,
        fan_id: input.fanId,
        context_kind: contextKind,
        context_id: req.evidence_id,
        prompt_key: req.trigger_kind,
        body: input.body,
        display_identity: input.displayIdentity,
        consent_scope: input.consentScope,
        consent_at: input.consentScope === 'crwn_only' ? new Date().toISOString() : null,
        verification_evidence_kind: evidence ? 'subscription' : null,
        verification_evidence_id: evidence?.subscriptionId ?? null,
      })
      .select('id')
      .single();

    if (insErr) {
      if (insErr.code === '23505') {
        return { ok: false, status: 409, error: 'You have already shared this' };
      }
      throw insErr;
    }

    await admin
      .from('fan_testimonial_requests')
      .update({ status: 'submitted', responded_at: new Date().toISOString() })
      .eq('id', req.id);

    return { ok: true, testimonialId: inserted.id };
  } catch (err: any) {
    if (isMissingSchema(err)) {
      return { ok: false, status: 503, error: 'Testimonials are not available yet' };
    }
    console.error('[testimonials] submit failed:', err);
    return { ok: false, status: 500, error: 'Could not save that' };
  }
}

/** "Not right now" is a recorded answer, not a dismissal. It starts the cooldown. */
export async function declineRequest(admin: Admin, fanId: string, requestId: string): Promise<boolean> {
  try {
    const { data } = await admin
      .from('fan_testimonial_requests')
      .update({ status: 'declined', responded_at: new Date().toISOString() })
      .eq('id', requestId)
      .eq('fan_id', fanId)
      .eq('status', 'pending')
      .select('id');
    return (data || []).length > 0;
  } catch (err) {
    if (!isMissingSchema(err)) console.error('[testimonials] decline failed:', err);
    return false;
  }
}

/**
 * The fan withdraws. Immediate and unilateral: no artist approval, no penalty, no effect on their
 * subscription or access. Also narrows the consent scope, so the row can never be re-featured into
 * public view; the freeze trigger refuses to widen it back.
 */
export async function withdrawTestimonial(admin: Admin, fanId: string, testimonialId: string): Promise<boolean> {
  try {
    const { data } = await admin
      .from('fan_testimonials')
      .update({ withdrawn_at: new Date().toISOString(), consent_scope: 'private_to_artist' })
      .eq('id', testimonialId)
      .eq('fan_id', fanId)
      .is('withdrawn_at', null)
      .select('id');
    return (data || []).length > 0;
  } catch (err) {
    if (!isMissingSchema(err)) console.error('[testimonials] withdraw failed:', err);
    return false;
  }
}

/** What the fan has already said, so their hub can show it and offer withdrawal. */
export async function fanTestimonials(admin: Admin, fanId: string): Promise<Array<{
  id: string;
  artistName: string;
  body: string;
  submittedAt: string;
  isPublic: boolean;
  withdrawn: boolean;
}>> {
  try {
    const { data, error } = await admin
      .from('fan_testimonials')
      .select('id, artist_id, body, submitted_at, consent_scope, featured_at, hidden_at, withdrawn_at, moderation_status')
      .eq('fan_id', fanId)
      .order('submitted_at', { ascending: false });
    if (error) throw error;

    const names = await artistNames(admin, (data || []).map((r: any) => r.artist_id));
    return (data || []).map((r: any) => ({
      id: r.id,
      artistName: names.get(r.artist_id) ?? 'an artist',
      body: r.body,
      submittedAt: r.submitted_at,
      isPublic:
        r.consent_scope === 'crwn_only' &&
        !!r.featured_at &&
        !r.hidden_at &&
        !r.withdrawn_at &&
        r.moderation_status === 'auto_ok',
      withdrawn: !!r.withdrawn_at,
    }));
  } catch (err) {
    if (!isMissingSchema(err)) console.error('[testimonials] fanTestimonials failed:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// The artist's side
// ---------------------------------------------------------------------------

export interface LibraryTestimonial {
  id: string;
  body: string;
  displayName: string | null;
  verificationLabel: string | null;
  tenureLabel: string | null;
  contextKind: TestimonialContextKind | null;
  submittedAt: string;
  consentScope: ConsentScope;
  /** Can the artist put this on their page at all? False for a private-to-artist response. */
  publishable: boolean;
  featured: boolean;
  hidden: boolean;
  withdrawn: boolean;
  moderationStatus: string;
}

/**
 * The artist's private library. `artistId` MUST already be proven to belong to the caller's
 * session by the route: this function does not re-authorize, and every caller passes an id it
 * derived from `artist_profiles.user_id = session.user.id`.
 */
export async function listArtistTestimonials(admin: Admin, artistId: string): Promise<LibraryTestimonial[]> {
  try {
    const { data, error } = await admin
      .from('fan_testimonials')
      .select(
        'id, fan_id, body, context_kind, submitted_at, display_identity, consent_scope, featured_at, hidden_at, withdrawn_at, moderation_status',
      )
      .eq('artist_id', artistId)
      .order('submitted_at', { ascending: false });
    if (error) throw error;

    const rows = data || [];
    const now = new Date();
    const displayNames = await fanDisplayNames(admin, rows.map((r: any) => r.fan_id));
    const evidence = await verificationEvidenceFor(admin, artistId, rows.map((r: any) => r.fan_id));

    return rows.map((r: any) => {
      const ev = evidence.get(r.fan_id) ?? null;
      const kind = deriveVerification(ev);
      const raw = displayNames.get(r.fan_id) ?? null;
      return {
        id: r.id,
        body: r.body,
        displayName:
          r.display_identity === 'display_name' && isPresentableArtistName(raw) ? String(raw).trim() : null,
        verificationLabel: VERIFICATION_LABEL[kind],
        tenureLabel: tenureBucketLabel(ev?.startedAt ?? null, now),
        contextKind: r.context_kind ?? null,
        submittedAt: r.submitted_at,
        consentScope: r.consent_scope,
        publishable: r.consent_scope === 'crwn_only' && !r.withdrawn_at && r.moderation_status === 'auto_ok',
        featured: !!r.featured_at,
        hidden: !!r.hidden_at,
        withdrawn: !!r.withdrawn_at,
        moderationStatus: r.moderation_status,
      };
    });
  } catch (err) {
    if (!isMissingSchema(err)) console.error('[testimonials] listArtistTestimonials failed:', err);
    return [];
  }
}

/**
 * Feature or hide. The ONLY mutation an artist may perform on a testimonial.
 *
 * There is no body parameter here and no route that accepts one: TESTIMONIAL-001 says visibility
 * ownership is not content authorship, and the database freeze trigger is the second line.
 *
 * Featuring a private-to-artist response is refused rather than silently ignored, because an artist
 * who clicks "feature" and sees nothing happen will assume the product is broken.
 */
export async function setTestimonialVisibility(
  admin: Admin,
  artistId: string,
  testimonialId: string,
  action: 'feature' | 'unfeature' | 'hide' | 'unhide',
): Promise<{ ok: boolean; status: number; error?: string }> {
  try {
    const { data: row } = await admin
      .from('fan_testimonials')
      .select('id, artist_id, consent_scope, withdrawn_at, moderation_status')
      .eq('id', testimonialId)
      .eq('artist_id', artistId)
      .maybeSingle();
    if (!row) return { ok: false, status: 404, error: 'Not found' };

    if (action === 'feature') {
      if (row.consent_scope !== 'crwn_only') {
        return { ok: false, status: 403, error: 'This fan did not give permission to show it publicly' };
      }
      if (row.withdrawn_at) {
        return { ok: false, status: 403, error: 'This fan withdrew their testimonial' };
      }
      if (row.moderation_status !== 'auto_ok') {
        return { ok: false, status: 403, error: 'This testimonial is under review' };
      }
    }

    const patch: Record<string, string | null> =
      action === 'feature'
        ? { featured_at: new Date().toISOString(), hidden_at: null }
        : action === 'unfeature'
        ? { featured_at: null }
        : action === 'hide'
        ? { hidden_at: new Date().toISOString() }
        : { hidden_at: null };

    const { error } = await admin.from('fan_testimonials').update(patch).eq('id', testimonialId).eq('artist_id', artistId);
    if (error) throw error;
    return { ok: true, status: 200 };
  } catch (err) {
    if (isMissingSchema(err)) return { ok: false, status: 503, error: 'Testimonials are not available yet' };
    console.error('[testimonials] setTestimonialVisibility failed:', err);
    return { ok: false, status: 500, error: 'Could not update that' };
  }
}

/** D4. Reads the artist's toggle, defaulting to ON when the column is not there yet. */
export async function automationEnabled(admin: Admin, artistId: string): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from('artist_profiles')
      .select('testimonial_requests_enabled')
      .eq('id', artistId)
      .maybeSingle();
    if (error) throw error;
    return data?.testimonial_requests_enabled !== false;
  } catch {
    return true;
  }
}

export async function setAutomationEnabled(admin: Admin, artistId: string, enabled: boolean): Promise<boolean> {
  try {
    const { error } = await admin
      .from('artist_profiles')
      .update({ testimonial_requests_enabled: enabled })
      .eq('id', artistId);
    if (error) throw error;
    return true;
  } catch (err) {
    if (!isMissingSchema(err)) console.error('[testimonials] setAutomationEnabled failed:', err);
    return false;
  }
}

/**
 * D4 semantics: turning the automation OFF suppresses asks that have not been answered yet.
 * It never deletes a submitted testimonial and never unfeatures one.
 */
export async function suppressPendingRequests(admin: Admin, artistId: string): Promise<number> {
  try {
    const { data } = await admin
      .from('fan_testimonial_requests')
      .update({ status: 'expired', responded_at: new Date().toISOString() })
      .eq('artist_id', artistId)
      .eq('status', 'pending')
      .select('id');
    return (data || []).length;
  } catch (err) {
    if (!isMissingSchema(err)) console.error('[testimonials] suppressPendingRequests failed:', err);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Evidence reads
// ---------------------------------------------------------------------------

type EvidenceWithId = VerificationEvidence & { subscriptionId: string | null };

/** One (fan, artist) relationship, as it stands right now. */
async function readVerificationEvidence(
  admin: Admin,
  fanId: string,
  artistId: string,
): Promise<EvidenceWithId | null> {
  const map = await verificationEvidenceFor(admin, artistId, [fanId]);
  return (map.get(fanId) as EvidenceWithId) ?? null;
}

/**
 * Batch the relationship evidence for a set of fans of one artist.
 *
 * `isPaidTier` is computed HERE and only the boolean escapes. The price never enters the returned
 * shape, so no caller and no view can pair it with tenure (the leaderboardPrivacy lesson).
 */
async function verificationEvidenceFor(
  admin: Admin,
  artistId: string,
  fanIds: string[],
): Promise<Map<string, EvidenceWithId>> {
  const out = new Map<string, EvidenceWithId>();
  const unique = [...new Set(fanIds.filter(Boolean))];
  if (unique.length === 0) return out;

  const { data: subs } = await admin
    .from('subscriptions')
    .select('id, fan_id, tier_id, status, started_at, is_founder')
    .eq('artist_id', artistId)
    .in('fan_id', unique);

  const paid = await paidTierMap(admin, (subs || []).map((s: any) => s.tier_id));
  for (const s of subs || []) {
    out.set(s.fan_id, {
      subscriptionId: s.id,
      active: s.status === 'active',
      isPaidTier: paid.get(s.tier_id) === true,
      isFounder: s.is_founder === true,
      startedAt: s.started_at ?? null,
    });
  }
  return out;
}

async function fanDisplayNames(admin: Admin, fanIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const unique = [...new Set(fanIds.filter(Boolean))];
  if (unique.length === 0) return out;
  const { data } = await admin.from('profiles').select('id, display_name').in('id', unique);
  for (const p of data || []) out.set(p.id, p.display_name ?? null);
  return out;
}

async function artistNames(admin: Admin, artistIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(artistIds.filter(Boolean))];
  if (unique.length === 0) return out;
  const { data: artists } = await admin.from('artist_profiles').select('id, user_id, slug').in('id', unique);
  const userIds = (artists || []).map((a: any) => a.user_id).filter(Boolean);
  const { data: profiles } = userIds.length
    ? await admin.from('profiles').select('id, display_name').in('id', userIds)
    : { data: [] as any[] };
  const byUser = new Map<string, string | null>(
    (profiles || []).map((p: any) => [String(p.id), (p.display_name ?? null) as string | null]),
  );
  for (const a of artists || []) {
    const raw = byUser.get(a.user_id) ?? null;
    out.set(a.id, isPresentableArtistName(raw) ? String(raw) : (a.slug ?? 'an artist'));
  }
  return out;
}

/** Exported for the cooldown copy in the fan card. */
export const TESTIMONIAL_COOLDOWN_DAYS = REQUEST_COOLDOWN_DAYS;
