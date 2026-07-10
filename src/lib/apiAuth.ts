// Authorization helpers for API routes that read with the SERVICE-ROLE client.
//
// Two facts make these routes dangerous by default:
//   1. `src/middleware.ts` excludes `api/` from its matcher, so nothing upstream
//      checks who the caller is.
//   2. The admin client bypasses RLS, so nothing downstream checks either.
//
// A service-role route's authorization is therefore ONLY whatever it does itself.
// Any such route that accepts an artistId from the caller and returns that
// artist's data must call requireArtistOwner() before it reads anything.
//
// Legitimate exceptions: `/api/cron/*` (CRON_SECRET), `*/webhook` (signature),
// and genuinely public endpoints (the fan leaderboard on a public artist page).
// Those must still be deliberate, not accidental.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

interface OwnerOk {
  ok: true;
  userId: string;
  /** The artist's platform tier, read from the DB. Never trust a tier from the client. */
  platformTier: string;
  error?: undefined;
}
interface OwnerErr {
  ok: false;
  error: NextResponse;
}

/**
 * Assert the signed-in caller owns `artistId`.
 * Returns the owner's user id and their real platform tier, or a NextResponse to return.
 */
export async function requireArtistOwner(artistId: unknown): Promise<OwnerOk | OwnerErr> {
  if (typeof artistId !== 'string' || !artistId) {
    return { ok: false, error: NextResponse.json({ error: 'Missing artistId' }, { status: 400 }) };
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('id, platform_tier')
    .eq('id', artistId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!artist) {
    return { ok: false, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { ok: true, userId: user.id, platformTier: artist.platform_tier || 'starter' };
}
