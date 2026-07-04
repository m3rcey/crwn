import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { LIVE_AGREEMENT_VERSION } from '@/lib/liveAgreement';

// Records and reports acceptance of the CRWN Live-Streaming Agreement.
// This is the liability-shifting record: it must persist. Writes go through the
// service-role client here (there is no client INSERT policy on the table), so
// the acceptance is created under the authenticated user's identity only.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// GET -> { accepted: boolean, version } — has the current user accepted the
// current agreement version? Used by the pre-stream screen to skip re-prompting.
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data } = await supabaseAdmin
    .from('live_agreement_acceptances')
    .select('id')
    .eq('fan_id', user.id)
    .eq('version', LIVE_AGREEMENT_VERSION)
    .maybeSingle();

  return NextResponse.json({ accepted: Boolean(data), version: LIVE_AGREEMENT_VERSION });
}

// POST -> record the current user's acceptance of the current version.
// `artistId` is the artist_profiles row they are acting as (verified as owned).
// Idempotent: re-accepting the same version is a no-op via the unique constraint.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { artistId } = await req.json().catch(() => ({ artistId: null }));

  // Verify the caller actually owns the artist profile they claim to act as.
  // A null/foreign artistId still records acceptance (fan_id is the record that
  // matters for the gate), but we only store a verified artist_id.
  let verifiedArtistId: string | null = null;
  if (artistId) {
    const { data: ownedArtist } = await supabase
      .from('artist_profiles')
      .select('id')
      .eq('id', artistId)
      .eq('user_id', user.id)
      .maybeSingle();
    verifiedArtistId = ownedArtist?.id || null;
  }

  const userAgent = req.headers.get('user-agent')?.slice(0, 500) || null;

  const { error } = await supabaseAdmin
    .from('live_agreement_acceptances')
    .upsert(
      {
        fan_id: user.id,
        artist_id: verifiedArtistId,
        version: LIVE_AGREEMENT_VERSION,
        user_agent: userAgent,
        accepted_at: new Date().toISOString(),
      },
      { onConflict: 'fan_id,version' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, accepted: true, version: LIVE_AGREEMENT_VERSION });
}
