// Where to send an artist the instant they finish onboarding (and the single place that decides).
//
// The setup wizard asks here; this resolves the caller's OWN context server-side (never a client id)
// and runs the one journey resolver. Read-only + session-scoped: artist row, setup state, and most
// recent claimed result all come from the session, not the request. The only request inputs are an
// optional validated returnTo and an optional anon id used ONLY to re-derive (never trust) the
// experiment variant.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getLeadMagnetSeed } from '@/lib/leadResults/handoffSeed';
import { resolveJourneyDestination, journeyDestinationToUrl } from '@/lib/journey/resolveJourneyDestination';
import { recordFunnelEvent } from '@/lib/analytics/funnelEvents';
import { recordLmEvent } from '@/lib/leadMagnets/server';
import { isQuestEngineEnabled } from '@/lib/quests';
import { getFunnelByToolKey } from '@/lib/opportunityFunnels/registry';
import { getRunningExperimentForExperience, resolveVariant } from '@/lib/experiments/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const AID_RE = /^[A-Za-z0-9_-]{6,64}$/;

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Resolve the CALLER's artist row + setup state — never a client-supplied id.
  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('id, setup_completed')
    .eq('user_id', user.id)
    .maybeSingle();
  const artistId = (artist?.id as string) ?? null;
  // Fails OPEN if the column is missing (matches the (main) gate), so no redirect loop.
  const setupComplete = artist ? (artist.setup_completed as boolean | null) !== false : false;

  const seed = await getLeadMagnetSeed(supabaseAdmin, { userId: user.id, artistId });

  // Did this artist actually BUILD a deliverable before signing up? If so their own edits are the
  // work to restore, not a prefill re-derived from the calculator. Scoped to the caller's own rows.
  let savedDeliverableTool: string | null = null;
  try {
    const { data: drafts } = await supabaseAdmin
      .from('lead_magnet_results')
      .select('tool_slug, input_data')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);
    const row = (drafts || []).find(
      (r) => (r.input_data as { deliverableValues?: unknown } | null)?.deliverableValues,
    );
    if (row) savedDeliverableTool = row.tool_slug as string;
  } catch {
    savedDeliverableTool = null; // never block the handoff
  }
  const questEngineEnabled = await isQuestEngineEnabled(supabaseAdmin);

  // Experiment variant: re-derived server-side from the anon id (tamper-proof), never trusted from
  // the client, and only when an experiment is actually running for this experience.
  let experimentVariant: string | null = null;
  const aid = req.nextUrl.searchParams.get('aid');
  const experienceKey = seed ? getFunnelByToolKey(seed.toolSlug)?.opportunityKey ?? null : null;
  if (aid && AID_RE.test(aid) && experienceKey) {
    const exp = await getRunningExperimentForExperience(supabaseAdmin, experienceKey);
    if (exp) experimentVariant = resolveVariant(aid, exp);
  }

  const dest = resolveJourneyDestination({
    isArtist: !!artist,
    setupComplete,
    seed,
    questEngineEnabled,
    experimentVariant,
    returnTo: req.nextUrl.searchParams.get('returnTo'),
    savedDeliverableTool,
  });

  // Funnel: Builder Opened, plus the personalized-journey markers. All deduped per (user, result).
  if (dest.reason === 'builder_restored' && seed) {
    await recordFunnelEvent(supabaseAdmin, {
      stage: 'builder_opened',
      artistId,
      userId: user.id,
      calculator: seed.toolSlug,
      resultId: seed.resultId,
      dedupeKey: `${user.id}:${seed.resultId}`,
      metadata: { builder: dest.path },
    });
    await recordLmEvent(supabaseAdmin, 'personalized_journey_assigned', {
      toolSlug: seed.toolSlug,
      context: 'artist',
      authed: true,
      resultId: seed.resultId,
      reasonCode: dest.reason,
    });
    await recordLmEvent(supabaseAdmin, 'context_restored_after_signup', {
      toolSlug: seed.toolSlug,
      context: 'artist',
      authed: true,
      resultId: seed.resultId,
    });
  }

  // null lets the setup wizard use its own dashboard fallback; any other reason carries a real path.
  return NextResponse.json({
    redirect: dest.reason === 'fallback_dashboard' ? null : journeyDestinationToUrl(dest),
    reason: dest.reason,
  });
}
