import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import { EmbedPlayer } from './EmbedPlayer';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Props {
  params: Promise<{ trackId: string }>;
}

export default async function EmbedTrackPage({ params }: Props) {
  const { trackId } = await params;

  const { data: track } = await supabaseAdmin
    .from('tracks')
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

  return (
    <EmbedPlayer
      title={track.title}
      artistName={artistName}
      albumArtUrl={track.album_art_url}
      audioUrl={track.audio_url_128}
      duration={track.duration}
      trackUrl={trackUrl}
    />
  );
}
