import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import { EmbedPlayer } from './EmbedPlayer';
import { signAudioValue } from '@/lib/storage/signedAudio';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

interface Props {
  params: Promise<{ trackId: string }>;
}

// The page embeds a signed url that expires in an hour, so it must never be
// cached for longer than the credential it carries. Render it per request.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function EmbedTrackPage({ params }: Props) {
  const { trackId } = await params;

  // Read through tracks_public. With no session, can_play is true only for free
  // tracks, so a paid track yields audio_url_128 = NULL even if the is_free guard
  // below were ever removed.
  const { data: track } = await supabaseAdmin
    .from('tracks_public')
    .select('id, title, album_art_url, audio_url_128, duration, artist_id, is_free')
    .eq('id', trackId)
    .eq('is_active', true)
    .single();

  if (!track) return notFound();

  // Only embeddable if the track is free (public)
  if (!track.is_free) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#0D0D0D', color: '#999', fontFamily: 'Inter, sans-serif',
        fontSize: '14px', padding: '16px', textAlign: 'center',
      }}>
        This track is subscriber-only. Visit CRWN to listen.
      </div>
    );
  }

  // Get artist info
  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('slug, user_id')
    .eq('id', track.artist_id)
    .single();

  let artistName = 'Unknown Artist';
  if (artist?.user_id) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('id', artist.user_id)
      .single();
    artistName = profile?.display_name || 'Unknown Artist';
  }

  const trackUrl = artist?.slug
    ? `https://thecrwn.app/${artist.slug}/track/${track.id}`
    : `https://thecrwn.app`;

  // The bucket is private: the stored url is a locator, not a link. Entitlement
  // was already settled twice above (tracks_public redacts for the anonymous
  // reader, and the is_free guard refuses paid tracks), so signing here is safe.
  const audioUrl = await signAudioValue(track.audio_url_128);

  return (
    <EmbedPlayer
      title={track.title}
      artistName={artistName}
      albumArtUrl={track.album_art_url}
      audioUrl={audioUrl}
      duration={track.duration}
      trackUrl={trackUrl}
    />
  );
}
