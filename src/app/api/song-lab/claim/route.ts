// Song Lab offer claim — the bridge from an Instagram tap to a CRWN membership.
//
// The authenticated fan claims an offer by (artistSlug, offerSlug). The route:
//   1. resolves the artist THROUGH the gate (unknown slug and non-enabled artist 404 alike),
//   2. loads the offer and requires it live (active + inside its window),
//   3. enrolls the fan in the offer's free tier through the CANONICAL free-join path
//      (src/lib/subscriptions/freeJoin.ts, same writer as /api/stripe/free-subscribe),
//   4. records the claim (UNIQUE per offer+fan) with join_result and fresh_signup, which is
//      the attribution spine "which magnet produced which member",
//   5. marks a brand-new supporter's onboarding complete (the same semantics as the setup
//      wizard's "continue as a supporter" escape: someone who joined an artist's free tier
//      IS a supporter, and routing them into the artist setup wizard would be hostile),
//   6. answers with the benefit destination (always an internal path).
//
// Attribution never gates anything here: the offer id decides only the REPORTING row and
// the redirect. The tier that gets enrolled is validated server-side against the offer's
// own artist (MEASURE-004 stays honest).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { songLabArtistBySlug } from '@/lib/songLab/access';
import { offerIsLive, claimDestination, isFreshSignup, type SongLabOfferCore } from '@/lib/songLab/core';
import { joinFreeTier } from '@/lib/subscriptions/freeJoin';
import { notifyNewSubscriber } from '@/lib/notifications';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const allowed = await checkRateLimit(user.id, 'song-lab-claim', 60, 10);
    if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    const artistSlug = typeof body.artistSlug === 'string' ? body.artistSlug : '';
    const offerSlug = typeof body.offerSlug === 'string' ? body.offerSlug : '';
    if (!artistSlug || !offerSlug) {
      return NextResponse.json({ error: 'Missing artistSlug or offerSlug' }, { status: 400 });
    }

    const artist = await songLabArtistBySlug(supabaseAdmin, artistSlug);
    if (!artist) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: offer } = await supabaseAdmin
      .from('song_lab_offers')
      .select('*')
      .eq('artist_id', artist.artistId)
      .eq('slug', offerSlug)
      .maybeSingle();
    if (!offer || !offerIsLive(offer as SongLabOfferCore, new Date())) {
      return NextResponse.json({ error: 'This offer is not available right now' }, { status: 404 });
    }

    // Resolve the tier to enroll: the offer's configured tier, else the artist's free tier.
    // Either way it must belong to THIS artist and cost 0 (joinFreeTier re-checks price).
    let tierId: string | null = null;
    if (offer.tier_id) {
      const { data: tier } = await supabaseAdmin
        .from('subscription_tiers')
        .select('id, price, artist_id')
        .eq('id', offer.tier_id)
        .eq('artist_id', artist.artistId)
        .eq('is_active', true)
        .maybeSingle();
      if (tier && tier.price === 0) tierId = tier.id;
    }
    if (!tierId) {
      const { data: freeTier } = await supabaseAdmin
        .from('subscription_tiers')
        .select('id')
        .eq('artist_id', artist.artistId)
        .eq('is_active', true)
        .eq('price', 0)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      tierId = freeTier?.id ?? null;
    }
    if (!tierId) {
      return NextResponse.json({ error: 'This artist has no free tier to join' }, { status: 409 });
    }

    const join = await joinFreeTier(supabaseAdmin, user.id, tierId);
    if (join.status === 'error') {
      return NextResponse.json({ error: 'Could not complete the free join' }, { status: 500 });
    }

    // The attribution row. UNIQUE(offer_id, fan_id) + ignoreDuplicates keeps the FIRST
    // claim's facts (first-touch, same policy as persisted campaign attribution).
    const { error: claimError } = await supabaseAdmin
      .from('song_lab_offer_claims')
      .upsert({
        offer_id: offer.id,
        artist_id: artist.artistId,
        fan_id: user.id,
        join_result: join.status === 'joined' ? 'joined' : 'already_member',
        fresh_signup: isFreshSignup(user.created_at, new Date()),
      }, { onConflict: 'offer_id,fan_id', ignoreDuplicates: true });
    if (claimError) console.error('[song-lab] claim record failed (non-fatal):', claimError.message);

    // A fan who arrived through an artist's lead magnet is a SUPPORTER. Completing their
    // onboarding here mirrors the setup wizard's "continue as a supporter" server-side
    // write, so the (main) gate never routes them into the ARTIST wizard. Artists (role
    // or artist_profiles row) are left alone.
    if (join.status === 'joined') {
      try {
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('role, onboarding_completed')
          .eq('id', user.id)
          .maybeSingle();
        if (profile && profile.role === 'fan' && !profile.onboarding_completed) {
          const { data: hasArtistRow } = await supabaseAdmin
            .from('artist_profiles')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle();
          if (!hasArtistRow) {
            await supabaseAdmin
              .from('profiles')
              .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
              .eq('id', user.id);
          }
        }
      } catch {
        // best-effort; the fan can still complete onboarding normally
      }

      // Tell the artist, same as every other free join.
      try {
        const [{ data: fanProfile }, { data: tierRow }] = await Promise.all([
          supabaseAdmin.from('profiles').select('display_name').eq('id', user.id).single(),
          supabaseAdmin.from('subscription_tiers').select('name').eq('id', tierId).single(),
        ]);
        await notifyNewSubscriber(
          supabaseAdmin,
          artist.userId,
          fanProfile?.display_name || 'A fan',
          tierRow?.name || 'Free'
        );
      } catch (e) {
        console.error('[song-lab] subscriber notification failed (non-fatal):', e);
      }
    }

    return NextResponse.json({
      success: true,
      joined: join.status === 'joined',
      alreadyMember: join.status === 'already_member',
      destination: claimDestination(offer as SongLabOfferCore, artist.slug),
    });
  } catch (err) {
    console.error('[song-lab] claim route error:', err);
    return NextResponse.json({ error: 'Failed to claim offer' }, { status: 500 });
  }
}
