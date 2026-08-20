import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { isPresentableArtistName } from '@/lib/publicName';
import { offerIsLive, type SongLabOfferCore } from '@/lib/songLab/core';
import { songLabArtistBySlug } from '@/lib/songLab/access';
import { OfferLanding } from '@/components/songlab/OfferLanding';

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
    .select('id, slug, headline, description, cta_label, benefit_kind, is_active, starts_at, ends_at, view_count, project_id, decision_id, destination_path')
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

  return (
    <OfferLanding
      artistSlug={artist.slug}
      artistName={artistName}
      avatarUrl={profileRow?.avatar_url ?? null}
      offerSlug={offer.slug}
      headline={offer.headline}
      description={offer.description}
      ctaLabel={offer.cta_label || 'Join free'}
    />
  );
}
