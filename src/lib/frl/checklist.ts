// The First Revenue Launch operator delivery checklist (Money Model system,
// 2026-08-06). Twenty items, two kinds:
//
//  - 'derived': the product can verify it from live data. Evaluated on read
//    through the same Quest Engine evaluateCondition / direct queries the
//    guarantee checklist uses, NEVER stored, and the admin cannot override one:
//    the server rejects a manual write for a derived key. Each derived item
//    names its evidence source so the admin can see where the verdict came from.
//
//  - 'manual': a genuine founder judgment (audit done, exports received,
//    benefits reviewed...). Stored in frl_checklist_state with status, date,
//    note, minutes. item_key is allowlisted against this registry server-side.
//
// This registry is deliberately NOT a project-management system: no assignees,
// no dependencies, no due dates. It exists so the operator view can say
// "verified by the product" vs "confirmed by you" vs "not yet verifiable".

import type { DomainCheck } from '@/lib/quests/types';

export type FrlChecklistQuery =
  | 'eligible_contacts'      // fan_contacts total + patreon-tagged (guarantee rule)
  | 'campaign_drafts_exist'  // campaigns rows in any status
  | 'warm_fans_invited'      // funnel_events stage fan_invited for this artist
  | 'fulfillment_delivered'; // fulfillment_events status=completed >= 1

export type FrlDerivedSource =
  | { kind: 'check'; check: DomainCheck; count?: number }
  | { kind: 'checkAll'; checks: DomainCheck[] } // every check must pass
  | { kind: 'query'; query: FrlChecklistQuery };

export interface FrlChecklistItemDef {
  key: string;
  label: string;
  kind: 'derived' | 'manual';
  /** For derived items: where the verdict comes from, in admin-readable words. */
  evidence?: string;
  source?: FrlDerivedSource;
}

export const FRL_CHECKLIST: FrlChecklistItemDef[] = [
  { key: 'revenue_audit', label: 'Revenue audit completed', kind: 'manual' },
  { key: 'source_exports', label: 'Source exports received', kind: 'manual' },
  {
    key: 'contacts_imported', label: 'Contacts imported', kind: 'derived',
    evidence: 'fan_contacts rows for this artist (guarantee rule: 100 total or 40 proven buyers)',
    source: { kind: 'query', query: 'eligible_contacts' },
  },
  { key: 'contacts_reviewed', label: 'Contacts deduplicated / reviewed', kind: 'manual' },
  { key: 'buyers_identified', label: 'Previous buyers identified', kind: 'manual' },
  { key: 'revenue_model_selected', label: 'Revenue model selected', kind: 'manual' },
  {
    key: 'ladder_configured', label: 'Fan-tier ladder configured', kind: 'derived',
    evidence: 'a live free tier AND a paid tier exist (quest checks artist_has_free_tier + artist_has_paid_offer)',
    source: { kind: 'checkAll', checks: ['artist_has_free_tier', 'artist_has_paid_offer'] as DomainCheck[] },
  },
  { key: 'benefits_reviewed', label: 'Benefits and fulfillment reviewed', kind: 'manual' },
  { key: 'promise_calendar_reviewed', label: 'Promise Calendar reviewed', kind: 'manual' },
  {
    key: 'stripe_connected', label: 'Stripe connected', kind: 'derived',
    evidence: 'quest check artist_stripe_connected (live charges enabled)',
    source: { kind: 'check', check: 'artist_stripe_connected' as DomainCheck },
  },
  {
    key: 'free_front_door', label: 'Free front door live', kind: 'derived',
    evidence: 'quest check artist_has_free_tier',
    source: { kind: 'check', check: 'artist_has_free_tier' as DomainCheck },
  },
  {
    key: 'paid_tier_purchasable', label: 'Paid tier purchasable', kind: 'derived',
    evidence: 'quest check artist_tier_purchasable (real Stripe price behind the tier)',
    source: { kind: 'check', check: 'artist_tier_purchasable' as DomainCheck },
  },
  { key: 'page_reviewed', label: 'Artist page reviewed', kind: 'manual' },
  {
    key: 'campaign_assets_created', label: 'Campaign assets created', kind: 'derived',
    evidence: 'campaigns rows exist for this artist (any status; drafts count)',
    source: { kind: 'query', query: 'campaign_drafts_exist' },
  },
  { key: 'campaign_approved', label: 'Campaign approved', kind: 'manual' },
  {
    key: 'campaign_sent', label: 'Campaign sent', kind: 'derived',
    evidence: 'quest check artist_sent_campaign (a campaign with status=sent)',
    source: { kind: 'check', check: 'artist_sent_campaign' as DomainCheck },
  },
  {
    key: 'warm_fans_invited', label: 'First warm fans invited', kind: 'derived',
    evidence: 'funnel_events stage fan_invited recorded for this artist',
    source: { kind: 'query', query: 'warm_fans_invited' },
  },
  {
    key: 'first_paid_member', label: 'First paid member acquired', kind: 'derived',
    evidence: 'quest check artist_revenue_milestone at 100 cents (the guarantee outcome)',
    source: { kind: 'check', check: 'artist_revenue_milestone' as DomainCheck, count: 100 },
  },
  {
    key: 'first_fulfillment', label: 'First promised fulfillment delivered', kind: 'derived',
    evidence: 'a completed fulfillment_events row exists',
    source: { kind: 'query', query: 'fulfillment_delivered' },
  },
  { key: 'thirty_day_review', label: 'Thirty-day review completed', kind: 'manual' },
];

export const FRL_MANUAL_KEYS = new Set(
  FRL_CHECKLIST.filter((i) => i.kind === 'manual').map((i) => i.key),
);

export interface FrlDerivedResult {
  done: boolean;
  current: number;
  target: number;
}

export interface FrlManualState {
  status: 'pending' | 'done' | 'not_applicable';
  completedOn: string | null;
  note: string | null;
  minutesSpent: number | null;
}

export type FrlChecklistItemStatus =
  | 'verified'        // derived, condition met
  | 'not_met'         // derived, condition evaluated and not met
  | 'not_verifiable'  // derived, evaluation failed (missing table, error)
  | 'done'            // manual, founder confirmed
  | 'not_applicable'  // manual, founder ruled it out
  | 'pending';        // manual, not confirmed yet

export interface FrlChecklistItem extends FrlChecklistItemDef {
  status: FrlChecklistItemStatus;
  /** Derived progress (e.g. contacts 35/100) when the source reports counts. */
  current: number | null;
  target: number | null;
  completedOn: string | null;
  note: string | null;
  minutesSpent: number | null;
}

/**
 * Pure assembly. Derived results that are absent (evaluation failed) surface as
 * 'not_verifiable', never as done and never as silently skipped. Manual state
 * for derived keys is ignored by construction.
 */
export function assembleFrlChecklist(
  derived: Record<string, FrlDerivedResult | undefined>,
  manual: Record<string, FrlManualState | undefined>,
): FrlChecklistItem[] {
  return FRL_CHECKLIST.map((def) => {
    if (def.kind === 'derived') {
      const res = derived[def.key];
      return {
        ...def,
        status: res ? (res.done ? 'verified' : 'not_met') : 'not_verifiable',
        current: res ? res.current : null,
        target: res ? res.target : null,
        completedOn: null,
        note: null,
        minutesSpent: null,
      };
    }
    const state = manual[def.key];
    return {
      ...def,
      status: state ? state.status : 'pending',
      current: null,
      target: null,
      completedOn: state?.completedOn ?? null,
      note: state?.note ?? null,
      minutesSpent: state?.minutesSpent ?? null,
    };
  });
}
