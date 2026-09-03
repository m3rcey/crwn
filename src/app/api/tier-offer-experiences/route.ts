// The artist-facing writer for a Tier Offer Experience (the V1 Offer Builder, Rise Mode
// Guided Setup, 2026-09-03). Until now the table was service-role only with no route and no UI;
// GB's rows were written by a script.
//
// Authority: the SESSION. The artist is auth.uid() -> artist_profiles.user_id, and the tier id
// in the body is a POINTER matched against that artist's own active tiers; a foreign tier is a
// 404. The config is validated by the SAME normalizer the drop page reads through, so nothing an
// artist types can regress the two honesty rules: a preview without a declared REAL/EXAMPLE
// truth state is refused, and a "Join <tier>" button is refused. What is stored is what the
// normalizer returns, never the raw body. Nothing here touches entitlements, prices or
// protected media: a poster URL that is not plainly public is stripped by the normalizer.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { normalizeOfferExperience } from '@/lib/offerExperience/normalize';
import { refusalReason } from '@/lib/offerExperience/refusal';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function ownerArtist() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  return artist ? { userId: user.id, artistId: artist.id as string } : null;
}

/** The owner's own rows, active or not, so a guided flow can reopen what exists. */
export async function GET() {
  const owner = await ownerArtist();
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await supabaseAdmin
    .from('tier_offer_experiences')
    .select('tier_id, config, is_active, updated_at')
    .eq('artist_id', owner.artistId);
  if (error) return NextResponse.json({ experiences: [] });
  return NextResponse.json({ experiences: data ?? [] });
}

/**
 * Publish (or re-publish) one tier's experience. Body: { tierId, config }. The config must
 * survive normalization; the response names the first reason it did not so the flow can send
 * the artist back to that decision instead of failing silently.
 */
export async function PUT(req: NextRequest) {
  const owner = await ownerArtist();
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { tierId?: unknown; config?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const tierId = typeof body.tierId === 'string' ? body.tierId : '';
  if (!tierId || !/^[A-Za-z0-9-]{1,64}$/.test(tierId)) {
    return NextResponse.json({ error: 'Pick the tier this page sells.' }, { status: 400 });
  }

  const { data: tier } = await supabaseAdmin
    .from('subscription_tiers')
    .select('id, name, price')
    .eq('id', tierId)
    .eq('artist_id', owner.artistId)
    .eq('is_active', true)
    .maybeSingle();
  if (!tier) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(Number(tier.price) > 0)) {
    return NextResponse.json({ error: 'A sales page sells a paid tier. The free tier needs no page.' }, { status: 400 });
  }

  const reason = refusalReason(body.config, tier.name as string);
  if (reason) return NextResponse.json({ error: reason }, { status: 400 });
  const config = normalizeOfferExperience(body.config, tier.name as string);
  if (!config) return NextResponse.json({ error: 'The page is missing a promise, a description or a button.' }, { status: 400 });

  const { error } = await supabaseAdmin.from('tier_offer_experiences').upsert(
    { artist_id: owner.artistId, tier_id: tier.id, config, is_active: true, updated_at: new Date().toISOString() },
    { onConflict: 'tier_id' },
  );
  if (error) {
    console.error('[tier-offer-experiences] upsert failed:', error.code, error.message);
    return NextResponse.json({ error: 'Could not publish. Try again.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, tierId: tier.id, previews: config.previews.length });
}
