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
import { resolveOfferEnrollTier, recordLabVote, resolveOfferPhase } from '@/lib/songLab/server';
import { normalizeClaimSource } from '@/lib/songLab/claimSource';
import { mergedResults } from '@/lib/songLab/publicParticipant';
import {
  offerIsLive,
  claimDestination,
  isFreshSignup,
  checkVote,
  safeLabPath,
  type DecisionOption,
  type SongLabOfferCore,
  type SongLabDecisionCore,
} from '@/lib/songLab/core';
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
    // Optional: a vote carried from the vote-first landing (live show mode). Validated
    // against the offer's own decision below; an invalid one never blocks the join.
    const carriedOptionId = typeof body.optionId === 'string' ? body.optionId.trim().slice(0, 8) : '';
    // Which show the page was displaying, so a submission that crossed a show handover
    // can be refused instead of counted in the wrong set. A POINTER, never authority.
    const carriedDecisionId = typeof body.decisionId === 'string' ? body.decisionId.trim().slice(0, 64) : '';
    // How they arrived (qr / jubo / link). Reporting dimension ONLY: allowlisted, never
    // used for access, pricing or eligibility.
    const source = normalizeClaimSource(body.source);
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
    // Shared with the vote-first landing so the ballot shown is the ballot delivered.
    const tierId = await resolveOfferEnrollTier(supabaseAdmin, artist.artistId, offer.tier_id ?? null);
    if (!tierId) {
      return NextResponse.json({ error: 'This artist has no free tier to join' }, { status: 409 });
    }

    const join = await joinFreeTier(supabaseAdmin, user.id, tierId);
    if (join.status === 'error') {
      return NextResponse.json({ error: 'Could not complete the free join' }, { status: 500 });
    }

    // The attribution row. UNIQUE(offer_id, fan_id) + ignoreDuplicates keeps the FIRST
    // claim's facts (first-touch, same policy as persisted campaign attribution).
    const claimRow = {
      offer_id: offer.id,
      artist_id: artist.artistId,
      fan_id: user.id,
      join_result: join.status === 'joined' ? 'joined' : 'already_member',
      fresh_signup: isFreshSignup(user.created_at, new Date()),
    };
    const { error: claimError } = await supabaseAdmin
      .from('song_lab_offer_claims')
      .upsert(source ? { ...claimRow, source } : claimRow,
        { onConflict: 'offer_id,fan_id', ignoreDuplicates: true });
    if (claimError) {
      // `source` arrives with schema-phase2-song-lab-live-shows.sql. Before it is applied
      // the column does not exist, and losing the whole attribution row over a reporting
      // field would be worse than losing the field. Retry without it.
      if (source && (claimError.code === 'PGRST204' || claimError.code === '42703')) {
        const { error: retryError } = await supabaseAdmin
          .from('song_lab_offer_claims')
          .upsert(claimRow, { onConflict: 'offer_id,fan_id', ignoreDuplicates: true });
        if (retryError) console.error('[song-lab] claim record failed (non-fatal):', retryError.message);
      } else {
        console.error('[song-lab] claim record failed (non-fatal):', claimError.message);
      }
    }

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

    // Live show mode: the landing carried a ballot choice through the ONE submission
    // (and through signup, for a brand-new fan). Same authority chain as /api/song-lab/vote:
    // the decision must be the OFFER'S own, checkVote re-derives open/option/eligibility
    // server-side, and the fan's tier comes from the subscriptions table (which the join
    // above just wrote). A denied vote never un-joins anyone; they pick by hand on the Lab.
    // The SERVER decides which show is live, never the page and never the phone's clock.
    // If the fan's page was showing Show 1 and Show 1 closed while they typed, the vote is
    // refused with `stale_show` rather than silently landing in Show 2's tally.
    let voted = false;
    let voteRefusal: string | null = null;
    let votedPoll: { id: string; options?: unknown } | null = null;
    if (carriedOptionId && offer.benefit_kind === 'vote') {
      const { phase } = await resolveOfferPhase(supabaseAdmin, artist.artistId, offer, new Date());
      if (phase.kind !== 'active') {
        voteRefusal = 'not_open';
      } else if (carriedDecisionId && carriedDecisionId !== phase.poll.id) {
        voteRefusal = 'stale_show';
      } else {
        const decision = phase.poll;
        const { data: sub } = await supabaseAdmin
          .from('subscriptions')
          .select('tier_id')
          .eq('fan_id', user.id)
          .eq('artist_id', artist.artistId)
          .eq('status', 'active')
          .maybeSingle();
        const verdict = checkVote({
          decision: decision as unknown as SongLabDecisionCore,
          now: new Date(),
          optionId: carriedOptionId,
          fanTierId: sub?.tier_id ?? null,
        });
        if (verdict.ok) {
          voted = await recordLabVote(
            supabaseAdmin,
            { id: decision.id, artist_id: artist.artistId, project_id: decision.project_id ?? null },
            user.id,
            carriedOptionId,
          );
          if (voted) votedPoll = { id: decision.id, options: decision.options };
        } else {
          voteRefusal = verdict.reason;
        }
      }
    }

    // The standing of the poll they just voted in, so a signed-in fan sees the same
    // success screen as everyone else. Counts both account and public votes.
    let results: { options: Array<{ id: string; label: string; votes: number; percent: number }>; total: number } | null = null;
    if (votedPoll) {
      const [{ data: accountVotes }, publicVotes] = await Promise.all([
        supabaseAdmin.from('song_lab_votes').select('option_id').eq('decision_id', votedPoll.id),
        supabaseAdmin.from('song_lab_public_votes').select('option_id').eq('decision_id', votedPoll.id)
          .then((r) => r.data ?? [], () => []),
      ]);
      results = mergedResults((votedPoll.options || []) as DecisionOption[], accountVotes || [], publicVotes || []);
    }

    return NextResponse.json({
      success: true,
      joined: join.status === 'joined',
      alreadyMember: join.status === 'already_member',
      voted,
      voteRefusal,
      results,
      destination: claimDestination(offer as SongLabOfferCore, artist.slug),
      // A vote offer may also carry a reward destination (e.g. a free live performance
      // post). The landing's confirmation screen offers it; the canonical destination
      // above still deep-links the vote. Internal paths only, same rule as everywhere.
      rewardPath: offer.benefit_kind === 'vote' && offer.destination_path
        ? safeLabPath(offer.destination_path)
        : null,
    });
  } catch (err) {
    console.error('[song-lab] claim route error:', err);
    return NextResponse.json({ error: 'Failed to claim offer' }, { status: 500 });
  }
}
