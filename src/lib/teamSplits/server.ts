// Team Splits — server-side helpers shared by the API routes and crons.
// All functions take a service-role `admin` client (writes bypass RLS after the
// route has already checked ownership).

import type { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import type { TeamSplitDeal, CollaboratorBalance } from './types';

export function newInviteToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

/** The fields that constitute the negotiable "terms" of a deal, snapshotted per version. */
export function termsSnapshot(deal: Partial<TeamSplitDeal>): Record<string, unknown> {
  return {
    title: deal.title,
    role: deal.role,
    custom_role: deal.custom_role,
    deal_type: deal.deal_type,
    revenue_source_type: deal.revenue_source_type,
    revenue_source_id: deal.revenue_source_id,
    revenue_source_label: deal.revenue_source_label,
    payout_basis: deal.payout_basis,
    percentage: deal.percentage,
    milestone_amount: deal.milestone_amount,
    upfront_amount: deal.upfront_amount,
    cap_amount: deal.cap_amount,
    minimum_payout_threshold: deal.minimum_payout_threshold,
    start_trigger: deal.start_trigger,
    starts_at: deal.starts_at,
    ends_at: deal.ends_at,
    duration_days: deal.duration_days,
    payout_starts_after_deliverable_approval: deal.payout_starts_after_deliverable_approval,
    hold_period_days: deal.hold_period_days,
    refund_policy: deal.refund_policy,
    cancellation_policy: deal.cancellation_policy,
    rights_notes: deal.rights_notes,
  };
}

export async function recordAudit(
  admin: SupabaseClient,
  dealId: string,
  actorUserId: string | null,
  eventType: string,
  eventData?: Record<string, unknown>,
): Promise<void> {
  await admin.from('team_split_audit_events').insert({
    deal_id: dealId,
    actor_user_id: actorUserId,
    event_type: eventType,
    event_data: eventData ?? null,
  });
}

/** Append a version row capturing the terms at this point. */
export async function recordVersion(
  admin: SupabaseClient,
  deal: TeamSplitDeal,
  changedByUserId: string | null,
  changeType: string,
  changesSummary?: string,
): Promise<void> {
  await admin.from('team_split_deal_versions').insert({
    deal_id: deal.id,
    version_number: deal.current_version,
    changed_by_user_id: changedByUserId,
    change_type: changeType,
    changes_summary: changesSummary ?? null,
    terms_snapshot: termsSnapshot(deal),
  });
}

/**
 * Are all approval-required deliverables approved? Gate for releasing payouts
 * when the deal requires deliverable approval first.
 */
export async function deliverablesApproved(admin: SupabaseClient, dealId: string): Promise<boolean> {
  const { data } = await admin
    .from('team_split_deliverables')
    .select('status, approval_required')
    .eq('deal_id', dealId)
    .eq('approval_required', true);
  if (!data || data.length === 0) return true; // nothing gated
  return data.every((d: { status: string }) => d.status === 'approved');
}

/** Compute a collaborator's money buckets from the accrual ledger + payouts. */
export async function collaboratorBalance(
  admin: SupabaseClient,
  collaboratorUserId: string,
  dealId?: string,
): Promise<CollaboratorBalance> {
  let q = admin
    .from('team_split_earnings')
    .select('commission_amount, status, released_at, cleared_at')
    .eq('collaborator_user_id', collaboratorUserId);
  if (dealId) q = q.eq('deal_id', dealId);
  const { data: earnings } = await q;

  const now = Date.now();
  let cashable = 0; // released + cleared positives, plus all clawbacks
  let estimatedHeld = 0; // positive accruals not yet cashable
  let reversed = 0;
  for (const e of earnings || []) {
    const amt = e.commission_amount as number;
    const status = e.status as string;
    if (status === 'reversed' || status === 'disputed') continue;
    if (amt < 0) {
      cashable += amt;
      reversed += -amt;
      continue;
    }
    const isCashable = e.released_at != null && new Date(e.cleared_at as string).getTime() <= now;
    if (isCashable) cashable += amt;
    else estimatedHeld += amt;
  }

  // Payouts (completed reduce available; pending are reserved). Payouts are
  // per-collaborator, not per-deal, so a per-deal balance reports gross cashable
  // for that deal and omits payout subtraction.
  const payoutQuery = admin
    .from('team_split_payouts')
    .select('amount, status')
    .eq('collaborator_user_id', collaboratorUserId);
  const { data: payouts } = dealId ? { data: [] as { amount: number; status: string }[] } : await payoutQuery;
  let paid = 0;
  let pending = 0;
  for (const p of payouts || []) {
    if (p.status === 'completed') paid += p.amount as number;
    else if (p.status === 'pending') pending += p.amount as number;
  }

  return {
    estimatedHeld,
    available: Math.max(0, cashable - paid - pending),
    paid,
    reversed,
  };
}

/** Fetch a deal and confirm the requesting user is a party (artist owner or collaborator). */
export async function getDealForUser(
  admin: SupabaseClient,
  dealId: string,
  userId: string,
): Promise<{ deal: TeamSplitDeal; isArtist: boolean; isCollaborator: boolean } | null> {
  const { data: deal } = await admin
    .from('team_split_deals')
    .select('*')
    .eq('id', dealId)
    .maybeSingle();
  if (!deal) return null;

  const { data: artistRow } = await admin
    .from('artist_profiles')
    .select('id')
    .eq('id', deal.artist_id)
    .eq('user_id', userId)
    .maybeSingle();

  const isArtist = !!artistRow;
  const isCollaborator = deal.collaborator_user_id === userId;
  if (!isArtist && !isCollaborator) return null;
  return { deal: deal as TeamSplitDeal, isArtist, isCollaborator };
}

/** Resolve the artist_profiles.id owned by a user (or null). */
export async function artistIdForUser(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin
    .from('artist_profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.id ?? null;
}
