import { NextRequest, NextResponse } from 'next/server';
import { checkArtistLimit } from '@/lib/platformTier';
import { requireArtistOwner } from '@/lib/apiAuth';

// Cybersecurity audit 2026-08-12, MEDIUM: this route read `artistId` from the body with
// NO authentication at all and answered with that artist's platform plan and catalog
// size. `checkArtistLimit` reads through the service-role client, so RLS never applied,
// and middleware skips /api/, so nothing upstream applied either. Artist ids are handed
// out by public surfaces, which turns internal plan and usage telemetry into an
// enumerable dataset.
//
// The same class was already closed on /api/platform/limits. This uses the shared
// `requireArtistOwner` helper rather than repeating that route's inline session check,
// because an authorization rule copied by hand is a rule that drifts.
//
// The module-level service-role client this file used to construct was never referenced:
// every read happens inside `checkArtistLimit`. It is deleted rather than left as a
// standing invitation to read a row without an ownership check.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const artistId = (body as { artistId?: unknown } | null)?.artistId;

  // Also covers a missing or non-string artistId (400), so no separate presence check.
  const owner = await requireArtistOwner(artistId);
  if (!owner.ok) return owner.error;

  const result = await checkArtistLimit(artistId as string, 'tracks');

  if (!result.allowed) {
    return NextResponse.json({
      error: 'LIMIT_REACHED',
      resource: 'tracks',
      current: result.current,
      limit: result.limit,
      tier: result.tier,
      upgradeMessage: result.tier === 'starter'
        ? 'Upgrade to Pro for unlimited tracks'
        : 'You have reached your track limit',
    }, { status: 403 });
  }

  return NextResponse.json({ allowed: true, current: result.current, limit: result.limit });
}
