import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isPresentableArtistName } from '@/lib/publicName';
import { CampaignJoin } from '@/components/campaigns/CampaignJoin';
import type { Metadata } from 'next';
import { shareMetadata } from '@/lib/shareMetadata';

interface CampaignPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * The fan-facing drive. Public artist subroute, deliberately shaped like the rest of `[slug]/*`.
 *
 * The whole page is: here is the one job, here is your link, here is what you have actually done.
 * There is no configuration, no form to fill in and no leaderboard. A participant sees their OWN
 * verified progress and nobody else's, which is why this page can be public without publishing
 * anything about anyone.
 *
 * The campaign itself is fetched client-side from /api/fan-campaigns/active, which curates the
 * payload field by field. A draft drive is invisible here.
 */
export default async function CampaignPage({ params }: CampaignPageProps) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id, slug, profile:profiles(display_name)')
    .eq('slug', slug)
    .maybeSingle();

  if (!artist) notFound();

  const profile = artist.profile as unknown as { display_name: string | null } | null;
  const rawName = profile?.display_name ?? null;
  const artistName = isPresentableArtistName(rawName) ? (rawName as string) : 'this artist';

  return <CampaignJoin slug={slug} artistName={artistName} />;
}

export async function generateMetadata({ params }: CampaignPageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: artist } = await supabase
    .from('artist_profiles_public')
    .select('slug, profile:profiles(display_name, avatar_url)')
    .eq('slug', slug)
    .maybeSingle();

  const profile = artist?.profile as unknown as { display_name: string | null; avatar_url: string | null } | null;
  const rawName = profile?.display_name ?? null;
  const name = isPresentableArtistName(rawName) ? (rawName as string) : 'this artist';

  return shareMetadata({
    title: `Fan drive for ${name}`,
    description: `Take one job, get ${name} in front of more people, and track what you did.`,
    path: `/${slug}/campaign`,
    image: profile?.avatar_url || null,
  });
}
