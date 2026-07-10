import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { LiveWatchRoom } from '@/components/live/LiveWatchRoom';
import { LiveSession } from '@/types/live';

interface LivePageProps {
  params: Promise<{ slug: string; sessionId: string }>;
}

export default async function LiveSessionPage({ params }: LivePageProps) {
  const { slug, sessionId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id, user_id, slug, profile:profiles(display_name)')
    .eq('slug', slug)
    .single();

  if (!artist) notFound();

  const { data: session } = await supabase
    .from('live_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('artist_id', artist.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!session) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  const artistName = (artist.profile as unknown as { display_name: string } | null)?.display_name || 'Artist';
  const isOwner = !!user && user.id === artist.user_id;

  return (
    <LiveWatchRoom
      session={session as LiveSession}
      artistId={artist.id}
      artistSlug={artist.slug}
      artistName={artistName}
      currentUserId={user?.id || null}
      isOwner={isOwner}
    />
  );
}
