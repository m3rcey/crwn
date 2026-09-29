import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { cityHintFromHeaders } from '@/lib/songLab/fanCity';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { attachStreamUrls } from '@/lib/storage/signedAudio';
import { resolveFunnelOffers, type OfferTierRow } from '@/lib/fanAutomations/offerTiers';
import { offerExperiencesForTiers } from '@/lib/offerExperience/server';
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
  type LandingOption,
  type LandingOffers,
} from '@/components/songlab/OfferLanding';
import type { Track } from '@/types';
import type { Metadata } from 'next';
import { shareMetadata } from '@/lib/shareMetadata';

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
          options: await withListenUrls((phase.poll.options || []) as DecisionOption[], artist.artistId),
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

  // An ONLINE vote (options carry songs) sells the artist's ladder under the result, exactly
  // as the drop page does: same funnel pointers, same resolver, same offer experiences. A
  // live-show ballot (text options) is unchanged.
  const online = !!ballot && ballot.options.some((o) => o.track);
  const offers = online ? await loadFunnelOffers(admin, artist.artistId) : null;
  // A suggestion for the vote form's city field, from Vercel's request geolocation. The fan
  // sees it, can change or clear it, and only what they submit is stored.
  let cityHint: string | null = null;
  if (online) {
    const h = await headers();
    cityHint = cityHintFromHeaders((n) => h.get(n));
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
      offers={offers}
      cityHint={cityHint}
    />
  );
}

/**
 * An online vote magnet lets the fan HEAR each option before voting. The song is read from
 * tracks_public AS THE VISITOR (never the admin client), so the view's own entitlement check
 * decides: a free track comes back with its locator and gets a pre-signed url, a gated one
 * comes back without and simply renders no player. Same rule as the track and album pages.
 * Fails soft to the plain text ballot.
 */
/**
 * The artist's primary + downsell offer, resolved exactly as /drop/[token] resolves it: the
 * stored funnel pointers validated against LIVE tiers by resolveFunnelOffers (primary always
 * paid, downsell strictly cheaper), then the Tier Offer Experiences for those rungs. Metadata
 * only: names, prices, benefit prose, the merchandised config. Fails soft to no offer.
 */
async function loadFunnelOffers(admin: SupabaseClient, artistId: string): Promise<LandingOffers | null> {
  try {
    const { data: automation } = await admin
      .from('fan_automations')
      .select('gold_tier_id, silver_tier_id')
      .eq('artist_id', artistId)
      .neq('status', 'archived')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    const { data: tierRows } = await admin
      .from('subscription_tiers')
      .select('id, name, price, description, is_active, access_config')
      .eq('artist_id', artistId)
      .eq('is_active', true);
    const rows = (tierRows || []) as Array<OfferTierRow & { access_config: { benefits?: unknown } | null }>;
    const { primary, downsell } = resolveFunnelOffers(rows, automation || { gold_tier_id: null, silver_tier_id: null });
    if (!primary) return null;
    const toTier = (t: OfferTierRow) => {
      const b = rows.find((r) => r.id === t.id)?.access_config?.benefits;
      return {
        id: t.id, name: t.name, priceCents: t.price, description: t.description || '',
        benefits: (Array.isArray(b) ? b.filter((x): x is string => typeof x === 'string') : []).slice(0, 6),
      };
    };
    const experiences = await offerExperiencesForTiers(
      admin, artistId, [primary, downsell].filter((t): t is OfferTierRow => !!t).map((t) => ({ id: t.id, name: t.name })),
    );
    if (!experiences[primary.id]) return null;
    return { primary: toTier(primary), downsell: downsell ? toTier(downsell) : null, experiences };
  } catch {
    return null;
  }
}

async function withListenUrls(options: DecisionOption[], artistId: string): Promise<LandingOption[]> {
  const ids = options.map((o) => o.trackId).filter((t): t is string => !!t);
  if (ids.length === 0) return options;
  try {
    const caller = await createServerSupabaseClient();
    const { data } = await caller
      .from('tracks_public')
      .select('*')
      .eq('artist_id', artistId)
      .in('id', ids);
    // A row without a locator is one this visitor may not play: no player for it.
    const playable = ((data || []) as Track[]).filter((t) => !!t.audio_url_128);
    const signed = await attachStreamUrls(playable);
    const byId = new Map(signed.map((t) => [t.id, t]));
    return options.map((o) => {
      const t = o.trackId ? byId.get(o.trackId) : undefined;
      return t ? { ...o, track: t } : o;
    });
  } catch {
    return options;
  }
}

export async function generateMetadata({ params }: OfferPageProps): Promise<Metadata> {
  const { slug, offer: offerSlug } = await params;
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const artist = await songLabArtistBySlug(admin, slug);
  if (!artist) return shareMetadata({ title: 'CRWN', description: 'This link is no longer live.' });

  const { data: offer } = await admin
    .from('song_lab_offers')
    .select('headline, description, is_active, starts_at, ends_at')
    .eq('artist_id', artist.artistId)
    .eq('slug', offerSlug)
    .maybeSingle();

  const { data: profileRow } = await admin
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', artist.userId)
    .maybeSingle();
  const rawName = profileRow?.display_name ?? null;
  const name = isPresentableArtistName(rawName) ? (rawName as string) : 'This artist';

  if (!offer || !offerIsLive(offer as unknown as SongLabOfferCore, new Date())) {
    return shareMetadata({ title: `${name} on CRWN`, description: 'This link is no longer live.' });
  }

  return shareMetadata({
    title: offer.headline || `${name} on CRWN`,
    description: offer.description || `From ${name}, on CRWN.`,
    path: `/${slug}/join/${offerSlug}`,
    image: profileRow?.avatar_url || null,
  });
}
