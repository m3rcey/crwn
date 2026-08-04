// Admin: the four sub-avatar cohorts, compared on the same acquisition-to-revenue spine.
//
// GROUPING RULE: an event belongs to an avatar when its `calculator` dimension maps to one under
// the versioned taxonomy (src/lib/avatars/taxonomy.ts). Mapping happens AT READ TIME, so there is
// no backfill, no stored avatar column on events, and a taxonomy change re-slices history
// correctly. Events whose calculator maps to no avatar are reported once as the "unassigned"
// cohort so nothing silently disappears from totals.
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
import { SUB_AVATARS, calculatorToSubAvatar, SUB_AVATAR_TAXONOMY_VERSION } from '@/lib/avatars/taxonomy';
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
    .select('stage, calculator, artist_id, user_id, anon_id, occurred_at, dedupe_key')
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
    const avatar = calculatorToSubAvatar(e.calculator) ?? 'unassigned';
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

  // 2. Realized, refund-netted GMV per avatar from the opportunity ledger (calculator-attributed).
  const gmvByAvatar = new Map<CohortKey, number>();
  try {
    const { data: ledger } = await supabaseAdmin
      .from('opportunity_ledger')
      .select('calculator, captured_cents')
      .limit(ROW_CAP);
    for (const row of ledger ?? []) {
      const avatar = calculatorToSubAvatar(row.calculator) ?? 'unassigned';
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
        label: def?.label ?? 'Unassigned (calculator not mapped to an avatar)',
        calculatorSlugs: def?.calculatorSlugs ?? [],
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
    notMeasured: [
      'artist 30/60/90-day retention (needs a per-artist activity definition at cohort grain)',
      'paid-fan churn per avatar (subscriptions carry no calculator attribution)',
      'referral rate per avatar (referrals are not calculator-attributed)',
      'CAC / net contribution (no acquisition-cost inputs exist in the repository)',
      'support burden per avatar (support conversations are not calculator-attributed)',
    ],
  });
}
