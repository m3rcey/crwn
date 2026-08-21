// Server-side assembly for the Money Model admin system (First Revenue Launch).
//
// Routes fetch through here so the list, detail, and cohort views share ONE
// implementation of "gather the rows, evaluate the checks, run the economics".
// Formulas live in ./economics (pure); derived checklist definitions in
// ./checklist; the guarantee comes from src/lib/launchPartner (the same brain
// the artist-facing checklist uses, so the two can never disagree).
//
// ADMIN ONLY: every caller must have passed requireAdmin() first. All reads use
// the service-role client; nothing here is reachable from a browser client.

import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluateCondition } from '@/lib/quests/evaluator';
import type { QuestInstance } from '@/lib/quests/types';
import {
  assembleLaunchPartnerChecklist,
  buildLaunchPartnerDefs,
  eligibleContactsResult,
  type LaunchPartnerChecklist,
  type LaunchPartnerConditionResult,
} from '@/lib/launchPartner';
import {
  FRL_CHECKLIST,
  assembleFrlChecklist,
  type FrlChecklistItem,
  type FrlDerivedResult,
  type FrlManualState,
} from './checklist';
import {
  computeEngagementEconomics,
  type EarningRow,
  type EngagementEconomics,
  type FrlWorkEntry,
} from './economics';
import { TIER_PRICING } from '@/lib/platformTier';
import { resolveAttribution } from '@/lib/analytics/attributionLookup';
import { FUNNEL_STAGES, type FunnelStage } from '@/lib/analytics/funnelEvents';
import { getLeadMagnetSeed } from '@/lib/leadResults/handoffSeed';
import { assignSubAvatar, evidenceFromInputs } from '@/lib/avatars/assignment';
import { recommendRevenueModel } from '@/lib/avatars/revenueModels';

type Admin = SupabaseClient;

export interface FrlEngagementRow {
  id: string;
  artist_id: string;
  engagement_type: 'founding_cohort' | 'standard' | 'self_serve';
  status: 'agreed' | 'active' | 'completed' | 'cancelled';
  started_on: string | null;
  target_launch_on: string | null;
  actual_launch_on: string | null;
  guarantee_eligible_on: string | null;
  completed_on: string | null;
  owner_user_id: string | null;
  notes: string | null;
  fee_agreed_cents: number | null;
  fee_collected_cents: number | null;
  discount_cents: number | null;
  discount_reason: string | null;
  required_plan: 'pro' | 'scale' | null;
  invoice_ref: string | null;
  payment_status: 'unpaid' | 'partial' | 'paid' | 'waived';
  acquisition_cost_cents: number | null;
  acquisition_cost_note: string | null;
  deliverables: string | null;
  exclusions: string | null;
  migration_scope: string | null;
  revision_allowance: number | null;
  revisions_used: number;
  support_period_days: number | null;
  additional_work_notes: string | null;
  case_study_consent: string;
  testimonial_consent: string;
  performance_data_consent: string;
  consent_on: string | null;
  consent_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FrlArtistMeta {
  artistId: string;
  userId: string | null;
  slug: string | null;
  displayName: string | null;
  platformTier: string | null;
  platformSubscriptionStatus: string | null;
  billingInterval: string | null;
  recommendedPlan: string | null;
  projectedMonthlyGmvCents: number | null;
}

/** Everything the admin detail screen renders for one engagement. */
export interface FrlEngagementDetail {
  engagement: FrlEngagementRow;
  artist: FrlArtistMeta;
  economics: EngagementEconomics;
  guarantee: LaunchPartnerChecklist;
  checklist: FrlChecklistItem[];
  workEntries: Array<{
    id: string;
    category: string;
    work_on: string;
    minutes: number;
    person_user_id: string | null;
    note: string | null;
    external_cost_cents: number | null;
  }>;
  assumptions: { founderHourlyCents: number | null };
  attribution: FrlAttributionPath;
}

export interface FrlAttributionPath {
  /** First-touch persisted dims (null = never attributed; unknown, not "organic"). */
  dims: Record<string, string | null> | null;
  /** First occurrence of each canonical funnel stage, in funnel order. */
  timeline: Array<{ stage: FunnelStage; occurredAt: string; calculator: string | null; campaign: string | null; video: string | null }>;
  calculators: string[];
  subAvatar: { id: string; source: 'override' | 'derived'; confidence: string | null } | null;
  revenueModel: { model: string; isDefault: boolean; confidence: string } | null;
}

// ---- fetch helpers ----------------------------------------------------------

const PAID_TYPES = ['subscription', 'purchase', 'booking', 'live_ticket', 'live_tip'];

/** Full earnings history for one artist, paged so PostgREST's row cap cannot
 *  silently truncate a sum. */
export async function fetchEarningRows(admin: Admin, artistId: string): Promise<EarningRow[]> {
  const out: EarningRow[] = [];
  const page = 1000;
  for (let i = 0; i < 40; i++) {
    const { data, error } = await admin
      .from('earnings')
      .select('type, gross_amount, platform_fee, net_amount, created_at')
      .eq('artist_id', artistId)
      .order('created_at', { ascending: true })
      .range(i * page, (i + 1) * page - 1);
    if (error || !data) break;
    for (const r of data) {
      out.push({
        type: String(r.type ?? ''),
        grossCents: Number(r.gross_amount) || 0,
        feeCents: Number(r.platform_fee) || 0,
        netCents: Number(r.net_amount) || 0,
        occurredAt: String(r.created_at ?? ''),
      });
    }
    if (data.length < page) break;
  }
  return out;
}

async function fetchFirstPaidAt(admin: Admin, artistId: string, earnings: EarningRow[]): Promise<string | null> {
  try {
    const { data } = await admin
      .from('funnel_events')
      .select('occurred_at')
      .eq('stage', 'first_paid_conversion')
      .eq('artist_id', artistId)
      .order('occurred_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data?.occurred_at) return String(data.occurred_at);
  } catch {
    // fall through to the ledger
  }
  // Fallback for artists who predate the recorder: earliest positive paid row.
  const first = earnings
    .filter((r) => PAID_TYPES.includes(r.type) && r.grossCents > 0)
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))[0];
  return first ? first.occurredAt : null;
}

async function fetchPaidMemberCount(admin: Admin, artistId: string): Promise<number | null> {
  try {
    const { data, error } = await admin
      .from('subscriptions')
      .select('id, subscription_tiers!subscriptions_tier_id_fkey(price)')
      .eq('artist_id', artistId)
      .eq('status', 'active');
    if (error || !data) return null;
    return data.filter((s) => {
      const tier = s.subscription_tiers as { price?: number } | Array<{ price?: number }> | null;
      const price = Array.isArray(tier) ? tier[0]?.price : tier?.price;
      return (Number(price) || 0) > 0;
    }).length;
  } catch {
    return null;
  }
}

export async function fetchCostAssumptions(admin: Admin): Promise<{ founderHourlyCents: number | null }> {
  try {
    const { data } = await admin
      .from('admin_settings')
      .select('value')
      .eq('key', 'frl_cost_assumptions')
      .maybeSingle();
    const v = (data?.value ?? null) as { founder_hourly_cents?: unknown } | null;
    const cents = v && typeof v.founder_hourly_cents === 'number' && Number.isFinite(v.founder_hourly_cents)
      ? Math.max(0, Math.round(v.founder_hourly_cents))
      : null;
    return { founderHourlyCents: cents };
  } catch {
    return { founderHourlyCents: null };
  }
}

function planMonthlyCents(tier: string | null, interval: string | null): number | null {
  if (!tier || tier === 'starter') return null;
  const pricing = (TIER_PRICING as Record<string, { monthly?: number; annual?: number }>)[tier];
  if (!pricing) return null;
  if ((interval === 'annual' || interval === 'year') && typeof pricing.annual === 'number') {
    return Math.round(pricing.annual / 12);
  }
  return typeof pricing.monthly === 'number' ? pricing.monthly : null;
}

export async function fetchArtistMeta(admin: Admin, artistId: string): Promise<FrlArtistMeta | null> {
  const { data: artist, error } = await admin
    .from('artist_profiles')
    .select('id, user_id, slug, platform_tier, platform_subscription_status, platform_billing_interval, recommended_plan, projected_monthly_gmv')
    .eq('id', artistId)
    .maybeSingle();
  if (error || !artist) return null;
  let displayName: string | null = null;
  if (artist.user_id) {
    const { data: profile } = await admin
      .from('profiles')
      .select('display_name')
      .eq('id', artist.user_id)
      .maybeSingle();
    displayName = (profile?.display_name as string | null) ?? null;
  }
  return {
    artistId: artist.id as string,
    userId: (artist.user_id as string | null) ?? null,
    slug: (artist.slug as string | null) ?? null,
    displayName,
    platformTier: (artist.platform_tier as string | null) ?? null,
    platformSubscriptionStatus: (artist.platform_subscription_status as string | null) ?? null,
    billingInterval: (artist.platform_billing_interval as string | null) ?? null,
    recommendedPlan: (artist.recommended_plan as string | null) ?? null,
    projectedMonthlyGmvCents: typeof artist.projected_monthly_gmv === 'number' ? artist.projected_monthly_gmv : null,
  };
}

// ---- checklist evaluation ---------------------------------------------------

async function evalCheck(
  admin: Admin,
  artistId: string,
  userId: string | null,
  check: string,
  count?: number,
): Promise<FrlDerivedResult> {
  const instance = {
    id: `frl-admin:${check}`,
    user_id: userId ?? artistId,
    artist_id: artistId,
    status: 'active',
    progress_percent: 0,
    completion_condition: { kind: 'domain', check, count },
  } as unknown as QuestInstance;
  const res = await evaluateCondition(admin, instance);
  return { done: res.done, current: res.current, target: res.target };
}

async function countRows(
  admin: Admin,
  table: string,
  filters: Record<string, unknown>,
): Promise<number | null> {
  try {
    let q = admin.from(table).select('id', { count: 'exact', head: true });
    for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
    const { count, error } = await q;
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

async function evalEligibleContacts(admin: Admin, artistId: string): Promise<FrlDerivedResult | undefined> {
  const [total, proven] = await Promise.all([
    countRows(admin, 'fan_contacts', { artist_id: artistId }),
    (async () => {
      try {
        const { count, error } = await admin
          .from('fan_contacts')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artistId)
          .contains('tags', ['patreon']);
        return error ? null : count ?? 0;
      } catch {
        return null;
      }
    })(),
  ]);
  if (total === null) return undefined; // not verifiable, never "not met"
  return eligibleContactsResult(total, proven ?? 0);
}

/** Evaluate every derived checklist item. A failed evaluation yields undefined
 *  for that key, which assembles as 'not_verifiable' (never met, never done). */
export async function evaluateDerivedChecklist(
  admin: Admin,
  artistId: string,
  userId: string | null,
): Promise<Record<string, FrlDerivedResult | undefined>> {
  const out: Record<string, FrlDerivedResult | undefined> = {};
  await Promise.all(
    FRL_CHECKLIST.filter((d) => d.kind === 'derived' && d.source).map(async (def) => {
      const source = def.source!;
      try {
        if (source.kind === 'check') {
          out[def.key] = await evalCheck(admin, artistId, userId, source.check as string, source.count);
        } else if (source.kind === 'checkAll') {
          const results = await Promise.all(
            source.checks.map((c) => evalCheck(admin, artistId, userId, c as string)),
          );
          const passed = results.filter((r) => r.done).length;
          out[def.key] = { done: passed === results.length, current: passed, target: results.length };
        } else if (source.query === 'eligible_contacts') {
          out[def.key] = await evalEligibleContacts(admin, artistId);
        } else if (source.query === 'campaign_drafts_exist') {
          const n = await countRows(admin, 'campaigns', { artist_id: artistId });
          out[def.key] = n === null ? undefined : { done: n >= 1, current: n, target: 1 };
        } else if (source.query === 'warm_fans_invited') {
          const n = await countRows(admin, 'funnel_events', { artist_id: artistId, stage: 'fan_invited' });
          out[def.key] = n === null ? undefined : { done: n >= 1, current: n, target: 1 };
        } else if (source.query === 'fulfillment_delivered') {
          const n = await countRows(admin, 'fulfillment_events', { artist_id: artistId, status: 'completed' });
          out[def.key] = n === null ? undefined : { done: n >= 1, current: n, target: 1 };
        }
      } catch {
        out[def.key] = undefined;
      }
    }),
  );
  return out;
}

/** The First Paid Member Guarantee checklist for ANY artist, computed with the
 *  same defs + evaluator as the artist-facing route. The launch_partner flag
 *  gates the artist-facing card, not this admin computation. */
export async function computeGuaranteeChecklist(
  admin: Admin,
  artistId: string,
  userId: string | null,
  slug: string | null,
): Promise<LaunchPartnerChecklist> {
  const defs = buildLaunchPartnerDefs({ slug });
  const evaluated = await Promise.all(
    defs.map(async (def): Promise<[string, LaunchPartnerConditionResult | undefined]> => {
      try {
        if (def.source.kind === 'query') {
          const res = await evalEligibleContacts(admin, artistId);
          return [def.key, res];
        }
        const res = await evalCheck(admin, artistId, userId, def.source.check as string, def.source.count);
        return [def.key, res];
      } catch {
        return [def.key, undefined];
      }
    }),
  );
  return assembleLaunchPartnerChecklist(defs, Object.fromEntries(evaluated));
}

// ---- attribution ------------------------------------------------------------

export async function buildAttributionPath(
  admin: Admin,
  artistId: string,
  userId: string | null,
): Promise<FrlAttributionPath> {
  let dims: Record<string, string | null> | null = null;
  try {
    const resolved = await resolveAttribution(admin, { userId: userId ?? undefined, artistId });
    dims = resolved ? (resolved as unknown as Record<string, string | null>) : null;
  } catch {
    dims = null;
  }

  const timeline: FrlAttributionPath['timeline'] = [];
  try {
    const or = userId ? `artist_id.eq.${artistId},user_id.eq.${userId}` : `artist_id.eq.${artistId}`;
    const { data } = await admin
      .from('funnel_events')
      .select('stage, occurred_at, calculator, campaign, video')
      .or(or)
      .order('occurred_at', { ascending: true })
      .limit(2000);
    const first = new Map<string, { occurredAt: string; calculator: string | null; campaign: string | null; video: string | null }>();
    for (const row of data ?? []) {
      const stage = String(row.stage ?? '');
      if (!first.has(stage)) {
        first.set(stage, {
          occurredAt: String(row.occurred_at ?? ''),
          calculator: (row.calculator as string | null) ?? null,
          campaign: (row.campaign as string | null) ?? null,
          video: (row.video as string | null) ?? null,
        });
      }
    }
    for (const stage of FUNNEL_STAGES) {
      const hit = first.get(stage);
      if (hit) timeline.push({ stage, ...hit });
    }
  } catch {
    // timeline stays empty; the UI says "no funnel events recorded"
  }

  let calculators: string[] = [];
  let seedInputs: Record<string, unknown> | null = null;
  try {
    const { data } = await admin
      .from('lead_magnet_results')
      .select('tool_slug, input_data, created_at')
      .or(userId ? `artist_id.eq.${artistId},user_id.eq.${userId}` : `artist_id.eq.${artistId}`)
      .order('created_at', { ascending: true })
      .limit(20);
    calculators = [...new Set((data ?? []).map((r) => String(r.tool_slug ?? '')).filter(Boolean))];
    seedInputs = (data?.[0]?.input_data as Record<string, unknown> | null) ?? null;
  } catch {
    calculators = [];
  }

  // Sub-avatar: the manual override wins; otherwise derive from the earliest
  // claimed calculator inputs, exactly as the avatar surfaces do.
  let subAvatar: FrlAttributionPath['subAvatar'] = null;
  try {
    const { data: row } = await admin
      .from('artist_profiles')
      .select('sub_avatar_override')
      .eq('id', artistId)
      .maybeSingle();
    const override = (row?.sub_avatar_override as string | null) ?? null;
    if (override) {
      subAvatar = { id: override, source: 'override', confidence: null };
    } else if (seedInputs) {
      const assignment = assignSubAvatar(evidenceFromInputs(seedInputs));
      if (assignment) {
        subAvatar = { id: assignment.primarySubAvatar, source: 'derived', confidence: assignment.confidence };
      }
    }
  } catch {
    subAvatar = null;
  }

  // Revenue model prescription, derived the same way /api/artist/strategy does.
  let revenueModel: FrlAttributionPath['revenueModel'] = null;
  try {
    let seed = seedInputs;
    if (!seed && userId) {
      const s = await getLeadMagnetSeed(admin, { userId, artistId });
      seed = s?.inputData ?? null;
    }
    const [{ count: liveCount }, { count: productCount }] = await Promise.all([
      admin.from('live_sessions').select('id', { count: 'exact', head: true }).eq('artist_id', artistId).eq('status', 'ended'),
      admin.from('products').select('id', { count: 'exact', head: true }).eq('artist_id', artistId).not('is_active', 'is', false),
    ]);
    const rec = recommendRevenueModel(
      { ...evidenceFromInputs(seed), liveSessionsHosted: liveCount ?? 0 },
      { productsListed: productCount ?? 0 },
    );
    revenueModel = { model: rec.model, isDefault: rec.isDefault, confidence: rec.confidence };
  } catch {
    revenueModel = null;
  }

  return { dims, timeline, calculators, subAvatar, revenueModel };
}

// ---- full detail ------------------------------------------------------------

export async function buildEngagementDetail(
  admin: Admin,
  engagement: FrlEngagementRow,
  opts: { nowIso?: string } = {},
): Promise<FrlEngagementDetail | null> {
  const artist = await fetchArtistMeta(admin, engagement.artist_id);
  if (!artist) return null;
  const nowIso = opts.nowIso ?? new Date().toISOString();

  const [earnings, workRows, manualRows, assumptions, guarantee, derived, attribution] = await Promise.all([
    fetchEarningRows(admin, engagement.artist_id),
    admin
      .from('frl_work_entries')
      .select('id, category, work_on, minutes, person_user_id, note, external_cost_cents')
      .eq('engagement_id', engagement.id)
      .order('work_on', { ascending: true })
      .then((r) => r.data ?? []),
    admin
      .from('frl_checklist_state')
      .select('item_key, status, completed_on, note, minutes_spent')
      .eq('engagement_id', engagement.id)
      .then((r) => r.data ?? []),
    fetchCostAssumptions(admin),
    computeGuaranteeChecklist(admin, engagement.artist_id, artist.userId, artist.slug),
    evaluateDerivedChecklist(admin, engagement.artist_id, artist.userId),
    buildAttributionPath(admin, engagement.artist_id, artist.userId),
  ]);

  const [firstPaidAt, paidMemberCount] = await Promise.all([
    fetchFirstPaidAt(admin, engagement.artist_id, earnings),
    fetchPaidMemberCount(admin, engagement.artist_id),
  ]);

  const work: FrlWorkEntry[] = workRows.map((w) => ({
    category: w.category as FrlWorkEntry['category'],
    workOn: String(w.work_on ?? ''),
    minutes: Number(w.minutes) || 0,
    externalCostCents: w.external_cost_cents === null || w.external_cost_cents === undefined
      ? null
      : Number(w.external_cost_cents) || 0,
  }));

  const economics = computeEngagementEconomics({
    startedOn: engagement.started_on,
    guaranteeEligibleOn: engagement.guarantee_eligible_on,
    feeAgreedCents: engagement.fee_agreed_cents,
    feeCollectedCents: engagement.fee_collected_cents,
    acquisitionCostCents: engagement.acquisition_cost_cents,
    platformTier: artist.platformTier,
    platformSubscriptionStatus: artist.platformSubscriptionStatus,
    planMonthlyCents: planMonthlyCents(artist.platformTier, artist.billingInterval),
    earnings,
    work,
    assumptions,
    firstPaidAt,
    paidMemberCount,
    guaranteeAchieved: guarantee.status === 'achieved',
    nowIso,
  });

  const manual: Record<string, FrlManualState | undefined> = {};
  for (const row of manualRows) {
    manual[String(row.item_key)] = {
      status: (row.status as FrlManualState['status']) ?? 'pending',
      completedOn: (row.completed_on as string | null) ?? null,
      note: (row.note as string | null) ?? null,
      minutesSpent: row.minutes_spent === null || row.minutes_spent === undefined ? null : Number(row.minutes_spent),
    };
  }

  return {
    engagement,
    artist,
    economics,
    guarantee,
    checklist: assembleFrlChecklist(derived, manual),
    workEntries: workRows.map((w) => ({
      id: String(w.id),
      category: String(w.category),
      work_on: String(w.work_on ?? ''),
      minutes: Number(w.minutes) || 0,
      person_user_id: (w.person_user_id as string | null) ?? null,
      note: (w.note as string | null) ?? null,
      external_cost_cents: w.external_cost_cents === null || w.external_cost_cents === undefined
        ? null
        : Number(w.external_cost_cents),
    })),
    assumptions,
    attribution,
  };
}
