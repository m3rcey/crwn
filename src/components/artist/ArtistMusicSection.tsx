'use client';

// The Music tab of an artist's public page, laid out like a streaming artist page (founder,
// 2026-09-30): the newest release, Top Songs in swipeable columns of four, then Albums, Singles
// and Playlists as horizontal rows. The shape is decided in src/lib/artistMusicLayout.ts (pure,
// tested); this file only renders it.
//
// Every song row is GatedTrackPlayer, the same row the page used before, so gating, preview,
// purchases and the player queue behave exactly as they did. Nothing here decides access.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Album, Playlist, Track } from '@/types';
import { GatedTrackPlayer } from '@/components/gating';
import {
  latestRelease,
  rankTopSongs,
  releaseDateLabel,
  releaseYear,
  standaloneTracks,
  toColumns,
} from '@/lib/artistMusicLayout';

interface ArtistMusicSectionProps {
  artistId: string;
  artistSlug: string;
  /** In the artist's running order (orderTracksForDisplay). */
  tracks: Track[];
  albums: (Album & { track_count: number })[];
  playlists: (Playlist & { track_count: number })[];
  albumTrackIds: string[];
}

// A horizontal row that swipes on a phone and never shows a scrollbar.
const ROW = 'flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 scroll-px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

function Cover({ src, alt, className }: { src: string | null | undefined; alt: string; className: string }) {
  return (
    <div className={`relative bg-crwn-elevated overflow-hidden ${className}`}>
      {src ? (
        <Image src={src} alt={alt} fill className="object-cover" sizes="(max-width: 768px) 45vw, 200px" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-3xl">🎵</div>
      )}
    </div>
  );
}

const songs = (n: number) => `${n} ${n === 1 ? 'song' : 'songs'}`;

function ExplicitBadge() {
  return (
    <span className="text-[10px] font-bold leading-none px-1 py-0.5 rounded bg-crwn-text-secondary/30 text-crwn-text-secondary flex-shrink-0" title="Explicit">
      E
    </span>
  );
}

export function ArtistMusicSection({ artistId, artistSlug, tracks, albums, playlists, albumTrackIds }: ArtistMusicSectionProps) {
  const [showAll, setShowAll] = useState(false);
  const onAlbum = useMemo(() => new Set(albumTrackIds), [albumTrackIds]);
  const latest = useMemo(() => latestRelease(albums, tracks, onAlbum), [albums, tracks, onAlbum]);
  const topSongs = useMemo(() => rankTopSongs(tracks), [tracks]);
  const columns = useMemo(() => toColumns(topSongs), [topSongs]);
  const singles = useMemo(() => standaloneTracks(tracks, onAlbum), [tracks, onAlbum]);
  // Top Songs already shows the whole catalog when it is this small.
  const hasMore = tracks.length > topSongs.length;

  return (
    <div className="space-y-8 mb-8">
      {latest && (
        <section aria-label="Latest release">
          <Link
            href={latest.kind === 'album' ? `/${artistSlug}/album/${latest.album.id}` : `/${artistSlug}/track/${latest.track.id}`}
            className="flex items-center gap-4 press-scale"
          >
            <Cover
              src={latest.kind === 'album' ? latest.album.album_art_url : latest.track.album_art_url}
              alt={latest.kind === 'album' ? latest.album.title : latest.track.title}
              className="w-28 h-28 md:w-36 md:h-36 rounded-lg flex-shrink-0"
            />
            <div className="min-w-0">
              {releaseDateLabel(latest.date) && (
                <p className="text-xs font-medium tracking-wide text-crwn-text-secondary">{releaseDateLabel(latest.date)}</p>
              )}
              <div className="flex items-center gap-2 mt-0.5">
                <h2 className="text-lg font-semibold text-crwn-text truncate">
                  {latest.kind === 'album' ? latest.album.title : `${latest.track.title} - Single`}
                </h2>
                {latest.kind === 'single' && latest.track.explicit && <ExplicitBadge />}
              </div>
              <p className="text-sm text-crwn-text-secondary">
                {latest.kind === 'album' ? songs(latest.album.track_count) : songs(1)}
              </p>
            </div>
          </Link>
        </section>
      )}

      {topSongs.length > 0 && (
        <section aria-label="Top Songs">
          {hasMore ? (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className="flex items-center gap-1 mb-3 text-xl font-semibold text-crwn-text hover:text-crwn-gold transition-colors"
            >
              {showAll ? 'All Songs' : 'Top Songs'}
              {showAll ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
            </button>
          ) : (
            <h2 className="mb-3 text-xl font-semibold text-crwn-text">Top Songs</h2>
          )}

          {showAll ? (
            <div>
              {tracks.map((track) => (
                <GatedTrackPlayer key={track.id} track={track} artistId={artistId} artistSlug={artistSlug} trackList={tracks} />
              ))}
            </div>
          ) : (
            <div className={ROW}>
              {columns.map((column, i) => (
                <div
                  key={i}
                  className={`snap-start flex-shrink-0 ${columns.length > 1 ? 'w-[88%] md:w-[46%]' : 'w-full'}`}
                >
                  {column.map((track) => (
                    <GatedTrackPlayer key={track.id} track={track} artistId={artistId} artistSlug={artistSlug} trackList={topSongs} compact />
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {albums.length > 0 && (
        <section aria-label="Albums">
          <h2 className="mb-3 text-xl font-semibold text-crwn-text">Albums</h2>
          <div className={ROW}>
            {albums.map((album) => (
              <Link key={album.id} href={`/${artistSlug}/album/${album.id}`} className="snap-start flex-shrink-0 w-[44%] md:w-48 press-scale">
                <Cover src={album.album_art_url} alt={album.title} className="aspect-square rounded-xl" />
                <p className="font-medium text-crwn-text text-sm mt-2 truncate">{album.title}</p>
                {releaseYear(album.release_date) && (
                  <p className="text-xs text-crwn-text-secondary">{releaseYear(album.release_date)}</p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {singles.length > 0 && albums.length > 0 && (
        <section aria-label="Singles">
          <h2 className="mb-3 text-xl font-semibold text-crwn-text">Singles</h2>
          <div className={ROW}>
            {singles.map((track) => (
              <Link key={track.id} href={`/${artistSlug}/track/${track.id}`} className="snap-start flex-shrink-0 w-[44%] md:w-48 press-scale">
                <Cover src={track.album_art_url} alt={track.title} className="aspect-square rounded-xl" />
                <div className="flex items-center gap-1.5 mt-2">
                  <p className="font-medium text-crwn-text text-sm truncate">{track.title}</p>
                  {track.explicit && <ExplicitBadge />}
                </div>
                {releaseYear(track.release_date) && (
                  <p className="text-xs text-crwn-text-secondary">{releaseYear(track.release_date)}</p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {playlists.length > 0 && (
        <section aria-label="Playlists">
          <h2 className="mb-3 text-xl font-semibold text-crwn-text">Playlists</h2>
          <div className={ROW}>
            {playlists.map((playlist) => (
              <Link key={playlist.id} href={`/${artistSlug}/playlist/${playlist.id}`} className="snap-start flex-shrink-0 w-[44%] md:w-48 press-scale">
                <Cover src={playlist.cover_url} alt={playlist.title} className="aspect-square rounded-xl" />
                <p className="font-medium text-crwn-text text-sm mt-2 truncate">{playlist.title}</p>
                <p className="text-xs text-crwn-text-secondary">{songs(playlist.track_count)}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
