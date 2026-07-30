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
import { recordFunnelEvent } from '@/lib/analytics/funnelEvents';

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
  // post-setup destination restores the builder.
  const planSeed = seed
    ? {
        toolName: seed.toolName,
        headline: seed.headline,
        heroValue: seed.heroValue,
        heroSuffix: seed.heroSuffix,
        estimatedMonthlyCents: seed.estimatedMonthlyCents,
        createdAt: seed.createdAt,
      }
    : null;

  return NextResponse.json({ ok: true, claimed, seed: planSeed });
}
