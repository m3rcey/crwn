import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { LiveWatchRoom } from '@/components/live/LiveWatchRoom';
import { LiveSession } from '@/types/live';

interface LivePageProps {
  params: Promise<{ slug: string; sessionId: string }>;
}

// OG tags so a shared session link previews the offer (the producer scripts drive
// fans to these links). Best-effort: falls back to a plain title if the session
// or artist can't be read.
export async function generateMetadata({ params }: LivePageProps): Promise<Metadata> {
  const { slug, sessionId } = await params;
  try {
    const supabase = await createServerSupabaseClient();
    const { data: artist } = await supabase
      .from('artist_profiles')
      .select('id, profile:profiles(display_name)')
      .eq('slug', slug)
      .single();
    if (!artist) return { title: 'Live Session | CRWN' };
    const { data: session } = await supabase
      .from('live_sessions')
      .select('title, description, submission_prompt, accepts_submissions')
      .eq('id', sessionId)
      .eq('artist_id', artist.id)
      .eq('is_active', true)
      .maybeSingle();
    if (!session) return { title: 'Live Session | CRWN' };
    const name = (artist.profile as unknown as { display_name?: string } | null)?.display_name || 'An artist';
    const title = `${session.title} · ${name}`;
    const description =
      (session.accepts_submissions && session.submission_prompt) ||
      session.description ||
      `Grab a seat in ${name}'s live session on CRWN.`;
    return {
      title: `${title} | CRWN`,
      description,
      openGraph: { title, description, type: 'website' },
      twitter: { card: 'summary_large_image', title, description },
    };
  } catch {
    return { title: 'Live Session | CRWN' };
  }
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
