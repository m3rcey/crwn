import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { isPresentableArtistName } from '@/lib/publicName';
import { songLabArtistBySlug } from '@/lib/songLab/access';
import { SongLabFanView } from '@/components/songlab/SongLabFanView';
import type { Metadata } from 'next';
import { shareMetadata } from '@/lib/shareMetadata';

interface LabPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * The Song Lab: the public home of the songs this artist is building with fans. A public
 * artist subroute shaped like the rest of `[slug]/*` (campaign, demand). Anyone can watch
 * the process; voting is gated per decision, server-side. 404s for artists without the
 * Song Lab capability, identically to an unknown slug.
 */
export default async function LabPage({ params }: LabPageProps) {
  const { slug } = await params;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const artist = await songLabArtistBySlug(admin, slug);
  if (!artist) notFound();

  const { data: profileRow } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', artist.userId)
    .maybeSingle();
  const rawName = profileRow?.display_name ?? null;
  const artistName = isPresentableArtistName(rawName) ? (rawName as string) : 'This artist';

  return <SongLabFanView artistSlug={artist.slug} artistName={artistName} />;
}

export async function generateMetadata({ params }: LabPageProps): Promise<Metadata> {
  const { slug } = await params;
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const artist = await songLabArtistBySlug(admin, slug);
  if (!artist) return shareMetadata({ title: 'Song Lab', description: 'Build the next song with the artist.' });

  const { data: profileRow } = await admin
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', artist.userId)
    .maybeSingle();
  const rawName = profileRow?.display_name ?? null;
  const name = isPresentableArtistName(rawName) ? (rawName as string) : 'This artist';

  return shareMetadata({
    title: `${name}'s Song Lab`,
    description: `Watch ${name} build the next song, and vote on where it goes.`,
    path: `/${slug}/lab`,
    image: profileRow?.avatar_url || null,
  });
}
