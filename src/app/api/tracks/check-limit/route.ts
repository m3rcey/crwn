import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkArtistLimit } from '@/lib/platformTier';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export async function POST(req: NextRequest) {
  const { artistId } = await req.json();

  if (!artistId) {
    return NextResponse.json({ error: 'Missing artistId' }, { status: 400 });
  }

  const result = await checkArtistLimit(artistId, 'tracks');

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
