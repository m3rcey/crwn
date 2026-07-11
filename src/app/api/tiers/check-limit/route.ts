import { NextRequest, NextResponse } from 'next/server';
import { checkArtistLimit } from '@/lib/platformTier';

export async function POST(req: NextRequest) {
  const { artistId } = await req.json();

  if (!artistId) {
    return NextResponse.json({ error: 'Missing artistId' }, { status: 400 });
  }

  const result = await checkArtistLimit(artistId, 'fanTiers');

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
