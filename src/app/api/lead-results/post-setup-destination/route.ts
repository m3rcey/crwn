// Where to send an artist the instant they finish onboarding.
//
// The setup wizard used to hardcode /profile/artist. Instead it asks here, and this returns the
// builder that matches the calculator they came in on (prefilled), or null so the wizard falls
// back to the dashboard. Read-only and session-scoped: it resolves the caller's own artist row and
// their own most recent claimed result, never anything from the request.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getLeadMagnetSeed } from '@/lib/leadResults/handoffSeed';
import { postSetupDestination, destinationToUrl } from '@/lib/leadResults/postSetupDestination';
import { recordFunnelEvent } from '@/lib/analytics/funnelEvents';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Resolve the CALLER's artist row — never a client-supplied id.
  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  const artistId = (artist?.id as string) ?? null;

  const seed = await getLeadMagnetSeed(supabaseAdmin, { userId: user.id, artistId });
  if (!seed) return NextResponse.json({ redirect: null });

  const dest = postSetupDestination(seed);

  // Funnel: Builder Opened. Fires when the artist is routed from setup into the prefilled builder.
  // Deduped per (user, result) so a reload of the transition does not double-count.
  if (dest) {
    await recordFunnelEvent(supabaseAdmin, {
      stage: 'builder_opened',
      artistId,
      userId: user.id,
      calculator: seed.toolSlug,
      resultId: seed.resultId,
      dedupeKey: `${user.id}:${seed.resultId}`,
      metadata: { builder: dest.path },
    });
  }

  return NextResponse.json({ redirect: dest ? destinationToUrl(dest) : null });
}
