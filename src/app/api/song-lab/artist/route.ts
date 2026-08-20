// Is Song Lab enabled for the SIGNED-IN artist? Powers the /studio/lab gate and the
// conditional entry point. Never errors loudly: a fan, a non-enabled artist and a
// pre-migration database all read as { enabled: false }.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSongLabArtist } from '@/lib/songLab/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET() {
  const auth = await requireSongLabArtist(supabaseAdmin);
  if (!auth.ok) return NextResponse.json({ enabled: false });

  // The artist's active tiers, for the eligibility picker in the manager.
  const { data: tiers } = await supabaseAdmin
    .from('subscription_tiers')
    .select('id, name, price')
    .eq('artist_id', auth.artistId)
    .eq('is_active', true)
    .order('price', { ascending: true });

  return NextResponse.json({ enabled: true, artistId: auth.artistId, slug: auth.slug, tiers: tiers || [] });
}
