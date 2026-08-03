// GET /api/artist/tier-evidence?artistId=&from=&to= — per-rung evidence for the four-tier
// ladder. Derived on read, stored nowhere.
//
// EVIDENCE ONLY. No recommendations, no thresholds, no scoring. The deterministic Constraint
// Engine is the intended consumer and is deliberately not built yet.
//
// This is an artist's private commercial data (what each rung earns, who churned), so it takes
// the same ownership check as /api/analytics. Middleware skips /api/, and the reader runs with
// the service-role client to aggregate across tables, which means the ONLY thing standing
// between a competitor and these numbers is requireArtistOwner. Do not remove it, and do not
// let artistId come from anywhere except a value that check has verified against the session.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireArtistOwner } from '@/lib/apiAuth';
import { readTierEvidence } from '@/lib/analytics/tierEvidence';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 365;

function parseRange(sp: URLSearchParams): { from: string; to: string } {
  const now = Date.now();
  const rawTo = sp.get('to');
  const rawFrom = sp.get('from');

  const toMs = rawTo && !Number.isNaN(new Date(rawTo).getTime()) ? new Date(rawTo).getTime() : now;
  const fromMs =
    rawFrom && !Number.isNaN(new Date(rawFrom).getTime())
      ? new Date(rawFrom).getTime()
      : toMs - DEFAULT_WINDOW_DAYS * DAY_MS;

  // Clamp so a hand-edited URL cannot ask for an unbounded scan, and so an inverted range
  // degrades to the default window instead of returning a confidently empty result.
  const safeFrom = fromMs < toMs ? Math.max(fromMs, toMs - MAX_WINDOW_DAYS * DAY_MS) : toMs - DEFAULT_WINDOW_DAYS * DAY_MS;

  return { from: new Date(safeFrom).toISOString(), to: new Date(toMs).toISOString() };
}

export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get('artistId');

  const auth = await requireArtistOwner(artistId);
  if (!auth.ok) return auth.error;

  const { from, to } = parseRange(req.nextUrl.searchParams);

  try {
    const evidence = await readTierEvidence(supabaseAdmin, {
      artistId: artistId as string,
      from,
      to,
    });
    return NextResponse.json(evidence);
  } catch (err) {
    console.error('tier-evidence read failed:', err);
    return NextResponse.json({ error: 'Failed to read tier evidence' }, { status: 500 });
  }
}
