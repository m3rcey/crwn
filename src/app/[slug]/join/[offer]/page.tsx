import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { isPresentableArtistName } from '@/lib/publicName';
import {
  offerIsLive,
  ballotOpenForFreeJoin,
  type SongLabOfferCore,
  type SongLabDecisionCore,
  type DecisionOption,
} from '@/lib/songLab/core';
import { songLabArtistBySlug } from '@/lib/songLab/access';
import { resolveOfferEnrollTier, resolveOfferPhase } from '@/lib/songLab/server';
import { formatTimeInZone } from '@/lib/songLab/schedule';
import {
  OfferLanding,
  type LandingBallot,
  type LandingInterlude,
} from '@/components/songlab/OfferLanding';

interface OfferPageProps {
  params: Promise<{ slug: string; offer: string }>;
}

/**
 * The public lead-magnet landing: what an Instagram viewer sees BEFORE being asked to
 * create an account. Anonymous by design; the CTA carries them through signup with the
 * destination preserved, and the claim route does the authorized work. A missing artist,
 * a non-enabled artist and a missing/inactive offer all 404 identically.
 */
export default async function OfferPage({ params }: OfferPageProps) {
  const { slug, offer: offerSlug } = await params;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const artist = await songLabArtistBySlug(admin, slug);
  if (!artist) notFound();

  const { data: offer } = await admin
    .from('song_lab_offers')
    .select('id, slug, headline, description, cta_label, benefit_kind, is_active, starts_at, ends_at, view_count, project_id, decision_id, destination_path, tier_id')
    .eq('artist_id', artist.artistId)
    .eq('slug', offerSlug)
    .maybeSingle();
  if (!offer || !offerIsLive(offer as SongLabOfferCore, new Date())) notFound();

  // Landing traffic count. Read-then-write (no RPC): a lost increment under
  // concurrency is acceptable for an experiment counter.
  admin
    .from('song_lab_offers')
    .update({ view_count: (offer.view_count ?? 0) + 1 })
    .eq('id', offer.id)
    .then(() => {}, () => {});

  const { data: profileRow } = await admin
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', artist.userId)
    .maybeSingle();
  const rawName = profileRow?.display_name ?? null;
  const artistName = isPresentableArtistName(rawName) ? (rawName as string) : 'This artist';

  // Live show mode. A vote offer renders a BALLOT on the landing, and which ballot is
  // resolved HERE, on the server, from the event's polls and the clock. One printed QR
  // therefore shows Show 1 before its close time and Show 2 after, with no second link
  // and nothing for the audience to choose. The fan's device clock is never consulted.
  let ballot: LandingBallot | null = null;
  let interlude: LandingInterlude | null = null;

  if (offer.benefit_kind === 'vote') {
    const now = new Date();
    const { phase, timeZone } = await resolveOfferPhase(admin, artist.artistId, offer, now);

    if (phase.kind === 'active') {
      const enrollTierId = await resolveOfferEnrollTier(admin, artist.artistId, offer.tier_id ?? null);
      if (ballotOpenForFreeJoin(phase.poll as unknown as SongLabDecisionCore, enrollTierId, now)) {
        ballot = {
          decisionId: phase.poll.id,
          question: phase.poll.question,
          options: (phase.poll.options || []) as DecisionOption[],
          // The exact closing instant, so the ballot can run a live countdown. Sent as
          // an absolute timestamp and never as a formatted clock time: the countdown is
          // a duration, which is true in every timezone the link reaches.
          closesAt: (phase.poll.closes_at as string | null) ?? null,
        };
      }
      // A poll open only to PAID tiers cannot be delivered by a free join, so the page
      // falls back to the classic CTA rather than promising a vote it cannot cast.
    } else if (phase.kind === 'between') {
      // Between sets. Name the next show and, when it is scheduled, when it opens.
      // Timezone comes from the EVENT, never from the visitor's browser.
      interlude = {
        kind: 'between',
        endedLabel: phase.endedPoll?.stage_label ?? null,
        nextLabel: phase.nextPoll.stage_label,
        opensAtLabel: formatTimeInZone(phase.opensAt, timeZone) || null,
      };
    } else if (phase.kind === 'ended') {
      interlude = { kind: 'ended', endedLabel: null, nextLabel: null, opensAtLabel: null };
    }
    // phase.kind === 'none' (nothing published yet) keeps the classic join CTA, so the
    // link still captures a fan instead of showing an empty screen.
  }

  // Ballot mode performs a vote, so the artist's join-flavored CTA label is not sent to
  // the client at all: it would ship "Join free" into the payload of a page whose one
  // action is casting a vote.
  const ctaLabel = ballot ? '' : (offer.cta_label || 'Join free');

  return (
    <OfferLanding
      artistSlug={artist.slug}
      artistName={artistName}
      avatarUrl={profileRow?.avatar_url ?? null}
      offerSlug={offer.slug}
      headline={offer.headline}
      description={offer.description}
      ctaLabel={ctaLabel}
      ballot={ballot}
      interlude={interlude}
    />
  );
}
