import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Image from 'next/image';
import Link from 'next/link';
import { Playlist, Track } from '@/types';
import { GatedTrackPlayer } from '@/components/gating';
import { useSubscription } from '@/hooks/useSubscription';
import { Lock } from 'lucide-react';
import { ShareButtons } from '@/components/shared/ShareButtons';

interface PlaylistPageProps {
  params: Promise<{ slug: string; id: string }>;
}

export default async function PlaylistPage({ params }: PlaylistPageProps) {
  const { slug, id: playlistId } = await params;
  const supabase = await createServerSupabaseClient();

  // Fetch artist profile
  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('*, profile:profiles(*)')
    .eq('slug', slug)
    .single();

  if (!artist) {
    notFound();
  }

  // Fetch playlist with tracks
  const { data: playlist, error: playlistError } = await supabase
    .from('playlists')
    .select(`
      *,
      playlist_tracks(
        position,
        track:tracks(*)
      )
    `)
    .eq('id', playlistId)
    .eq('is_artist_playlist', true)
    .eq('is_active', true)
    .single();

  if (playlistError || !playlist) {
    notFound();
  }

  // Order tracks by position
  const tracks = (playlist.playlist_tracks || [])
    .filter((pt: { track: Track | null }) => pt.track)
    .sort((a: { position: number }, b: { position: number }) => a.position - b.position)
    .map((pt: { track: Track }) => pt.track);

  const totalDuration = tracks.reduce((acc: number, t: Track) => acc + (t.duration || 0), 0);
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-crwn-bg">
      {/* Header */}
      <div className="relative h-48 sm:h-64 md:h-80 w-full">
        {playlist.cover_url ? (
          <Image
            src={playlist.cover_url}
            alt={playlist.title}
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-b from-crwn-elevated to-crwn-bg" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-crwn-bg via-transparent to-transparent" />
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 lg:px-8 -mt-16 relative z-10">
        {/* Back button */}
        <Link
          href={`/artist/${slug}`}
          className="inline-flex items-center gap-2 text-crwn-text-secondary hover:text-crwn-text mb-4"
        >
          ← Back to {artist.profile?.display_name || 'Artist'}
        </Link>

        {/* Playlist Info */}
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4 sm:gap-6 mb-8">
          <div className="w-40 h-40 rounded-xl bg-crwn-elevated overflow-hidden flex-shrink-0 shadow-xl">
            {playlist.cover_url ? (
              <Image
                src={playlist.cover_url}
                alt={playlist.title}
                width={160}
                height={160}
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-5xl">
                🎶
              </div>
            )}
          </div>

          <div>
            <p className="text-crwn-text-secondary text-sm uppercase tracking-wide">Playlist</p>
            <h1 className="text-3xl sm:text-4xl font-bold text-crwn-text mt-1">
              {playlist.title}
            </h1>
            {playlist.description && (
              <p className="text-crwn-text-secondary mt-2 max-w-xl">
                {playlist.description}
              </p>
            )}
            <p className="text-crwn-text-secondary mt-2">
              {tracks.length} tracks • {formatDuration(totalDuration)}
            </p>
          </div>
        </div>

        {/* Track List */}
        {tracks.length > 0 ? (
          <div className="space-y-2 mb-8">
            {tracks.map((track: Track, index: number) => (
              <GatedTrackPlayer
                key={track.id}
                track={track}
                artistId={artist.id}
              />
            ))}
          </div>
        ) : (
          <p className="text-crwn-text-secondary mb-8">No tracks in this playlist.</p>
        )}
        {/* Share */}
        <div className="flex justify-center mb-8">
          <ShareButtons
            url={`https://crwn-mauve.vercel.app/artist/${slug}/playlist/${playlistId}`}
            title={`${playlist.title} — ${artist.profile?.display_name || "Artist"}`}
            description={`${tracks.length} tracks on CRWN`}
          />
        </div>
      </div>
    </div>
  );
}
