// Founder follow-up: the loader (canonical owners -> evidence), the admin read, the hand-sent
// marker, and the daily runner. Every persuasion decision is in founderFollowUp.ts; this file
// only READS the owners and SENDS through channels.send().
//
// SERVER ONLY (service role). Full contract: docs/crwn-brain/34-FOUNDER-FOLLOW-UP.md.
//
// Where each fact comes from, and why that source:
//   qualified        lead_profiles.score_band (leadScoring.ts via rescore.ts). Read, never recomputed.
//   setup screen     setupProgress.ts over the same facts useArtistSetup reads.
//   Stripe/payable   paymentReadiness.ts (stripeChargesReady, tierPurchaseBlocker).
//   first paid       funnel_events stage 'first_paid_conversion' (paidConversion.ts, one per artist).
//   call booked      acquisition_events 'sales_call_booked' status 'recorded' (same as the dispatcher).
//   call requested   acquisition_events 'hot_lead_call_requested' whose snapshot names one of this
//                    lead's results (the request row stores no identity; the result is the join).
//   consent          lead_identities.consent_email; suppression email_suppressions. Both are
//                    re-checked by channels.send() at the moment of sending.
//   dedupe           acquisition_events.idempotency_key (unique index), key
//                    send:founder_followup:<version>:<lead>:<stage>. Same as every acquisition send.

import { supabaseAdmin } from './db';
import { send } from './channels';
import { loadIdentity, rotateLink, bookingUrlFor } from './automationDispatcher';
import {
  resolveFounderFollowUp,
  renderFounderFollowUp,
  RESULT_LINK_PLACEHOLDER,
  type FollowUpContext,
  type FollowUpEvidence,
  type FollowUpStage,
  type RenderedFollowUp,
} from './founderFollowUp';
import { stripeChargesReady, tierPurchaseBlocker } from '../stripe/paymentReadiness';
import { isEmailSuppressed } from '../leadMagnets/server';
import { getLeadMagnet } from '../leadMagnets/registry';
import { FOUNDER_FROM } from '../resend';
import { ADMIN_NOTIFY_EMAIL } from '../newArtistAlert';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://thecrwn.app';
/** How many qualified leads one daily run considers. Tier 1 volume is tiny; this is a backstop. */
const RUN_LIMIT = 200;

/** The kill switch. admin_settings.founder_followup = {"enabled": true}. Fails CLOSED. */
export async function isFounderFollowUpEnabled(): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin.from('admin_settings').select('value').eq('key', 'founder_followup').maybeSingle();
    return !!(data?.value as { enabled?: boolean } | null)?.enabled;
  } catch {
    return false;
  }
}

const TOOL_NAME_OVERRIDES: Record<string, string> = { worth: 'fanbase worth calculator' };

const ACTIVITY_LABEL: Record<string, string> = {
  account_created: 'Created their account',
  email_verified: 'Verified their email',
  setup_started: 'Started setup',
  setup_completed: 'Launched their page',
  stripe_connected: 'Connected Stripe',
};

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** Read every canonical owner for one lead and flatten it into evidence. */
export async function loadFollowUpEvidence(identityId: string): Promise<FollowUpEvidence | null> {
  const { data: identity } = await supabaseAdmin.from('lead_identities').select('*').eq('id', identityId).maybeSingle();
  if (!identity) return null;
  const userId = s(identity.user_id);
  const email = s(identity.email);

  const [{ data: profile }, { data: history }, { data: resultsByLead }, { data: resultsByUser }, { data: events }, { data: sessions }] =
    await Promise.all([
      supabaseAdmin.from('lead_profiles').select('score_band, lead_score, artist_name').eq('lead_identity_id', identityId).maybeSingle(),
      supabaseAdmin
        .from('lead_score_history')
        .select('reason_codes')
        .eq('lead_identity_id', identityId)
        .order('created_at', { ascending: false })
        .limit(1),
      supabaseAdmin
        .from('lead_magnet_results')
        .select('id, tool_slug, title, input_data, viewed_at, recalculated_at, claimed_at, created_at')
        .eq('lead_identity_id', identityId),
      userId
        ? supabaseAdmin
            .from('lead_magnet_results')
            .select('id, tool_slug, title, input_data, viewed_at, recalculated_at, claimed_at, created_at')
            .eq('user_id', userId)
        : Promise.resolve({ data: [] as Row[] }),
      supabaseAdmin
        .from('acquisition_events')
        .select('event_name, status, idempotency_key, occurred_at, last_error_code, metadata')
        .eq('lead_identity_id', identityId),
      supabaseAdmin.from('lead_sessions').select('last_activity_at').eq('lead_identity_id', identityId),
    ]);

  const byId = new Map<string, Row>();
  for (const r of [...(resultsByLead ?? []), ...(resultsByUser ?? [])] as Row[]) byId.set(String(r.id), r);
  const results = [...byId.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const newest = results[0] ?? null;
  const evs = (events ?? []) as Row[];

  // Activity: the latest thing they DID, from each canonical source.
  const acts: { label: string; at: string }[] = [];
  const push = (label: string, at: unknown) => {
    if (typeof at === 'string' && at) acts.push({ label, at });
  };
  push('Was in the Instagram DM', identity.last_seen_at);
  for (const r of (sessions ?? []) as Row[]) push('Was in the Instagram DM', r.last_activity_at);
  for (const r of results) {
    push('Got their calculator result', r.created_at);
    push('Opened their result', r.viewed_at);
    push('Changed an answer and recalculated', r.recalculated_at);
    push('Claimed their result into an account', r.claimed_at);
  }

  // Call request: joined through this lead's results (the request row carries no identity).
  let callRequested = false;
  if (results.length) {
    const { data: reqs } = await supabaseAdmin
      .from('acquisition_events')
      .select('occurred_at')
      .eq('event_name', 'hot_lead_call_requested')
      .in('response_snapshot->>result_id', results.map((r) => String(r.id)));
    for (const r of (reqs ?? []) as Row[]) {
      callRequested = true;
      push('Asked for a call', r.occurred_at);
    }
  }
  const callBooked = evs.some((e) => e.event_name === 'sales_call_booked' && e.status === 'recorded');

  // Sends so far: founder follow-ups by stage, and every other CRWN email to this person.
  const sentStages: FollowUpEvidence['sentStages'] = {};
  let lastFounderFollowUpAt: string | null = null;
  let lastOtherEmailAt: string | null = null;
  const version = 'send:founder_followup:';
  for (const e of evs) {
    const key = s(e.idempotency_key) ?? '';
    const at = String(e.occurred_at);
    if (key.startsWith(version)) {
      const parts = key.split(':'); // send, founder_followup, v1, <id>, <stage>
      const stage = parts[4] as FollowUpStage | undefined;
      const current = key.startsWith(`${version}v1:`);
      if (stage && current) {
        const meta = (e.metadata ?? {}) as Row;
        sentStages[stage] = { status: String(e.status), at, error: s(e.last_error_code), manual: meta.manual === true };
      }
      if (e.status === 'processed' && (!lastFounderFollowUpAt || at > lastFounderFollowUpAt)) lastFounderFollowUpAt = at;
    } else if (String(e.event_name).startsWith('outbound_email') && e.status === 'processed') {
      if (!lastOtherEmailAt || at > lastOtherEmailAt) lastOtherEmailAt = at;
    }
  }
  const nurtureInFlight = evs.some(
    (e) =>
      (e.status === 'pending' || e.status === 'processing') &&
      ['result_not_viewed_check', 'result_viewed_not_claimed', 'session_abandoned_nudge', 'personal_nudge', 'offer_call', 'tool_spotlight'].includes(
        String(e.event_name),
      ),
  );

  let displayName = s(profile?.artist_name);
  let account: FollowUpEvidence['account'] = null;

  if (userId) {
    const [{ data: prof }, { data: artist }, { data: fevents }, { data: enrollments }] = await Promise.all([
      supabaseAdmin.from('profiles').select('display_name, avatar_url').eq('id', userId).maybeSingle(),
      supabaseAdmin
        .from('artist_profiles')
        .select('id, setup_completed, stripe_connect_id, activation_milestones')
        .eq('user_id', userId)
        .maybeSingle(),
      supabaseAdmin.from('funnel_events').select('stage, created_at').eq('user_id', userId),
      supabaseAdmin.from('platform_sequence_enrollments').select('id').eq('artist_user_id', userId),
    ]);
    displayName = s(prof?.display_name) ?? displayName;
    for (const f of (fevents ?? []) as Row[]) {
      const stage = String(f.stage);
      if (stage === 'page_viewed') continue; // a visit to their page is a fan's action, not theirs
      push(ACTIVITY_LABEL[stage] ?? stage.replace(/_/g, ' '), f.created_at);
    }
    const enrollmentIds = ((enrollments ?? []) as Row[]).map((r) => String(r.id));
    if (enrollmentIds.length) {
      const { data: psends } = await supabaseAdmin
        .from('platform_sequence_sends')
        .select('sent_at')
        .in('enrollment_id', enrollmentIds)
        .eq('status', 'sent');
      for (const p of (psends ?? []) as Row[]) {
        const at = s(p.sent_at);
        if (at && (!lastOtherEmailAt || at > lastOtherEmailAt)) lastOtherEmailAt = at;
      }
    }

    const artistId = s(artist?.id);
    let tiers: Row[] = [];
    let trackRows: Row[] = [];
    let productRows: Row[] = [];
    let firstPaid = false;
    if (artistId) {
      const [t, tr, pr, fp] = await Promise.all([
        supabaseAdmin
          .from('subscription_tiers')
          .select('name, price, is_active, stripe_price_id, stripe_annual_price_id, created_at')
          .eq('artist_id', artistId),
        supabaseAdmin.from('tracks').select('created_at').eq('artist_id', artistId).order('created_at', { ascending: false }).limit(1),
        supabaseAdmin.from('products').select('title, created_at').eq('artist_id', artistId).order('created_at', { ascending: false }),
        supabaseAdmin
          .from('funnel_events')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artistId)
          .eq('stage', 'first_paid_conversion'),
      ]);
      tiers = ((t.data ?? []) as Row[]).filter((x) => x.is_active !== false);
      trackRows = (tr.data ?? []) as Row[];
      productRows = (pr.data ?? []) as Row[];
      firstPaid = (fp.count ?? 0) > 0;
      for (const x of tiers) push('Created a tier', x.created_at);
      for (const x of trackRows) push('Uploaded music', x.created_at);
      for (const x of productRows) push('Created a product', x.created_at);
    }
    const chargesReady = stripeChargesReady(artist as { stripe_connect_id?: string | null; activation_milestones?: unknown } | null);
    account = {
      userId,
      setupCompleted: artist?.setup_completed === true,
      setup: {
        artistId,
        hasAvatar: !!s(prof?.avatar_url),
        hasMusic: trackRows.length > 0,
        hasTier: tiers.length > 0,
        stripeConnected: chargesReady,
        hasProduct: productRows.length > 0,
      },
      paidTiers: tiers
        .filter((x) => Number(x.price) > 0)
        .map((x) => ({
          name: String(x.name),
          priceCents: Number(x.price),
          purchasable:
            tierPurchaseBlocker({
              price: Number(x.price),
              stripe_price_id: s(x.stripe_price_id),
              stripe_annual_price_id: s(x.stripe_annual_price_id),
              chargesReady,
            }) === null,
        })),
      chargesReady,
      productTitle: s(productRows[0]?.title),
      firstPaid,
    };
  }

  const lastActivity = acts.reduce<{ label: string; at: string } | null>((m, a) => (!m || a.at > m.at ? a : m), null);
  const inputData = (newest?.input_data ?? null) as Row | null;
  const slug = s(newest?.tool_slug);

  return {
    identityId,
    instagramUsername: s(identity.instagram_username),
    scoreBand: s(profile?.score_band),
    leadScore: typeof profile?.lead_score === 'number' ? profile.lead_score : null,
    reasonCodes: ((history?.[0]?.reason_codes as string[] | undefined) ?? []).slice(),
    displayName,
    email: {
      address: email,
      consent: identity.consent_email === true,
      identityStatus: String(identity.status ?? 'active'),
      suppressed: email ? await isEmailSuppressed(supabaseAdmin, email) : false,
    },
    result:
      newest && slug
        ? {
            id: String(newest.id),
            toolSlug: slug,
            toolName: TOOL_NAME_OVERRIDES[slug] ?? getLeadMagnet(slug)?.name ?? null,
            title: s(newest.title),
            builderSaved: !!(inputData && inputData.deliverableValues),
          }
        : null,
    account,
    call: { requested: callRequested, booked: callBooked },
    lastActivity,
    nurtureInFlight,
    lastOtherEmailAt,
    lastFounderFollowUpAt,
    sentStages,
  };
}

export interface LeadFollowUp {
  evidence: FollowUpEvidence;
  context: FollowUpContext;
  /** The draft, with a placeholder where a pre-signup result link would be minted. */
  preview: RenderedFollowUp | null;
}

/** THE resolver entry point. The runner, the admin tab and the preview all call this. */
export async function getLeadFollowUpContext(identityId: string, now = new Date()): Promise<LeadFollowUp | null> {
  const evidence = await loadFollowUpEvidence(identityId);
  if (!evidence) return null;
  const context = resolveFounderFollowUp(evidence, now);
  const preview = renderFounderFollowUp(context, evidence, previewUrl(context));
  return { evidence, context, preview };
}

function previewUrl(ctx: FollowUpContext): string {
  const c = ctx.continuation;
  if (!c) return APP_URL;
  if (c.kind === 'path') return `${APP_URL}${c.path}`;
  if (c.kind === 'booking') return bookingUrlFor(ctx.identityId);
  return RESULT_LINK_PLACEHOLDER;
}

/** The link that goes in a REAL send. A pre-signup result link is minted now (only its hash is
 *  stored, so no earlier link can be reused). null = could not build one, so do not send. */
async function sendUrl(ctx: FollowUpContext): Promise<string | null> {
  const c = ctx.continuation;
  if (!c) return null;
  if (c.kind === 'path') return `${APP_URL}${c.path}`;
  if (c.kind === 'booking') return bookingUrlFor(ctx.identityId);
  return rotateLink(c.resultId, c.toolSlug);
}

/** Qualified leads, for the admin Founder tab. Newest-updated first. */
export async function listFounderFollowUps(now = new Date()): Promise<LeadFollowUp[]> {
  const { data } = await supabaseAdmin
    .from('lead_profiles')
    .select('lead_identity_id')
    .eq('score_band', 'sales_priority')
    .order('updated_at', { ascending: false })
    .limit(RUN_LIMIT);
  const out: LeadFollowUp[] = [];
  for (const r of (data ?? []) as Row[]) {
    const f = await getLeadFollowUpContext(String(r.lead_identity_id), now);
    if (f) out.push(f);
  }
  return out;
}

/**
 * Josh sent this stage's note himself (Gmail, a DM). Claims the SAME key the automation would,
 * so the automation can never send it a second time. The key is re-derived here from the live
 * state, never taken from the request.
 */
export async function markFounderFollowUpSentByHand(
  identityId: string,
  adminUserId: string,
): Promise<{ ok: boolean; reason: string }> {
  const f = await getLeadFollowUpContext(identityId);
  if (!f) return { ok: false, reason: 'no_lead' };
  if (!f.context.dedupeKey) return { ok: false, reason: `no_follow_up_for_${f.context.stage}` };
  const { error } = await supabaseAdmin.from('acquisition_events').insert({
    event_name: 'outbound_email',
    lead_identity_id: identityId,
    idempotency_key: `send:${f.context.dedupeKey}`,
    status: 'processed',
    processed_at: new Date().toISOString(),
    metadata: { manual: true, stage: f.context.stage, by: adminUserId },
  });
  if (error) return { ok: false, reason: error.code === '23505' ? 'already_recorded' : 'write_failed' };
  return { ok: true, reason: 'recorded' };
}

export interface FounderFollowUpReport {
  enabled: boolean;
  considered: number;
  sent: number;
  skipped: Record<string, number>;
}

/**
 * The daily pass. Hosted by the acquisition dispatcher (platform-crm cron, once a day), gated by
 * the founder_followup flag. CANNOT THROW.
 *
 * Stale copy is impossible by construction: nothing is queued. Each run resolves the lead's
 * CURRENT state and writes the email for that state at the moment of sending, so an artist who
 * signed up yesterday cannot receive a "finish your calculator" note today.
 */
export async function runFounderFollowUps(now = new Date()): Promise<FounderFollowUpReport> {
  const report: FounderFollowUpReport = { enabled: false, considered: 0, sent: 0, skipped: {} };
  const skip = (reason: string) => (report.skipped[reason] = (report.skipped[reason] ?? 0) + 1);
  try {
    if (!(await isFounderFollowUpEnabled())) return report;
    report.enabled = true;
    const leads = await listFounderFollowUps(now);
    for (const f of leads) {
      report.considered++;
      try {
        if (f.context.decision !== 'send' || !f.context.dedupeKey) {
          skip(f.context.decisionReason);
          continue;
        }
        const url = await sendUrl(f.context);
        if (!url) {
          skip('no_continuation_url');
          continue;
        }
        const msg = renderFounderFollowUp(f.context, f.evidence, url);
        const identity = await loadIdentity(f.context.identityId);
        if (!msg || !identity) {
          skip('nothing_to_send');
          continue;
        }
        const res = await send({
          identity,
          channel: 'email',
          subject: msg.subject,
          text: msg.text,
          html: msg.html,
          idempotencyKey: f.context.dedupeKey,
          from: FOUNDER_FROM,
          replyTo: ADMIN_NOTIFY_EMAIL,
        });
        if (res.sent) report.sent++;
        else skip(res.reason);
      } catch (err) {
        skip('error');
        console.error('[founder-followup] lead failed:', err instanceof Error ? err.message : 'unknown');
      }
    }
  } catch (err) {
    console.error('[founder-followup] run failed:', err instanceof Error ? err.message : 'unknown');
  }
  return report;
}
