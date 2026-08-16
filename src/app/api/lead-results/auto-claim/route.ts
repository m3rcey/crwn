// Auto-claim: the DURABLE, storage-free half of the lead-magnet handoff.
//
// The client fires this the moment a session is known (useAuth) and again once inside the app
// (ClaimRedeemer). It reads NOTHING from the request body. Identity, the verified email, and the
// signup-carried token all come from the SESSION, so a hostile body changes nothing.
//
// This is what lets a calculator result survive signup on a different device or in incognito:
// the match is a server-side query on the user's VERIFIED email, not a value the browser kept.
//
// Middleware excludes /api/, so this route authenticates itself, first thing.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { autoClaimForUser } from '@/lib/leadResults/resultAccess';
import { checkRateLimit } from '@/lib/rateLimit';
import { getLeadMagnetSeed } from '@/lib/leadResults/handoffSeed';
import { buildLadderPrefill } from '@/lib/leadResults/ladderPrefill';
import { entryOfferFor } from '@/lib/leadResults/entryOffer';
import { ALLOWED_RECURRENCES } from '@/lib/promisePlan';
import type { Recurrence } from '@/lib/fulfillment';
import { recordFunnelEvent } from '@/lib/analytics/funnelEvents';
import { attributionDimsFor } from '@/lib/analytics/attributionLookup';
import { recommendPlan } from '@/lib/planRecommendation';
import { assignSubAvatar, deriveAcquisitionAvatar, mergeEvidence, evidenceFromInputs } from '@/lib/avatars/assignment';
import { getSubAvatar } from '@/lib/avatars/taxonomy';
// Z7 reuses the Z6 audit's category map so the wizard and the Stack Replacement report can never
// disagree about which tools CRWN actually covers.
import { categoryForPlatform } from '@/lib/stackReplacementSource';
import { CRWN_REPLACES } from '@/lib/stackReplacement';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const allowed = await checkRateLimit(user.id, 'lead-auto-claim', 3600, 40);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  // Only a VERIFIED email participates in identity resolution (the schema's own rule).
  const email = user.email_confirmed_at ? user.email ?? null : null;

  // A token carried through signup in user_metadata (server-side; never browser storage).
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const token = typeof meta?.pending_result_token === 'string' ? meta.pending_result_token : null;

  const { claimed } = await autoClaimForUser(user.id, { email, token });

  // Funnel: Account Created and Email Verified. This route is the first server touchpoint after
  // signup, so it is the reliable server-side proxy. Both dedup on the user id, so they fire once
  // ever no matter how often the client re-hits auto-claim. The originating calculator is attached
  // so the whole funnel stays sliceable by calculator.
  const seed = await getLeadMagnetSeed(supabaseAdmin, { userId: user.id });

  // The sub-avatar this artist arrived through and appears to be (docs/SUB_AVATARS.md), derived
  // from their own stored answers. Derived here rather than stored, and stamped onto the funnel
  // rows so the acquisition cohort stays sliceable past signup: all four avatars share one
  // calculator, so the `calculator` dimension alone can no longer tell their cohorts apart.
  let avatarAssignment: ReturnType<typeof assignSubAvatar> = null;
  let acquisitionAvatar: string | null = null;
  try {
    const { data: inputRows } = await supabaseAdmin
      .from('lead_magnet_results')
      .select('input_data, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(10);
    const fragments = (inputRows ?? []).map((r) => evidenceFromInputs(r.input_data as Record<string, unknown>));
    // Oldest-first entry contexts: the first avatar link they ever clicked owns the acquisition.
    const entryContexts = fragments.flatMap((f) => f.entryContexts ?? []);
    acquisitionAvatar = deriveAcquisitionAvatar(entryContexts);
    avatarAssignment = assignSubAvatar(mergeEvidence({ entryContexts }, ...fragments));
  } catch {
    /* avatar derivation must never fail the claim */
  }
  const cohortAvatar = acquisitionAvatar ?? avatarAssignment?.primarySubAvatar ?? null;

  // The campaign that brought them, read back off their now-claimed result row. This is the join
  // that makes "which video produced an artist" answerable: without it the funnel below signup
  // knows the calculator but not the content, and every video looks identical from here down.
  const attributionDims = await attributionDimsFor(supabaseAdmin, { userId: user.id });

  const dims = {
    calculator: seed?.toolSlug ?? null,
    userId: user.id,
    resultId: seed?.resultId ?? null,
    campaign: attributionDims.campaign ?? null,
    referrer: attributionDims.referrer ?? null,
    video: attributionDims.video ?? null,
    metadata: {
      ...(attributionDims.metadata ?? {}),
      ...(cohortAvatar ? { subAvatar: cohortAvatar } : {}),
    },
  };
  await recordFunnelEvent(supabaseAdmin, { stage: 'account_created', dedupeKey: user.id, ...dims });
  if (user.email_confirmed_at) {
    await recordFunnelEvent(supabaseAdmin, { stage: 'email_verified', dedupeKey: user.id, ...dims });
  }

  // Store the deterministic plan recommendation (pricing strategy 2026-07-31): the account
  // starts on Launch, but the RECOMMENDED operating plan is derived from the artist's own
  // calculator projection and saved so onboarding can personalize around it. Best-effort on
  // purpose: the artist_profiles row may not exist yet (this route also fires before the
  // identity screen), and the columns land with schema-phase2-platform-plan-recommendation.sql.
  // Auto-claim re-fires inside the app, so a later hit backfills once the row exists.
  if (seed?.estimatedMonthlyCents) {
    try {
      const rec = recommendPlan({ projectedMonthlyGmvCents: seed.estimatedMonthlyCents });
      await supabaseAdmin
        .from('artist_profiles')
        .update({
          recommended_plan: rec.plan,
          recommendation_reason: rec.reason,
          projected_monthly_gmv: seed.estimatedMonthlyCents,
        })
        .eq('user_id', user.id);
    } catch {
      /* pre-migration schema or no artist row yet; nothing to do */
    }
  }

  // Burn the one-shot token so it does not re-run forever. Best-effort: the email match still
  // covers the same result on a later load if this write fails.
  if (token) {
    try {
      await supabase.auth.updateUser({ data: { pending_result_token: null } });
    } catch {
      /* non-fatal */
    }
  }

  // The claimed plan, display-ready. The setup wizard opens with "Your CRWN plan
  // is saved" built from this, so signup feels like a continuation of the
  // calculator instead of a restart (docs/ARTIST_LAUNCH_WIZARD.md, Stage 1).
  // Only summary fields — the conversionPayload stays server-side until the
  // post-setup destination restores the builder. tierProjections (Stage 3) is the
  // one safe extract: tier name + the buyer count THEIR calculator modeled, so
  // the wizard's ladder screen can attribute each rung to their own numbers.
  const rawLadder = seed?.conversionPayload?.ladder;
  const tierProjections = Array.isArray(rawLadder)
    ? rawLadder
        .filter(
          (t): t is { name: string; projectedSubs: number } =>
            !!t &&
            typeof t === 'object' &&
            typeof (t as { name?: unknown }).name === 'string' &&
            typeof (t as { projectedSubs?: unknown }).projectedSubs === 'number' &&
            Number.isFinite((t as { projectedSubs: number }).projectedSubs),
        )
        .map((t) => ({ name: t.name, projectedSubs: Math.max(0, Math.floor(t.projectedSubs)) }))
    : [];
  // The display-ready avatar summary for the wizard's restored-plan intro. Prefers the assignment
  // (all evidence) and falls back to the acquisition avatar alone, so an artist who clicked an
  // avatar link but answered little still gets the framing their content promised them.
  const avatarDef = getSubAvatar(avatarAssignment?.primarySubAvatar ?? acquisitionAvatar);
  const subAvatar = avatarDef
    ? {
        id: avatarDef.id,
        label: avatarDef.label,
        promise: avatarDef.promise,
        source: avatarAssignment?.source ?? 'acquisition_path',
        confidence: avatarAssignment?.confidence ?? 'low',
      }
    : null;

  const planSeed = seed
    ? {
        toolName: seed.toolName,
        headline: seed.headline,
        heroValue: seed.heroValue,
        heroSuffix: seed.heroSuffix,
        estimatedMonthlyCents: seed.estimatedMonthlyCents,
        createdAt: seed.createdAt,
        tierProjections,
        // The artist's OWN tier names/prices from their pre-signup edits, so the
        // wizard's ladder opens on the ladder THEY designed (null = stock).
        ladderPrefill: buildLadderPrefill(seed),
        // The bridge for an artist who came through a SINGLE-OFFER tool (Vault,
        // Live Experience, Producer Session): where the one thing they planned
        // landed, and what keeping only that thing costs them. Null for every
        // calculator that already models the whole ladder, which argues for
        // itself with per-rung buyer counts.
        entryOffer: entryOfferFor(seed),
        // The Vault artist's OWN drop cadence and first-30-days plan, from the builder they
        // filled before signup. The promise-review screen asks for exactly this cadence, so
        // without it the wizard asks a question they already answered and then ignores the
        // answer. Read from the draft only; the planner's own recommendation is already the
        // draft's default. Vault-only: no other deliverable carries a recurring cadence.
        vaultPlan: (() => {
          if (seed.toolSlug !== 'vault-revenue-planner') return null;
          const dv = seed.draftValues ?? {};
          const cadence = typeof dv.cadence === 'string' && ALLOWED_RECURRENCES.includes(dv.cadence as Recurrence)
            ? (dv.cadence as Recurrence)
            : null;
          // `lines` fields are stored as string arrays by the deliverable builder.
          const dropPlan = Array.isArray(dv.dropPlan)
            ? dv.dropPlan.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 8)
            : [];
          return cadence || dropPlan.length ? { cadence, dropPlan } : null;
        })(),
        // The Share-to-Earn config THEY set in the builder (artist-funded
        // commission). The wizard applies it when the ladder is created, so the
        // growth system they designed exists at launch instead of never.
        shareToEarn: (() => {
          const dv = seed.draftValues ?? {};
          if (dv.shareOn !== 'on') return null;
          const pct = Math.round(Number(dv.shareCommission));
          return Number.isFinite(pct) && pct > 0 && pct <= 50 ? { percent: pct } : null;
        })(),
        // The derived sub-avatar (docs/SUB_AVATARS.md): which of the four founder-approved
        // journeys this artist entered through. Display-only summary; never stored here.
        subAvatar,
        // Z7: the stack the artist ALREADY told CRWN they run on, from their own Fan Stack
        // Calculator answer. The beachhead is an established business, and onboarding that never
        // mentions the Patreon and the Discord they just told us about reads as if CRWN forgot.
        // Reused, never re-asked, and split by the SAME map the Stack Replacement audit uses so
        // the wizard cannot claim a replacement the audit would refuse.
        declaredStack: (() => {
          const raw = (seed.inputData ?? {}).platforms_used;
          const names = Array.isArray(raw) ? raw.map(String).map((s) => s.trim()).filter(Boolean) : [];
          if (!names.length) return null;
          const covered: string[] = [];
          const stays: string[] = [];
          for (const name of names) {
            (CRWN_REPLACES[categoryForPlatform(name)] ? covered : stays).push(name);
          }
          return { covered, stays };
        })(),
      }
    : null;

  return NextResponse.json({ ok: true, claimed, seed: planSeed });
}
