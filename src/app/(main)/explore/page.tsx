'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePlayer } from '@/hooks/usePlayer';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import Image from 'next/image';
import Link from 'next/link';
import { Search, Play, Users, Music, TrendingUp, Clock, Loader2 } from 'lucide-react';
import { FadeIn } from '@/components/ui/FadeIn';
import { SkeletonCardGrid } from '@/components/ui/Skeleton';

interface ExploreArtist {
  id: string;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  tagline: string | null;
  subscribers: number;
}

interface ExploreTrack {
  id: string;
  title: string;
  albumArt: string | null;
  album_art_url: string | null;
  audio_url_128: string | null;
  audio_url_320: string | null;
  duration: number;
  playCount: number;
  play_count: number;
  artistName: string;
  artistSlug: string;
  artistId: string;
  artist_id: string;
  isFree: boolean;
  is_free: boolean;
}

export default function ExplorePage() {
  const { user } = useAuth();
  const { play } = usePlayer();
  const [artists, setArtists] = useState<ExploreArtist[]>([]);
  const [newReleases, setNewReleases] = useState<ExploreTrack[]>([]);
  const [popularTracks, setPopularTracks] = useState<ExploreTrack[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchExplore(searchQuery);
    }, searchQuery ? 300 : 0);

    return () => clearTimeout(debounce);
  }, [searchQuery]);

  async function fetchExplore(q: string) {
    setIsLoading(true);
    const res = await fetch(`/api/explore${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    const data = await res.json();
    setArtists(data.artists || []);
    setNewReleases(data.newReleases || []);
    setPopularTracks(data.popularTracks || []);
    setIsLoading(false);
  }

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-5xl mx-auto page-fade-in">
      <h1 className="text-2xl font-bold text-crwn-text mb-6">Explore</h1>

      {/* Search */}
      <div className="neu-inset flex items-center gap-3 px-4 py-3 mb-8">
        <Search className="w-5 h-5 text-crwn-text-secondary" />
        <input
          type="text"
          placeholder="Search artists..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 bg-transparent text-crwn-text placeholder-crwn-text-secondary focus:outline-none"
        />
      </div>

      {isLoading ? (
        <div className="space-y-10 py-4">
          <div>
            <div className="h-6 bg-crwn-elevated rounded w-32 mb-4 animate-pulse" />
            <SkeletonCardGrid count={4} />
          </div>
          <div>
            <div className="h-6 bg-crwn-elevated rounded w-40 mb-4 animate-pulse" />
            <SkeletonCardGrid count={4} />
          </div>
        </div>
      ) : (
        <FadeIn><div className="space-y-10 stagger-fade-in">
          {/* Artists */}
          {artists.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-crwn-text mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-crwn-gold" />
                {searchQuery ? 'Results' : 'Artists'}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {artists.map(artist => (
                  <Link
                    key={artist.id}
                    href={`/artist/${artist.slug}`}
                    className="overflow-hidden hover:scale-[1.02] transition-transform press-scale"
                  >
                    <div className="aspect-square relative bg-crwn-elevated rounded-xl">
                      {artist.avatarUrl ? (
                        <Image src={artist.avatarUrl} alt={artist.displayName} fill className="object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl text-crwn-text-secondary">
                          🎤
                        </div>
                      )}
                    </div>
                    <div className="pt-2">
                      <p className="text-sm font-semibold text-crwn-text truncate">{artist.displayName}</p>
                      {artist.tagline && (
                        <p className="text-xs text-crwn-text-secondary truncate mt-0.5">{artist.tagline}</p>
                      )}

                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* New Releases */}
          {!searchQuery && newReleases.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-crwn-text mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-crwn-gold" />
                New Releases
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {newReleases.map(track => (
                  <div
                    key={track.id}
                    className="overflow-hidden cursor-pointer hover:scale-[1.02] transition-transform press-scale"
                    onClick={() => play(track as any, newReleases as any)}
                  >
                    <div className="aspect-square relative bg-crwn-elevated rounded-xl">
                      {track.albumArt ? (
                        <Image src={track.albumArt} alt={track.title} fill className="object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl">🎵</div>
                      )}
                      <div className="absolute inset-0 bg-black/0 hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
                        <Play className="w-10 h-10 text-white" fill="white" />
                      </div>
                    </div>
                    <div className="pt-2">
                      <p className="text-sm font-medium text-crwn-text truncate">{track.title}</p>
                      <Link
                        href={`/artist/${track.artistSlug}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-crwn-text-secondary hover:text-crwn-gold truncate block"
                      >
                        {track.artistName}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Popular Tracks */}
          {!searchQuery && popularTracks.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-crwn-text mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-crwn-gold" />
                Popular
              </h2>
              <div>
                {popularTracks.map((track, i) => (
                  <div
                    key={track.id}
                    onClick={() => play(track as any, popularTracks as any)}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-crwn-elevated/30 transition-colors ${
                      i < popularTracks.length - 1 ? 'border-b border-crwn-elevated' : ''
                    }`}
                  >
                    <span className="text-crwn-text-secondary text-xs w-5 text-right">{i + 1}</span>
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 relative bg-crwn-elevated">
                      {track.albumArt ? (
                        <Image src={track.albumArt} alt={track.title} fill className="object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music className="w-4 h-4 text-crwn-text-secondary" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-crwn-text truncate">{track.title}</p>
                      <Link
                        href={`/artist/${track.artistSlug}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-crwn-text-secondary hover:text-crwn-gold truncate block"
                      >
                        {track.artistName}
                      </Link>
                    </div>
                    <span className="text-xs text-crwn-text-secondary">{formatDuration(track.duration)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {artists.length === 0 && newReleases.length === 0 && (
            <div className="neu-raised rounded-xl p-8 text-center">
              <Music className="w-12 h-12 text-crwn-gold/30 mx-auto mb-3" />
              <p className="text-crwn-text font-medium">
                {searchQuery ? 'No artists found' : 'No content yet'}
              </p>
              <p className="text-sm text-crwn-text-secondary mt-1">
                {searchQuery ? 'Try a different search' : 'Be the first artist on CRWN!'}
              </p>
            </div>
          )}
        </div></FadeIn>
      )}
    </div>
  );
}
