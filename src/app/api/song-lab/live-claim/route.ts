// Live-show capture: first name + email + a song, in ONE tap, with the vote counted
// immediately. The only unauthenticated write path in Song Lab.
//
// WHY IT EXISTS. Email confirmation is ON for this project, so `signUp` returns no
// session, and the authenticated /api/song-lab/claim route therefore could not run until
// the attendee left the show, opened their inbox and came back. In a dark room, mid-set,
// most people never do: the founder's own test produced a working page and ZERO votes.
//
// WHAT IT DOES NOT DO, AND THIS IS THE WHOLE SECURITY ARGUMENT:
//
//   * It NEVER returns a session, a token, or a cookie. The person who typed the email
//     gains no authenticated capability whatsoever. Signing in still requires proving
//     inbox ownership through the emailed link or a password reset.
//   * It NEVER marks an email as verified. The user it creates has
//     `email_confirmed_at = NULL`, which is exactly the row `signUp` already writes today.
//     Nothing here claims a verification that did not happen.
//   * It NEVER acts for an email that already belongs to a CONFIRMED account. That is a
//     real person, and casting a vote or joining a membership in their name on an
//     unproven claim is the abuse this route is most careful to refuse.
//
// So the identity it can create owns exactly two things, both harmless and both promised
// on the page: one advisory vote in an open poll, and a free-tier membership with an
// artist who may email them (with the unsubscribe every CRWN email carries).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rateLimit';
import { songLabArtistBySlug } from '@/lib/songLab/access';
import { resolveOfferEnrollTier, recordLabVote, resolveOfferPhase } from '@/lib/songLab/server';
import { offerIsLive, checkVote, claimDestination, safeLabPath, type SongLabOfferCore, type SongLabDecisionCore } from '@/lib/songLab/core';
import { normalizeClaimSource } from '@/lib/songLab/claimSource';
import { normalizeEmail, cleanFirstName, identityDecision, NEEDS_SIGN_IN_MESSAGE } from '@/lib/songLab/liveClaim';
import { isPlausibleEmail } from '@/lib/songLab/voteForm';
import { joinFreeTier } from '@/lib/subscriptions/freeJoin';
import { notifyNewSubscriber } from '@/lib/notifications';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { liveShowAccessEmail, liveShowAccessSubject } from '@/lib/emails/liveShowAccess';
import { isPresentableArtistName } from '@/lib/publicName';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/** A venue puts a whole room behind one NAT address, so the per-IP ceiling has to fit a
 *  crowd scanning at once. Ballot stuffing is bounded by the per-email limit and by
 *  UNIQUE(decision_id, fan_id) instead, which are the limits that actually bind. */
const IP_WINDOW_SECONDS = 600;
const IP_MAX = 120;
const EMAIL_WINDOW_SECONDS = 3600;
const EMAIL_MAX = 5;

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for') || '';
  return fwd.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const artistSlug = typeof body.artistSlug === 'string' ? body.artistSlug : '';
    const offerSlug = typeof body.offerSlug === 'string' ? body.offerSlug : '';
    const optionId = typeof body.optionId === 'string' ? body.optionId.trim().slice(0, 8) : '';
    const carriedDecisionId = typeof body.decisionId === 'string' ? body.decisionId.trim().slice(0, 64) : '';
    const firstName = cleanFirstName(body.firstName);
    const email = normalizeEmail(body.email);
    const source = normalizeClaimSource(body.source);

    if (!artistSlug || !offerSlug || !optionId) {
      return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 400 });
    }
    if (!firstName) return NextResponse.json({ error: 'Enter your first name.', field: 'firstName' }, { status: 400 });
    if (!isPlausibleEmail(email)) return NextResponse.json({ error: 'Enter a valid email.', field: 'email' }, { status: 400 });

    // Abuse control before any account work.
    const ipOk = await checkRateLimit(`live-claim-ip:${clientIp(req)}`, 'live-claim-ip', IP_WINDOW_SECONDS, IP_MAX);
    if (!ipOk) return NextResponse.json({ error: 'Too many votes from this connection. Try again in a minute.' }, { status: 429 });
    const emailOk = await checkRateLimit(`live-claim-email:${email}`, 'live-claim-email', EMAIL_WINDOW_SECONDS, EMAIL_MAX);
    if (!emailOk) return NextResponse.json({ error: 'That email has already been used a few times. Try again later.' }, { status: 429 });

    // Artist through the Song Lab gate: unknown and not-enabled answer identically.
    const artist = await songLabArtistBySlug(supabaseAdmin, artistSlug);
    if (!artist) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: offer } = await supabaseAdmin
      .from('song_lab_offers')
      .select('*')
      .eq('artist_id', artist.artistId)
      .eq('slug', offerSlug)
      .maybeSingle();
    if (!offer || !offerIsLive(offer as SongLabOfferCore, new Date()) || offer.benefit_kind !== 'vote') {
      return NextResponse.json({ error: 'This vote is not available right now.' }, { status: 404 });
    }

    // WHICH poll is live is decided here, not by the page. A submission from a page whose
    // set has closed is refused rather than dropped into the next set's tally.
    const { phase } = await resolveOfferPhase(supabaseAdmin, artist.artistId, offer, new Date());
    if (phase.kind !== 'active') {
      return NextResponse.json({ error: 'Voting has closed.', reason: 'not_open' }, { status: 409 });
    }
    if (carriedDecisionId && carriedDecisionId !== phase.poll.id) {
      return NextResponse.json({ error: 'Voting for that show has closed.', reason: 'stale_show' }, { status: 409 });
    }
    if (!(phase.poll.options || []).some((o) => o.id === optionId)) {
      return NextResponse.json({ error: 'That song is no longer on the list. Pick another.', reason: 'invalid_option' }, { status: 400 });
    }

    const tierId = await resolveOfferEnrollTier(supabaseAdmin, artist.artistId, offer.tier_id ?? null);
    if (!tierId) return NextResponse.json({ error: 'This artist has no free tier to join' }, { status: 409 });

    // ── Identity ──
    // The admin search is a SEARCH: identityDecision re-matches the exact address, so a
    // near miss can never vote one person as another.
    let userId: string | null = null;
    let createdNow = false;
    const lookup = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
      { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || '', Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}` } },
    ).then((r) => (r.ok ? r.json() : null)).catch(() => null);

    // A lookup that FAILS must not silently fall through to creating an account: that is
    // how a confirmed owner would get voted as. Fail closed to the sign-in path.
    if (!lookup || !Array.isArray(lookup.users)) {
      return NextResponse.json({ error: NEEDS_SIGN_IN_MESSAGE, needsSignIn: true }, { status: 409 });
    }

    const decision = identityDecision(email, lookup.users);
    if (decision.kind === 'needs_sign_in') {
      // A real, verified account owns this address. Nothing is written.
      return NextResponse.json({ error: NEEDS_SIGN_IN_MESSAGE, needsSignIn: true }, { status: 409 });
    }
    if (decision.kind === 'reuse') {
      userId = decision.userId;
    } else {
      const { data: made, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        // NO email_confirm. The address stays unverified, which is the truth, and is the
        // same state signUp leaves behind today.
        user_metadata: { display_name: firstName },
      });
      if (createError || !made?.user) {
        // Lost a race with a concurrent submission, or the address became taken.
        return NextResponse.json({ error: NEEDS_SIGN_IN_MESSAGE, needsSignIn: true }, { status: 409 });
      }
      userId = made.user.id;
      createdNow = true;
    }

    // ── The free membership, through the ONE canonical writer ──
    const join = await joinFreeTier(supabaseAdmin, userId, tierId);
    if (join.status === 'error') {
      return NextResponse.json({ error: 'Could not finish that. Try again.' }, { status: 500 });
    }

    // ── The vote, through the same authority as every other vote ──
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('tier_id')
      .eq('fan_id', userId)
      .eq('artist_id', artist.artistId)
      .eq('status', 'active')
      .maybeSingle();
    const verdict = checkVote({
      decision: phase.poll as unknown as SongLabDecisionCore,
      now: new Date(),
      optionId,
      fanTierId: sub?.tier_id ?? null,
    });
    let voted = false;
    if (verdict.ok) {
      voted = await recordLabVote(
        supabaseAdmin,
        { id: phase.poll.id, artist_id: artist.artistId, project_id: phase.poll.project_id ?? null },
        userId,
        optionId,
      );
    }

    // ── Attribution (first touch, idempotent) ──
    const claimRow = {
      offer_id: offer.id,
      artist_id: artist.artistId,
      fan_id: userId,
      join_result: join.status === 'joined' ? 'joined' : 'already_member',
      // A capture account is created in this same request, so it is always a fresh signup
      // when we made it; a reused capture account is not.
      fresh_signup: createdNow,
    };
    const { error: claimError } = await supabaseAdmin
      .from('song_lab_offer_claims')
      .upsert(source ? { ...claimRow, source } : claimRow, { onConflict: 'offer_id,fan_id', ignoreDuplicates: true });
    if (claimError && source && (claimError.code === 'PGRST204' || claimError.code === '42703')) {
      await supabaseAdmin.from('song_lab_offer_claims')
        .upsert(claimRow, { onConflict: 'offer_id,fan_id', ignoreDuplicates: true });
    }

    // A captured supporter must not be routed into the ARTIST setup wizard when they
    // eventually sign in. Only ever touches a plain fan profile we are sure about.
    if (createdNow) {
      await supabaseAdmin
        .from('profiles')
        .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .eq('role', 'fan')
        .then(() => {}, () => {});
    }

    // ── Tell the artist, exactly as every other free join does ──
    if (join.status === 'joined') {
      try {
        const { data: tierRow } = await supabaseAdmin.from('subscription_tiers').select('name').eq('id', tierId).single();
        await notifyNewSubscriber(supabaseAdmin, artist.userId, firstName || 'A fan', tierRow?.name || 'Free');
      } catch (e) {
        console.error('[song-lab] live claim notify failed (non-fatal):', e);
      }
    }

    // ── The account-access email. NOT a gate: the vote is already counted above. ──
    let emailSent = false;
    try {
      const { data: artistProfile } = await supabaseAdmin
        .from('profiles').select('display_name').eq('id', artist.userId).maybeSingle();
      const rawName = artistProfile?.display_name ?? null;
      const artistName = isPresentableArtistName(rawName) ? (rawName as string) : 'This artist';
      const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://thecrwn.app';

      // Generated, not sent, by Supabase: CRWN delivers it through Resend so a full room
      // is not throttled by the built-in auth mailer's few-per-hour ceiling.
      let signInUrl: string | null = null;
      try {
        const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email,
          options: { redirectTo: `${site}/${artist.slug}` },
        });
        signInUrl = linkData?.properties?.action_link ?? null;
      } catch { /* the vote stands with or without a link */ }

      if (resend) {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: email,
          subject: liveShowAccessSubject(artistName),
          html: liveShowAccessEmail({
            firstName,
            artistName,
            songLabel: (phase.poll.options || []).find((o) => o.id === optionId)?.label ?? null,
            signInUrl,
            artistUrl: `${site}/${artist.slug}`,
          }),
        });
        emailSent = true;
      }
    } catch (e) {
      console.error('[song-lab] live claim access email failed (non-fatal):', e);
    }

    // No session, no token, no cookie: capture is not ownership.
    return NextResponse.json({
      success: true,
      voted,
      joined: join.status === 'joined',
      alreadyMember: join.status === 'already_member',
      emailSent,
      destination: claimDestination(offer as SongLabOfferCore, artist.slug),
      rewardPath: offer.destination_path ? safeLabPath(offer.destination_path) : null,
    });
  } catch (err) {
    console.error('[song-lab] live claim error:', err);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
