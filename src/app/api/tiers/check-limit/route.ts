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
      upgradeMessage: result.tier === 'starter'
        ? 'Upgrade to Pro to create more fan tiers (up to 5)'
        : result.tier === 'pro'
          ? 'Upgrade to Label to create up to 10 fan tiers'
          : 'You have reached the maximum fan tiers',
    }, { status: 403 });
  }

  return NextResponse.json({ allowed: true, current: result.current, limit: result.limit });
}
