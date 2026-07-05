import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DemandPublicView, type PublicDemandTest } from '@/components/demand/DemandPublicView';

interface DemandPageProps {
  params: Promise<{ slug: string; testId: string }>;
}

/**
 * Public Proof of Demand page — where fans respond (RSVP / vote / waitlist).
 * Money-FREE: nothing on this page charges anyone. RLS only exposes active
 * tests publicly (owners can also see their own), and individual responses
 * are never shown here.
 */
export default async function DemandTestPublicPage({ params }: DemandPageProps) {
  const { slug, testId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id, user_id, slug, profile:profiles(display_name, avatar_url)')
    .eq('slug', slug)
    .single();

  if (!artist) notFound();

  const { data: test } = await supabase
    .from('proof_of_demand')
    .select(
      'id, title, description, image_url, signal_type, goal_count, deadline, unlock_message, test_price, test_promoter_interest, response_count, status'
    )
    .eq('id', testId)
    .eq('artist_id', artist.id)
    .maybeSingle();

  if (!test || test.status !== 'active') notFound();

  const { data: { user } } = await supabase.auth.getUser();

  // RLS lets a fan read their own response — used to show the "you're in" state on return visits.
  let alreadyResponded = false;
  if (user) {
    const { data: existing } = await supabase
      .from('proof_of_demand_responses')
      .select('id')
      .eq('test_id', testId)
      .eq('fan_id', user.id)
      .maybeSingle();
    alreadyResponded = !!existing;
  }

  const profile = artist.profile as unknown as { display_name: string | null; avatar_url: string | null } | null;

  return (
    <DemandPublicView
      test={test as PublicDemandTest}
      artistName={profile?.display_name || 'Artist'}
      artistAvatarUrl={profile?.avatar_url || null}
      artistSlug={artist.slug}
      isLoggedIn={!!user}
      initialResponded={alreadyResponded}
    />
  );
}
