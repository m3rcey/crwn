// actionValidity.ts — is this Manager action still safe to execute RIGHT NOW?
//
// THE DEFECT THIS EXISTS TO CLOSE
// -------------------------------
// `artist_agent_actions` had no expiry of any kind. `/api/ai-manager/execute` matched on
// `status = 'pending'` and nothing else, and the artist Manager screen rendered an Approve button
// for every pending row regardless of age. Production carried three actions generated on
// 2026-04-03, still offered 130 days later, including an `adjust_tier_price` marked risk=high.
// Clicking Approve would have rewritten a live tier price using April's analysis of April's
// numbers.
//
// THE RULE
// --------
//   Approval is not perpetual authorization. An action is authorized when it is APPROVED and
//   still VALID, and validity is re-derived from current state at the moment of execution.
//
// WHY 14 DAYS, AND WHY THAT IS NOT AN INVENTED NUMBER
// ---------------------------------------------------
// CRWN already decided how long Manager output stays current: `ai_insights` rows are written with
// `expires_at = now + 14 days` (`FOURTEEN_DAYS_MS` in both Manager routes) and every reader filters
// `expires_at > now()`. An insight is Manager's ADVICE; an action is Manager's advice plus a
// proposed WRITE. It would be incoherent for the write to outlive the reasoning that justified it,
// so actions inherit the same window rather than getting a second, unrelated number. This is reuse
// of an existing semantic, not a new policy.
//
// Deliberately NOT reused: the 7-day action DEDUPLICATION window (how often Manager may re-suggest
// the same thing) and the 1-hour coordination lock (how long one execution blocks another). Those
// are different concepts that happen to be durations.
//
// WHAT THIS IS NOT
// ----------------
//  - Not a second Constraint Engine. It never asks what the artist SHOULD do, only whether this
//    specific stored action still matches reality.
//  - Not an AI call. Every check is deterministic and re-runnable.
//  - Not an outcome score. Nothing here judges whether an action worked.
//  - Not a schema change. Expiry is DERIVED from `created_at`; no column and no new status value.

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * How long a generated action stays executable. Parity with `ai_insights.expires_at`, which is the
 * existing, shipped answer to "how long is Manager output current". See the header.
 */
export const MANAGER_ACTION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** ISO cutoff before which a pending action is no longer offered or executed. */
export function staleBefore(now: Date = new Date()): string {
  return new Date(now.getTime() - MANAGER_ACTION_TTL_MS).toISOString();
}

export type ActionInvalidReason =
  /** Generated too long ago: the analysis behind it is no longer current. */
  | 'expired'
  /** The tier / sequence / track it names no longer exists, or is not this artist's. */
  | 'target_missing'
  /** The world is already in the state this action wanted to produce. */
  | 'already_satisfied';

export type ActionValidity =
  | { valid: true }
  | { valid: false; reason: ActionInvalidReason; message: string };

const VALID: ActionValidity = { valid: true };

function invalid(reason: ActionInvalidReason, message: string): ActionValidity {
  return { valid: false, reason, message };
}

/**
 * PURE age check. Split out from the target checks so the rule is testable without a database and
 * so the UI can apply the identical cutoff without duplicating the arithmetic.
 *
 * A missing `createdAt` is treated as FRESH, deliberately: the only caller that passes nothing is
 * the autonomous path, which executes an action it generated seconds earlier and never stored. It
 * is not an unknown age, it is a zero age. Failing closed there would mean "we could not read a
 * timestamp, so refuse", which is the right instinct but the wrong diagnosis.
 */
export function checkActionAge(createdAt: string | null | undefined, now: Date = new Date()): ActionValidity {
  if (!createdAt) return VALID;
  const created = new Date(createdAt).getTime();
  // An unparseable timestamp IS unknown age, and that fails closed.
  if (!Number.isFinite(created)) {
    return invalid('expired', 'This suggestion could not be dated, so it is no longer offered.');
  }
  if (now.getTime() - created > MANAGER_ACTION_TTL_MS) {
    return invalid(
      'expired',
      'This suggestion is out of date. It was based on your numbers at the time, and those have moved on. Ask your manager for a fresh read.',
    );
  }
  return VALID;
}

interface StoredAction {
  action_type: string;
  action_params?: Record<string, unknown> | null;
  created_at?: string | null;
}

type Db = Pick<SupabaseClient, 'from'>;

/**
 * Full validity: age, then whether the action's TARGET still looks the way it did.
 *
 * Ownership is enforced by passing `artistId` into every lookup, so a stored `tier_id` belonging to
 * another artist reads as `target_missing` rather than resolving. That matters: `action_params` is
 * a snapshot written at generation time and must never be treated as a trusted pointer.
 *
 * Fails OPEN on an unexpected read error (returns valid) and lets the handler's own existence check
 * refuse instead. This function is an ADDITIONAL gate in front of the existing ones, never a
 * replacement for them, so a transient database blip must not become a second way to block a
 * legitimate artist-approved action.
 */
export async function validateManagerActionForExecution(
  db: Db,
  artistId: string,
  action: StoredAction,
  now: Date = new Date(),
): Promise<ActionValidity> {
  const age = checkActionAge(action.created_at, now);
  if (!age.valid) return age;

  const params = (action.action_params ?? {}) as Record<string, unknown>;

  try {
    switch (action.action_type) {
      // Highest-risk action in the catalogue: it rewrites a live price fans are billed at.
      case 'adjust_tier_price': {
        const tierId = typeof params.tier_id === 'string' ? params.tier_id : null;
        const target = typeof params.new_price_cents === 'number' ? params.new_price_cents : null;
        if (!tierId || target === null) return invalid('target_missing', 'This price change is missing its tier.');
        const { data } = await db
          .from('subscription_tiers')
          .select('id, price')
          .eq('id', tierId)
          .eq('artist_id', artistId)
          .maybeSingle();
        if (!data) return invalid('target_missing', 'That tier no longer exists.');
        if (data.price === target) {
          return invalid('already_satisfied', 'That tier is already at this price.');
        }
        return VALID;
      }

      case 'toggle_sequence': {
        const seqId = typeof params.sequence_id === 'string' ? params.sequence_id : null;
        if (!seqId) return invalid('target_missing', 'This action is missing its email sequence.');
        const { data } = await db
          .from('sequences')
          .select('id, is_active')
          .eq('id', seqId)
          .eq('artist_id', artistId)
          .maybeSingle();
        if (!data) return invalid('target_missing', 'That email sequence no longer exists.');
        if (typeof params.enable === 'boolean' && data.is_active === params.enable) {
          return invalid('already_satisfied', `That sequence is already ${params.enable ? 'active' : 'paused'}.`);
        }
        return VALID;
      }

      case 'gate_track':
      case 'ungate_track': {
        const trackId = typeof params.track_id === 'string' ? params.track_id : null;
        if (!trackId) return invalid('target_missing', 'This action is missing its track.');
        const { data } = await db
          .from('tracks')
          .select('id, is_free')
          .eq('id', trackId)
          .eq('artist_id', artistId)
          .maybeSingle();
        if (!data) return invalid('target_missing', 'That track no longer exists.');
        const wantsFree = action.action_type === 'ungate_track';
        if ((data.is_free !== false) === wantsFree) {
          return invalid(
            'already_satisfied',
            wantsFree ? 'That track is already free.' : 'That track is already gated.',
          );
        }
        return VALID;
      }

      // Enrols fans into the artist's inactive-subscriber sequence, which then EMAILS them. The
      // fan set is re-derived by the handler at execution time, so it cannot go stale; the
      // sequence it enrols into can.
      case 'send_reengagement': {
        const { data } = await db
          .from('sequences')
          .select('id')
          .eq('artist_id', artistId)
          .eq('trigger_type', 'inactive_subscriber')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        if (!data) return invalid('target_missing', 'You have no active re-engagement sequence to enrol fans into.');
        return VALID;
      }

      // Self-contained content actions. They name no external row, so there is no target to go
      // missing and age is the whole of their validity. Listed explicitly rather than falling
      // through, so adding a ninth action type is a deliberate decision here.
      case 'create_discount_code':
      case 'schedule_campaign':
      case 'create_community_post':
        return VALID;

      default:
        return VALID;
    }
  } catch {
    // See the fail-open note above.
    return VALID;
  }
}
