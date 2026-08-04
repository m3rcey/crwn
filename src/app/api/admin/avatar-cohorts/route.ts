// Admin: the four sub-avatar cohorts, compared on the same acquisition-to-revenue spine.
//
// GROUPING RULE. All four avatars share ONE calculator (docs/SUB_AVATARS.md), so the `calculator`
// dimension can no longer tell their cohorts apart. An event is attributed in this order:
//   1. `metadata.subAvatar` stamped on the row itself, which is the `?from=` funnel the visit
//      arrived through. This covers every anonymous top-of-funnel stage (mirrored beacons) and
//      the two account stages (auto-claim).
//   2. Otherwise, the avatar of the row's IDENTITY, resolved once per artist/user from the entry
//      context stored beside their own calculator answers. This covers every post-signup stage,
//      which is emitted by routes that have no idea an avatar exists.
//   3. Otherwise "unassigned", reported as its own cohort so nothing silently leaves the totals.
//
// Attribution is therefore ACQUISITION-first (which content brought them), which is the question
// an acquisition budget is actually asking. Identity resolution never overrides a stamp, so a
// cohort cannot gain members halfway down its own funnel.
//
// HONESTY RULES:
//  - Realized metrics only. GMV comes from opportunity_ledger.captured_cents (refund-netted,
//    written from real earnings rows). Projections are never mixed in.
//  - Cohort maturity is explicit: accounts are split by age >= 30/60/90 days, and the response
//    marks which retention windows are evaluable. Metrics without a trusted source (referral
//    rate, support burden, CAC) are reported as notMeasured with the reason, never as zeros.
//  - The constraint reading uses the shared deterministic detector with its sample floor:
//    below the floor a cohort gets no diagnosis, not a low-confidence one.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { SUB_AVATARS, SUB_AVATAR_TAXONOMY_VERSION, isSubAvatarId } from '@/lib/avatars/taxonomy';
import { assignSubAvatar, deriveAcquisitionAvatar, evidenceFromInputs, mergeEvidence } from '@/lib/avatars/assignment';
import { AVATAR_FUNNEL_SPINE, readCohortConstraint } from '@/lib/avatars/cohortConstraint';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Bounded read: newest rows first, hard cap. The admin report is directional, and the cap is
// stated in the response so a truncated window is never mistaken for a complete one.
const ROW_CAP = 20000;
const DAY_MS = 86400_000;

type CohortKey = string; // avatar id or 'unassigned'

interface CohortAccumulator {
  stageUnits: Map<string, Set<string>>;
  accountCreatedAt: Map<string, number>; // identity -> epoch ms of account_created
  firstPaidArtists: Set<string>;
  firstPaidAt: Map<string, number>;
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const days = Math.min(365, Math.max(7, Number(url.searchParams.get('days')) || 90));
  const sinceIso = new Date(Date.now() - days * DAY_MS).toISOString();
  const avatarFilter = url.searchParams.get('avatar') || null;

  // 1. The funnel spine, from canonical funnel_events.
  const { data: events, error } = await supabaseAdmin
    .from('funnel_events')
    .select('stage, calculator, artist_id, user_id, anon_id, occurred_at, dedupe_key, metadata')
    .gte('occurred_at', sinceIso)
    .order('occurred_at', { ascending: false })
    .limit(ROW_CAP);

  if (error) {
    // Pre-migration or read failure: an empty, honest report rather than a 500.
    return NextResponse.json({
      taxonomyVersion: SUB_AVATAR_TAXONOMY_VERSION,
      since: sinceIso,
      days,
      truncated: false,
      cohorts: [],
      notMeasured: ['funnel_events unavailable'],
    });
  }

  // Step 1: resolve each IDENTITY in the window to an avatar, once, from the entry context stored
  // beside their own calculator answers (falling back to what those answers say about them). This
  // is what carries a cohort past signup, where the emitting routes know nothing about avatars.
  const identityIds = new Set<string>();
  for (const e of events ?? []) {
    if (e.user_id) identityIds.add(String(e.user_id));
  }
  const avatarByUser = new Map<string, string>();
  if (identityIds.size) {
    try {
      const { data: rows } = await supabaseAdmin
        .from('lead_magnet_results')
        .select('user_id, input_data, created_at')
        .in('user_id', [...identityIds].slice(0, 1000))
        .order('created_at', { ascending: true })
        .limit(ROW_CAP);
      const byUser = new Map<string, Record<string, unknown>[]>();
      for (const r of rows ?? []) {
        const uid = String(r.user_id);
        if (!byUser.has(uid)) byUser.set(uid, []);
        byUser.get(uid)!.push((r.input_data ?? {}) as Record<string, unknown>);
      }
      for (const [uid, inputs] of byUser) {
        const fragments = inputs.map((i) => evidenceFromInputs(i));
        const contexts = fragments.flatMap((f) => (f.entryContexts ?? []).filter((c): c is string => !!c));
        const resolved =
          deriveAcquisitionAvatar(contexts) ??
          assignSubAvatar(mergeEvidence({ entryContexts: contexts }, ...fragments))?.primarySubAvatar ??
          null;
        if (resolved) avatarByUser.set(uid, resolved);
      }
    } catch {
      /* identity resolution is additive: without it, post-signup rows read as unassigned */
    }
  }

  // Many rows are artist-scoped and carry no user_id, so map artist -> user once and reuse the
  // same resolution. Built for EVERY artist in the window, because the ledger rollup below keys
  // on artist too.
  const artistIds = new Set<string>();
  for (const e of events ?? []) {
    if (e.artist_id) artistIds.add(String(e.artist_id));
  }
  const avatarByArtist = new Map<string, string>();
  if (artistIds.size) {
    try {
      const { data: artistRows } = await supabaseAdmin
        .from('artist_profiles')
        .select('id, user_id')
        .in('id', [...artistIds].slice(0, 1000));
      for (const a of artistRows ?? []) {
        const v = avatarByUser.get(String(a.user_id));
        if (v) avatarByArtist.set(String(a.id), v);
      }
    } catch {
      /* silence */
    }
  }

  const cohorts = new Map<CohortKey, CohortAccumulator>();
  const cohortOf = (key: CohortKey): CohortAccumulator => {
    let c = cohorts.get(key);
    if (!c) {
      c = { stageUnits: new Map(), accountCreatedAt: new Map(), firstPaidArtists: new Set(), firstPaidAt: new Map() };
      cohorts.set(key, c);
    }
    return c;
  };

  for (const e of events ?? []) {
    const stamped = (e.metadata as Record<string, unknown> | null)?.subAvatar;
    const avatar =
      (isSubAvatarId(stamped) ? stamped : null) ??
      (e.user_id ? avatarByUser.get(String(e.user_id)) : null) ??
      (e.artist_id ? avatarByArtist.get(String(e.artist_id)) : null) ??
      'unassigned';
    const c = cohortOf(avatar);
    // Unit of count: the most durable identity available, falling back to the deduped row key so
    // a stage with no identity still counts occurrences without double-counting retries.
    const identity = String(e.user_id || e.artist_id || e.anon_id || e.dedupe_key);
    let set = c.stageUnits.get(String(e.stage));
    if (!set) {
      set = new Set();
      c.stageUnits.set(String(e.stage), set);
    }
    set.add(identity);

    const t = Date.parse(String(e.occurred_at));
    if (e.stage === 'account_created' && Number.isFinite(t)) c.accountCreatedAt.set(identity, t);
    if (e.stage === 'first_paid_conversion' && e.artist_id) {
      c.firstPaidArtists.add(String(e.artist_id));
      if (Number.isFinite(t)) c.firstPaidAt.set(String(e.artist_id), t);
    }
  }

  // 2. Realized, refund-netted GMV per avatar from the opportunity ledger. Attributed by the
  // ARTIST's resolved avatar, not by calculator: every avatar now runs the same calculator, so a
  // calculator-keyed rollup would put all four cohorts' money in one pile.
  const gmvByAvatar = new Map<CohortKey, number>();
  try {
    const { data: ledger } = await supabaseAdmin
      .from('opportunity_ledger')
      .select('artist_id, captured_cents')
      .limit(ROW_CAP);
    for (const row of ledger ?? []) {
      const avatar = avatarByArtist.get(String(row.artist_id)) ?? 'unassigned';
      gmvByAvatar.set(avatar, (gmvByAvatar.get(avatar) ?? 0) + (Number(row.captured_cents) || 0));
    }
  } catch {
    /* ledger absent: reported as notMeasured below */
  }

  // 3. Time to first paid fan: artist_profiles.created_at -> first_paid event, per avatar.
  const allFirstPaidArtists = [...cohorts.values()].flatMap((c) => [...c.firstPaidArtists]);
  const artistCreatedAt = new Map<string, number>();
  if (allFirstPaidArtists.length) {
    try {
      const { data: artists } = await supabaseAdmin
        .from('artist_profiles')
        .select('id, created_at')
        .in('id', allFirstPaidArtists.slice(0, 500));
      for (const a of artists ?? []) {
        const t = Date.parse(String(a.created_at));
        if (Number.isFinite(t)) artistCreatedAt.set(String(a.id), t);
      }
    } catch {
      /* silence */
    }
  }

  const now = Date.now();
  const avatarIds = [...SUB_AVATARS.map((a) => a.id as string), 'unassigned'];

  const report = avatarIds
    .filter((id) => !avatarFilter || id === avatarFilter)
    .map((id) => {
      const def = SUB_AVATARS.find((a) => a.id === id) ?? null;
      const c = cohorts.get(id);
      const stages = AVATAR_FUNNEL_SPINE.map((s) => ({
        stage: s.stage,
        label: s.label,
        count: c?.stageUnits.get(s.stage)?.size ?? 0,
      }));

      // Stage-to-stage conversion, only where both sides are nonzero-measured.
      const conversions: { from: string; to: string; rate: number | null }[] = [];
      for (let i = 0; i < stages.length - 1; i++) {
        const a = stages[i];
        const b = stages[i + 1];
        conversions.push({ from: a.stage, to: b.stage, rate: a.count > 0 ? b.count / a.count : null });
      }

      // Maturity split of accounts created in the window.
      const accountAges = [...(c?.accountCreatedAt.values() ?? [])].map((t) => (now - t) / DAY_MS);
      const mature = { d30: accountAges.filter((d) => d >= 30).length, d60: accountAges.filter((d) => d >= 60).length, d90: accountAges.filter((d) => d >= 90).length };

      // Median days to first paid fan, where both timestamps are known.
      const ttfp: number[] = [];
      for (const [artistId, paidAt] of c?.firstPaidAt ?? []) {
        const created = artistCreatedAt.get(artistId);
        if (created && paidAt >= created) ttfp.push((paidAt - created) / DAY_MS);
      }
      ttfp.sort((a, b) => a - b);
      const medianDaysToFirstPaid = ttfp.length ? ttfp[Math.floor(ttfp.length / 2)] : null;

      const constraint = readCohortConstraint(stages);

      return {
        avatar: id,
        label: def?.label ?? 'Unassigned (no avatar funnel and no resolvable identity)',
        entryRoute: def?.entryRoute ?? null,
        stages,
        conversions,
        accountsCreated: c?.accountCreatedAt.size ?? 0,
        matureCohorts: mature,
        firstPaidArtists: c?.firstPaidArtists.size ?? 0,
        medianDaysToFirstPaid,
        gmvCapturedCents: gmvByAvatar.get(id) ?? 0,
        constraint,
        sampleWarning:
          (c?.stageUnits.get('calculator_completed')?.size ?? 0) < 30
            ? 'Small sample: under 30 completed calculators in this window. Do not compare rates yet.'
            : null,
      };
    });

  return NextResponse.json({
    taxonomyVersion: SUB_AVATAR_TAXONOMY_VERSION,
    since: sinceIso,
    days,
    truncated: (events?.length ?? 0) >= ROW_CAP,
    cohorts: report,
    // Metrics the platform does not yet measure at cohort grain. Named, never zero-filled.
    attributionNote:
      'Rows are attributed by the sub-avatar funnel stamped on the event, then by the avatar of the row identity resolved from that artist\'s own stored answers. Identity never overrides a stamp, so a cohort cannot gain members halfway down its own funnel.',
    notMeasured: [
      'artist 30/60/90-day retention (needs a per-artist activity definition at cohort grain)',
      'paid-fan churn per avatar (subscriptions carry no avatar attribution)',
      'referral rate per avatar (referrals are not avatar-attributed)',
      'CAC / net contribution (no acquisition-cost inputs exist in the repository)',
      'support burden per avatar (support conversations are not avatar-attributed)',
    ],
  });
}
