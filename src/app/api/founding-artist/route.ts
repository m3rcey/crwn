import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FOUNDING_LIMIT = 500;

export async function POST(req: NextRequest) {
  const { artistId } = await req.json();

  if (!artistId) {
    return NextResponse.json({ error: 'Missing artistId' }, { status: 400 });
  }

  // Check if already a founding artist
  const { data: existing } = await supabaseAdmin
    .from('artist_profiles')
    .select('is_founding_artist, founding_artist_number')
    .eq('id', artistId)
    .single();

  if (existing?.is_founding_artist) {
    return NextResponse.json({
      isFoundingArtist: true,
      number: existing.founding_artist_number,
    });
  }

  // Count current founding artists
  const { count } = await supabaseAdmin
    .from('artist_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('is_founding_artist', true);

  const currentCount = count || 0;

  if (currentCount >= FOUNDING_LIMIT) {
    return NextResponse.json({ isFoundingArtist: false, spotsLeft: 0 });
  }

  // Assign founding artist status
  const foundingNumber = currentCount + 1;
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 3); // 3 months from now

  const { error } = await supabaseAdmin
    .from('artist_profiles')
    .update({
      is_founding_artist: true,
      founding_artist_number: foundingNumber,
      founding_artist_expires_at: expiresAt.toISOString(),
      platform_tier: 'pro', // Free Pro for founding artists
    })
    .eq('id', artistId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    isFoundingArtist: true,
    number: foundingNumber,
    spotsLeft: FOUNDING_LIMIT - foundingNumber,
    expiresAt: expiresAt.toISOString(),
  });
}

// GET endpoint for artist count (used by homepage)
export async function GET() {
  const { count } = await supabaseAdmin
    .from('artist_profiles')
    .select('id', { count: 'exact', head: true });

  const { count: foundingCount } = await supabaseAdmin
    .from('artist_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('is_founding_artist', true);

  return NextResponse.json({
    totalArtists: count || 0,
    foundingArtists: foundingCount || 0,
    spotsLeft: Math.max(0, FOUNDING_LIMIT - (foundingCount || 0)),
    limit: FOUNDING_LIMIT,
  });
}
