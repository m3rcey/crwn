import { NextRequest, NextResponse } from 'next/server';
import { checkArtistLimit } from '@/lib/platformTier';
import { requireArtistOwner } from '@/lib/apiAuth';

// Cybersecurity audit 2026-08-12, MEDIUM: this route read `artistId` from the body with
// NO authentication at all and answered with that artist's platform plan and paid-tier
// count. `checkArtistLimit` reads through the service-role client, so RLS never applied,
// and middleware skips /api/, so nothing upstream applied either. Artist ids are handed
// out by public surfaces, which turns internal plan and usage telemetry into an
// enumerable dataset: who is still on Launch, who has built a full ladder, who to target.
//
// The same class was already closed on /api/platform/limits. This uses the shared
// `requireArtistOwner` helper rather than repeating that route's inline session check,
// because an authorization rule copied by hand is a rule that drifts.
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

  const result = await checkArtistLimit(artistId as string, 'fanTiers');

  if (!result.allowed) {
    return NextResponse.json({
      error: 'LIMIT_REACHED',
      resource: 'fanTiers',
      current: result.current,
      limit: result.limit,
      tier: result.tier,
      // Limit counts PAID tiers only; the free front-door tier is always allowed.
      upgradeMessage: result.tier === 'starter'
        ? 'Upgrade to Pro to add up to 3 paid tiers (your free tier stays free)'
        : result.tier === 'pro'
          ? 'You have reached the 3 paid-tier limit on Pro'
          : 'You have reached the maximum paid fan tiers',
    }, { status: 403 });
  }

  return NextResponse.json({ allowed: true, current: result.current, limit: result.limit });
}
