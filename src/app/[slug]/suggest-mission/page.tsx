import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { SuggestMissionWizard } from '@/components/missions/SuggestMissionWizard';
import type { Metadata } from 'next';
import { shareMetadata } from '@/lib/shareMetadata';

interface SuggestMissionPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Fan-facing "Suggest a mission" wizard — public artist subroute. Money-FREE
 * and SUGGESTION-only: nothing here publishes a mission. The proposal lands in
 * the artist's review queue as 'pending'; the artist approves (and sets the
 * real reward) or rejects. Fans can never set a reward type or commission.
 */
export default async function SuggestMissionPage({ params }: SuggestMissionPageProps) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id, user_id, slug, profile:profiles(display_name, avatar_url)')
    .eq('slug', slug)
    .single();

  if (!artist) notFound();

  // Target options the fan can point the mission at (none or a demand test in v1).
  const { data: demandTests } = await supabase
    .from('proof_of_demand')
    .select('id, title')
    .eq('artist_id', artist.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  const { data: { user } } = await supabase.auth.getUser();

  const profile = artist.profile as unknown as { display_name: string | null; avatar_url: string | null } | null;

  return (
    <SuggestMissionWizard
      artistId={artist.id}
      artistName={profile?.display_name || 'Artist'}
      artistSlug={artist.slug}
      demandTests={(demandTests as { id: string; title: string }[]) || []}
      isLoggedIn={!!user}
      isOwnPage={user?.id === artist.user_id}
    />
  );
}

export async function generateMetadata({ params }: SuggestMissionPageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: artist } = await supabase
    .from('artist_profiles_public')
    .select('slug, profile:profiles(display_name, avatar_url)')
    .eq('slug', slug)
    .maybeSingle();

  const profile = artist?.profile as unknown as { display_name: string | null; avatar_url: string | null } | null;
  const name = profile?.display_name || 'this artist';

  return shareMetadata({
    title: `Suggest a mission`,
    description: `Tell ${name} what you would do for them, and they decide whether to run it.`,
    path: `/${slug}/suggest-mission`,
    image: profile?.avatar_url || null,
  });
}
