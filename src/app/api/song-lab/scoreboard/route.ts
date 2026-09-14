// The no-sign-in scoreboard's refresh. GET ?artist=<slug>&token=<scoreboard token>.
//
// Authority is the TOKEN, verified in constant time against the artist the slug resolves to
// (src/lib/songLab/scoreboardToken.ts). No session is read or created. What comes back is
// aggregate standings for that artist's own published shows: show names, song names, counts,
// percentages. No fan, no email, no id beyond the show's own, no control of any kind.
//
// Every refusal is the same 404 (unknown artist, Song Lab off, wrong token, malformed
// token), so the endpoint cannot be used to learn which artists exist or which tokens are
// close. Rate limited per token and address, generously: one open phone polls four times a
// minute, and a limiter that trips during a show is worse than the traffic it stops.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rateLimit';
import { songLabArtistBySlug } from '@/lib/songLab/access';
import { loadScoreboard } from '@/lib/songLab/server';
import { verifyScoreboardToken } from '@/lib/songLab/scoreboardToken';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const NOT_FOUND = () => NextResponse.json({ error: 'Not found' }, { status: 404 });
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0', 'Referrer-Policy': 'no-referrer' };

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = (searchParams.get('artist') || '').trim().toLowerCase().slice(0, 80);
  const token = (searchParams.get('token') || '').trim().slice(0, 64);
  if (!slug || !token) return NOT_FOUND();

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const allowed = await checkRateLimit(`scoreboard:${token}:${ip}`, 'song-lab-scoreboard', 60, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: NO_STORE });

  const artist = await songLabArtistBySlug(supabaseAdmin, slug);
  if (!artist) return NOT_FOUND();
  if (!verifyScoreboardToken(artist.artistId, token, process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    return NOT_FOUND();
  }

  const shows = await loadScoreboard(supabaseAdmin, artist.artistId);
  return NextResponse.json(
    { shows, updatedAt: new Date().toISOString() },
    { headers: NO_STORE },
  );
}
