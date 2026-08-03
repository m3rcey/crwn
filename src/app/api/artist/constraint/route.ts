// GET /api/artist/constraint — the artist's single blocking constraint, derived on read.
//
// Ownership comes from the SESSION and nothing else. There is no artistId parameter, by
// design: this route returns an artist's private commercial evidence (traffic, churn, per-tier
// conversion), and the safest way to prevent one artist reading another's is to make the
// request unable to name a subject at all. Middleware skips /api/, so this authenticates
// itself, exactly like /api/artist/roadmap.
//
// Stores nothing. Mutates nothing. No tier, price, promise, campaign, quest or Revenue Ramp
// state is touched by this path, and no AI provider is involved at any point: with every model
// offline this route returns the same answer.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { assembleConstraintEvidence } from '@/lib/constraint/assembler';
import { readConstraint } from '@/lib/constraint/engine';

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
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // The artist is resolved FROM the session. A fan has no artist_profiles row and is refused
  // here, so fan sessions can never reach artist-private evidence.
  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!artist) {
    return NextResponse.json({ error: 'Not an artist' }, { status: 403 });
  }

  try {
    const evidence = await assembleConstraintEvidence(supabaseAdmin, {
      artistId: artist.id,
      userId: user.id,
    });
    const result = readConstraint(evidence);

    // Only the RESULT crosses the wire. The raw evidence snapshot carries visitor hashes and
    // tier ids that the card has no use for, and an analytics response should never be the
    // reason a pseudonymous identifier leaves the server.
    return NextResponse.json({ constraint: result });
  } catch (err) {
    console.error('constraint read failed:', err);
    // A failure here must cost the artist nothing: the client falls back to the roadmap.
    return NextResponse.json({ constraint: null }, { status: 200 });
  }
}
