// store.ts — the ONLY reader and writer of the campaign spine tables.
//
// SERVICE ROLE ONLY. `fan_campaigns` and `fan_campaign_participants` have no client write policy
// (see supabase/schema-phase3-fan-campaigns.sql), so every insert and update lands here, behind a
// session ownership check the caller performs.
//
// FAILS SOFT BEFORE THE MIGRATION RUNS. `42P01` (table missing) and PostgREST's `PGRST205` are
// treated as "no campaigns", so the product behaves exactly as it did before the migration is
// applied rather than 500ing an artist's page. Every other error is surfaced.
//
// IT COMPOSES, IT DOES NOT COPY. Results are assembled by asking the canonical rails a narrower
// question and handing the rows to the pure `buildCampaignResults`. Nothing here computes a
// commission, decides an attribution, or writes to `referrals`, `referral_earnings`, `earnings`,
// `subscriptions` or any payout table.

import type { SupabaseClient } from '@supabase/supabase-js';
import { archetypeFor } from './archetypes';
import { isCampaignStatus, type CampaignStatus } from './lifecycle';
import { buildCampaignResults, type CampaignResults, type ParticipantInput } from './results';

const CAMPAIGNS = 'fan_campaigns';
const PARTICIPANTS = 'fan_campaign_participants';

export interface CampaignRow {
  id: string;
  artist_id: string;
  archetype: string;
  title: string;
  status: CampaignStatus;
  toolkit: Record<string, string>;
  incentive_kind: string;
  starts_at: string | null;
  ends_at: string;
  source_constraint: string | null;
  recommendation_action_key: string | null;
  created_at: string;
}

const COLUMNS =
  'id, artist_id, archetype, title, status, toolkit, incentive_kind, starts_at, ends_at, source_constraint, recommendation_action_key, created_at';

/** Table-not-there yet. The product must be identical before and after the migration. */
function isMissingTable(error: { code?: string | null } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

function normalize(row: Record<string, unknown>): CampaignRow | null {
  const status = row.status;
  if (!isCampaignStatus(status)) return null;
  return {
    id: String(row.id),
    artist_id: String(row.artist_id),
    archetype: String(row.archetype),
    title: String(row.title ?? ''),
    status,
    toolkit: (row.toolkit as Record<string, string>) ?? {},
    incentive_kind: String(row.incentive_kind ?? 'non_cash'),
    starts_at: (row.starts_at as string) ?? null,
    ends_at: String(row.ends_at),
    source_constraint: (row.source_constraint as string) ?? null,
    recommendation_action_key: (row.recommendation_action_key as string) ?? null,
    created_at: String(row.created_at),
  };
}

/** Every campaign this artist owns, newest first. Empty before the migration runs. */
export async function listArtistCampaigns(
  db: SupabaseClient,
  artistId: string,
): Promise<CampaignRow[]> {
  const { data, error } = await db
    .from(CAMPAIGNS)
    .select(COLUMNS)
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    if (!isMissingTable(error)) console.error('fan_campaigns read failed:', error.code, error.message);
    return [];
  }
  return (data ?? []).map(normalize).filter((c): c is CampaignRow => c !== null);
}

/** One campaign, by id. Ownership is the CALLER's job; this does not assume it. */
export async function readCampaign(db: SupabaseClient, id: string): Promise<CampaignRow | null> {
  const { data, error } = await db.from(CAMPAIGNS).select(COLUMNS).eq('id', id).maybeSingle();
  if (error || !data) return null;
  return normalize(data);
}

/** The artist's currently-running campaign, if any. At most one exists (partial unique index). */
export async function readActiveCampaign(
  db: SupabaseClient,
  artistId: string,
): Promise<CampaignRow | null> {
  const { data, error } = await db
    .from(CAMPAIGNS)
    .select(COLUMNS)
    .eq('artist_id', artistId)
    .eq('status', 'active')
    .maybeSingle();
  if (error || !data) return null;
  return normalize(data);
}

export interface CreateCampaignInput {
  artistId: string;
  archetype: string;
  title: string;
  endsAt: string;
  toolkit: Record<string, string>;
  /** Z3 linkage. The constraint diagnosed at creation, and its existing durable action identity. */
  sourceConstraint: string | null;
  recommendationActionKey: string | null;
  /** Launch immediately (the caller has already run checkLaunchReady). */
  launch: boolean;
  now: string;
}

export async function createCampaign(
  db: SupabaseClient,
  input: CreateCampaignInput,
): Promise<{ campaign: CampaignRow | null; error: string | null }> {
  const { data, error } = await db
    .from(CAMPAIGNS)
    .insert({
      artist_id: input.artistId,
      archetype: input.archetype,
      title: input.title,
      status: input.launch ? 'active' : 'draft',
      toolkit: input.toolkit,
      incentive_kind: 'non_cash',
      starts_at: input.launch ? input.now : null,
      ends_at: input.endsAt,
      source_constraint: input.sourceConstraint,
      recommendation_action_key: input.recommendationActionKey,
    })
    .select(COLUMNS)
    .single();

  if (error) {
    if (isMissingTable(error)) {
      return { campaign: null, error: 'Campaigns are not switched on yet.' };
    }
    // 23505 here is the one-active-campaign index, which is a product rule, not a fault.
    if (error.code === '23505') {
      return { campaign: null, error: 'You already have a drive running. End it before starting another.' };
    }
    console.error('fan_campaigns insert failed:', error.code, error.message);
    return { campaign: null, error: 'Could not create the drive.' };
  }
  return { campaign: data ? normalize(data) : null, error: null };
}

/** Update the toolkit and window of a DRAFT. An active campaign's terms do not change under people. */
export async function updateDraft(
  db: SupabaseClient,
  id: string,
  patch: { title?: string; endsAt?: string; toolkit?: Record<string, string> },
): Promise<boolean> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) payload.title = patch.title;
  if (patch.endsAt !== undefined) payload.ends_at = patch.endsAt;
  if (patch.toolkit !== undefined) payload.toolkit = patch.toolkit;
  const { error } = await db.from(CAMPAIGNS).update(payload).eq('id', id).eq('status', 'draft');
  if (error) console.error('fan_campaigns draft update failed:', error.code, error.message);
  return !error;
}

/**
 * Move a campaign to its next state. The `.eq('status', from)` guard makes every transition
 * idempotent and race-safe: two clicks on "End drive" write once.
 */
export async function transitionCampaign(
  db: SupabaseClient,
  id: string,
  from: CampaignStatus,
  to: CampaignStatus,
  now: string,
): Promise<boolean> {
  const payload: Record<string, unknown> = { status: to, updated_at: now };
  if (to === 'active') payload.starts_at = now;
  // `ends_at` is pulled in when an artist closes early, so the report window matches what actually
  // happened rather than what was planned. A window that outlives the campaign would keep counting
  // referrals into a drive nobody is running.
  if (to === 'ended') payload.ends_at = now;
  const { error } = await db.from(CAMPAIGNS).update(payload).eq('id', id).eq('status', from);
  if (error) {
    console.error('fan_campaigns transition failed:', error.code, error.message);
    return false;
  }
  return true;
}

export interface ParticipantRow {
  fan_id: string;
  role: string;
  joined_at: string;
}

export async function listParticipants(
  db: SupabaseClient,
  campaignId: string,
): Promise<ParticipantRow[]> {
  const { data, error } = await db
    .from(PARTICIPANTS)
    .select('fan_id, role, joined_at')
    .eq('campaign_id', campaignId)
    .order('joined_at', { ascending: true })
    .limit(500);
  if (error) {
    if (!isMissingTable(error)) console.error('participants read failed:', error.code, error.message);
    return [];
  }
  return (data ?? []) as ParticipantRow[];
}

/**
 * Join, idempotently. The UNIQUE (campaign_id, fan_id) index is the guarantee: a double submit
 * collides and is reported as already-joined rather than creating a second participation.
 */
export async function joinCampaign(
  db: SupabaseClient,
  campaignId: string,
  fanId: string,
  role: string,
): Promise<{ joined: boolean; alreadyJoined: boolean; error: string | null }> {
  const { error } = await db
    .from(PARTICIPANTS)
    .insert({ campaign_id: campaignId, fan_id: fanId, role });
  if (!error) return { joined: true, alreadyJoined: false, error: null };
  if (error.code === '23505') return { joined: false, alreadyJoined: true, error: null };
  if (isMissingTable(error)) return { joined: false, alreadyJoined: false, error: 'Not switched on yet.' };
  console.error('campaign join failed:', error.code, error.message);
  return { joined: false, alreadyJoined: false, error: 'Could not join.' };
}

/**
 * The participant RECORDED as this campaign's winner, or null.
 *
 * This is how the fulfilment endpoint learns who won: the browser never names a fan. Returns
 * null (never throws) when the column does not exist yet, so the product behaves exactly as it
 * did before the migration rather than 500ing.
 */
export async function selectedWinner(
  db: SupabaseClient,
  campaignId: string,
): Promise<{ fan_id: string; selected_winner_at: string } | null> {
  const { data, error } = await db
    .from(PARTICIPANTS)
    .select('fan_id, selected_winner_at')
    .eq('campaign_id', campaignId)
    .not('selected_winner_at', 'is', null)
    .maybeSingle();
  if (error) {
    // 42703 = the winner migration has not been applied. Naming a missing column fails the
    // WHOLE statement and supabase-js returns an object rather than throwing, so this must be
    // read as "no winner recorded", which is the truth before the column exists.
    if (error.code !== '42703' && !isMissingTable(error)) {
      console.error('selected winner read failed:', error.code, error.message);
    }
    return null;
  }
  return (data as { fan_id: string; selected_winner_at: string } | null) ?? null;
}

export type RecordWinnerResult =
  | { recorded: true; alreadyWinner: boolean }
  | { recorded: false; reason: 'not_a_participant' | 'winner_already_selected' | 'not_supported' | 'write_failed' };

/**
 * Write down who won. The RESULT of a selection, never the selection itself.
 *
 * The one-winner guarantee is the database's partial unique index, not this function: two
 * concurrent requests both pass the pre-check and exactly one commits, so `23505` is a normal
 * outcome and is translated into the same friendly refusal as the pre-check. Recording the
 * SAME participant twice is idempotent and reports success, because a retried request should
 * not read as a failure.
 *
 * Caller must have already proven ownership and lifecycle. This function trusts its arguments,
 * which is why it is not exported through any route without that chain in front of it.
 */
export async function recordCampaignWinner(
  db: SupabaseClient,
  campaignId: string,
  fanId: string,
  now: string,
): Promise<RecordWinnerResult> {
  const existing = await selectedWinner(db, campaignId);
  if (existing) {
    return existing.fan_id === fanId
      ? { recorded: true, alreadyWinner: true }
      : { recorded: false, reason: 'winner_already_selected' };
  }

  // Update, never upsert: a winner must be an EXISTING participant. Someone who never entered
  // cannot be made to have entered by winning.
  const { data, error } = await db
    .from(PARTICIPANTS)
    .update({ selected_winner_at: now })
    .eq('campaign_id', campaignId)
    .eq('fan_id', fanId)
    .is('selected_winner_at', null)
    .select('fan_id');

  if (error) {
    if (error.code === '23505') return { recorded: false, reason: 'winner_already_selected' };
    if (error.code === '42703') return { recorded: false, reason: 'not_supported' };
    console.error('record winner failed:', error.code, error.message);
    return { recorded: false, reason: 'write_failed' };
  }
  if (!data || data.length === 0) return { recorded: false, reason: 'not_a_participant' };
  return { recorded: true, alreadyWinner: false };
}

export async function isParticipant(
  db: SupabaseClient,
  campaignId: string,
  fanId: string,
): Promise<ParticipantRow | null> {
  const { data, error } = await db
    .from(PARTICIPANTS)
    .select('fan_id, role, joined_at')
    .eq('campaign_id', campaignId)
    .eq('fan_id', fanId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ParticipantRow;
}

/**
 * Assemble the report from the canonical rails.
 *
 * Three reads, none of which is a write and none of which recomputes anything:
 *   1. who joined                        -> the participation table (a campaign fact)
 *   2. `referrals` for this artist       -> the ONE attribution rail, written at the Stripe webhook
 *   3. `referral_earnings` for those ids -> the ONE commission rail, amount read as stored
 *
 * The window filter and the participant filter happen in the pure function, so the rule is testable
 * without a database.
 */
export async function readCampaignResults(
  db: SupabaseClient,
  campaign: CampaignRow,
): Promise<CampaignResults> {
  const participants = await listParticipants(db, campaign.id);
  const fanIds = participants.map((p) => p.fan_id);

  const names = new Map<string, string | null>();
  if (fanIds.length > 0) {
    const { data } = await db.from('profiles').select('id, display_name, username').in('id', fanIds);
    for (const p of data ?? []) {
      names.set(p.id as string, (p.display_name as string) || (p.username as string) || null);
    }
  }

  const participantInputs: ParticipantInput[] = participants.map((p) => ({
    fanId: p.fan_id,
    displayName: names.get(p.fan_id) ?? null,
    joinedAt: p.joined_at,
  }));

  let referrals: { id: string; referrerFanId: string; createdAt: string; status: string | null }[] = [];
  let commissions: { referralId: string; commissionAmountCents: number | null }[] = [];

  if (fanIds.length > 0 && campaign.starts_at) {
    const { data: refRows } = await db
      .from('referrals')
      .select('id, referrer_fan_id, created_at, status')
      .eq('artist_id', campaign.artist_id)
      .in('referrer_fan_id', fanIds)
      .gte('created_at', campaign.starts_at)
      .lt('created_at', campaign.ends_at);
    referrals = (refRows ?? []).map((r) => ({
      id: r.id as string,
      referrerFanId: r.referrer_fan_id as string,
      createdAt: r.created_at as string,
      status: (r.status as string) ?? null,
    }));

    if (referrals.length > 0) {
      const { data: earnRows } = await db
        .from('referral_earnings')
        .select('referral_id, commission_amount')
        .in('referral_id', referrals.map((r) => r.id));
      commissions = (earnRows ?? []).map((e) => ({
        referralId: e.referral_id as string,
        commissionAmountCents:
          typeof e.commission_amount === 'number' ? e.commission_amount : null,
      }));
    }
  }

  return buildCampaignResults({
    window: { startsAt: campaign.starts_at, endsAt: campaign.ends_at },
    participants: participantInputs,
    referrals,
    commissions,
  });
}

/**
 * Grant the archetype's non-cash badge at the end of a drive.
 *
 * Called once, on the ended transition. `awardFanBadge` is idempotent per (fan, artist, badge_key)
 * and only notifies on a genuinely new award, so a repeat call adds no row and sends nothing. It is
 * recognition on a fact the referral rail already established, not a payout, not an entitlement, and
 * not a new reward vocabulary.
 *
 * RETURNS the number of participants who HOLD the badge afterwards, not the number of rows this
 * call inserted. `awardFanBadge` returns true for an already-held badge (its upsert ignores
 * duplicates without erroring), so a count of "newly granted" is not something this layer can
 * honestly report, and the caller's field is named for what the number actually means.
 */
export async function awardCampaignBadges(
  db: SupabaseClient,
  campaign: CampaignRow,
  earnerFanIds: string[],
  artistName?: string,
): Promise<number> {
  const archetype = archetypeFor(campaign.archetype);
  if (!archetype || earnerFanIds.length === 0) return 0;
  const { awardFanBadge } = await import('@/lib/fanBadges');
  let granted = 0;
  for (const fanId of earnerFanIds) {
    const ok = await awardFanBadge(db, {
      artistId: campaign.artist_id,
      fanId,
      badgeKey: archetype.incentive.badgeKey,
      source: 'mission',
      sourceId: campaign.id,
      artistName,
    });
    if (ok) granted += 1;
  }
  return granted;
}
