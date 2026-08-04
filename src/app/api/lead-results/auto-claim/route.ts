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
import { getLeadMagnetSeed, getClaimedResults } from '@/lib/leadResults/handoffSeed';
import { buildLadderPrefill } from '@/lib/leadResults/ladderPrefill';
import { recordFunnelEvent } from '@/lib/analytics/funnelEvents';
import { recommendPlan } from '@/lib/planRecommendation';
import { assignSubAvatar, deriveAcquisitionAvatar, mergeEvidence, evidenceFromInputs } from '@/lib/avatars/assignment';
import { getSubAvatar } from '@/lib/avatars/taxonomy';

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
  const dims = { calculator: seed?.toolSlug ?? null, userId: user.id, resultId: seed?.resultId ?? null };
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
  // Sub-avatar, DERIVED at claim time from the artist's own claimed results (acquisition path +
  // declared inputs). Stored nowhere here: the display copy is the only consumer, and the same
  // derivation re-runs anywhere it is needed (docs/SUB_AVATARS.md). Best-effort by construction.
  let subAvatar: { id: string; label: string; promise: string; source: string; confidence: string } | null = null;
  try {
    const claimedRows = await getClaimedResults(supabaseAdmin, { userId: user.id });
    const oldestFirst = [...claimedRows].reverse();
    const slugs = oldestFirst.map((r) => r.toolSlug);
    // Declared evidence comes from the stored inputs of the oldest mapped result: read raw rows.
    const { data: inputRows } = await supabaseAdmin
      .from('lead_magnet_results')
      .select('tool_slug, input_data, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(10);
    const inputEvidence = (inputRows ?? []).map((r) => evidenceFromInputs(r.input_data as Record<string, unknown>));
    const assignment = assignSubAvatar(mergeEvidence({ claimedCalculatorSlugs: slugs }, ...inputEvidence));
    if (assignment) {
      const def = getSubAvatar(assignment.primarySubAvatar);
      if (def) {
        subAvatar = {
          id: def.id,
          label: def.label,
          promise: def.promise,
          source: assignment.source,
          confidence: assignment.confidence,
        };
      }
    } else {
      // Even without a full assignment, the acquisition avatar alone personalizes the intro.
      const acq = deriveAcquisitionAvatar(slugs);
      const def = getSubAvatar(acq);
      if (def) subAvatar = { id: def.id, label: def.label, promise: def.promise, source: 'acquisition_path', confidence: 'low' };
    }
  } catch {
    /* avatar derivation must never fail the claim */
  }

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
      }
    : null;

  return NextResponse.json({ ok: true, claimed, seed: planSeed });
}
