'use client';

import { useState, useEffect } from 'react';
import { Loader2, ExternalLink, Music, Youtube, Users, Eye, ThumbsUp, MessageSquare, TrendingUp, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';

interface SpotifyData {
  name: string;
  followers: number;
  popularity: number;
  genres: string[];
  imageUrl: string | null;
  topTracks: {
    name: string;
    popularity: number;
    albumName: string;
    albumArt: string | null;
    previewUrl: string | null;
    spotifyUrl: string | null;
  }[];
}

interface YouTubeData {
  name: string;
  subscribers: number;
  totalViews: number;
  videoCount: number;
  thumbnailUrl: string | null;
  recentVideos: {
    title: string;
    videoId: string;
    publishedAt: string;
    views: number;
    likes: number;
    comments: number;
    thumbnailUrl: string | null;
    duration: string;
  }[];
}

interface StreamingAnalyticsProps {
  artistId: string;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function PopularityBar({ value }: { value: number }) {
  const color = value >= 70 ? '#1DB954' : value >= 40 ? '#D4AF37' : '#666';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-[#242424] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs text-crwn-text-secondary w-8 text-right">{value}</span>
    </div>
  );
}

export function StreamingAnalytics({ artistId }: StreamingAnalyticsProps) {
  const [spotify, setSpotify] = useState<SpotifyData | null>(null);
  const [youtube, setYoutube] = useState<YouTubeData | null>(null);
  const [connectedPlatforms, setConnectedPlatforms] = useState({ spotify: false, youtube: false });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/analytics/streaming?artistId=${artistId}`);
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        setSpotify(data.spotify);
        setYoutube(data.youtube);
        setConnectedPlatforms(data.connectedPlatforms);
      } catch {
        setError('Failed to load streaming data');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [artistId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-crwn-gold" />
      </div>
    );
  }

  const noPlatforms = !connectedPlatforms.spotify && !connectedPlatforms.youtube;

  if (noPlatforms) {
    return (
      <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-12 text-center">
        <Music className="w-10 h-10 text-crwn-text-secondary mx-auto mb-3" />
        <p className="text-crwn-text font-medium mb-1">Connect your streaming platforms</p>
        <p className="text-sm text-crwn-text-secondary mb-4">
          Add your Spotify and YouTube links in your Profile tab to see streaming analytics here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-crwn-text">Streaming Analytics</h2>
        <p className="text-sm text-crwn-text-secondary mt-0.5">
          Live data from your connected platforms
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <span className="text-sm text-red-400">{error}</span>
        </div>
      )}

      {/* ─── Spotify Section ─── */}
      {connectedPlatforms.spotify && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-[#1DB954] flex items-center justify-center">
              <Music className="w-3 h-3 text-white" />
            </div>
            <h3 className="text-sm font-semibold text-crwn-text">Spotify</h3>
          </div>

          {spotify ? (
            <>
              {/* Stats Row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="w-4 h-4 text-[#1DB954]" />
                    <span className="text-xs text-crwn-text-secondary">Followers</span>
                  </div>
                  <p className="text-xl font-bold text-crwn-text">{formatNumber(spotify.followers)}</p>
                </div>
                <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-[#1DB954]" />
                    <span className="text-xs text-crwn-text-secondary">Popularity</span>
                  </div>
                  <p className="text-xl font-bold text-crwn-text">{spotify.popularity}/100</p>
                  <PopularityBar value={spotify.popularity} />
                </div>
                {spotify.genres.length > 0 && (
                  <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-4 col-span-2 sm:col-span-1">
                    <span className="text-xs text-crwn-text-secondary block mb-1">Genres</span>
                    <div className="flex flex-wrap gap-1">
                      {spotify.genres.slice(0, 3).map(g => (
                        <span key={g} className="px-2 py-0.5 rounded-full text-xs bg-[#1DB954]/10 text-[#1DB954]">
                          {g}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Top Tracks */}
              {spotify.topTracks.length > 0 && (
                <div className="bg-crwn-card rounded-xl border border-crwn-elevated overflow-hidden">
                  <div className="px-4 py-3 border-b border-crwn-elevated">
                    <h4 className="text-sm font-medium text-crwn-text">Top Tracks (by popularity)</h4>
                  </div>

                  {/* Bar chart */}
                  <div className="px-4 pt-4 pb-2">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={spotify.topTracks.map(t => ({ name: t.name.length > 20 ? t.name.slice(0, 20) + '...' : t.name, popularity: t.popularity }))} layout="vertical" margin={{ left: 10, right: 20 }}>
                        <XAxis type="number" domain={[0, 100]} tick={{ fill: '#666', fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" width={140} tick={{ fill: '#A0A0A0', fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ background: '#1A1A1A', border: '1px solid #333', borderRadius: 8 }}
                          labelStyle={{ color: '#fff' }}
                          itemStyle={{ color: '#1DB954' }}
                        />
                        <Bar dataKey="popularity" radius={[0, 4, 4, 0]}>
                          {spotify.topTracks.map((_, i) => (
                            <Cell key={i} fill={i === 0 ? '#1DB954' : '#1DB954' + (90 - i * 8).toString(16).padStart(2, '0')} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Track list */}
                  <div className="divide-y divide-crwn-elevated/50">
                    {spotify.topTracks.map((track, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="text-xs text-crwn-text-secondary w-5 text-right">{i + 1}</span>
                        {track.albumArt && (
                          <img src={track.albumArt} alt="" className="w-8 h-8 rounded object-cover" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-crwn-text truncate">{track.name}</p>
                          <p className="text-xs text-crwn-text-secondary truncate">{track.albumName}</p>
                        </div>
                        <PopularityBar value={track.popularity} />
                        {track.spotifyUrl && (
                          <a href={track.spotifyUrl} target="_blank" rel="noopener" className="text-crwn-text-secondary hover:text-[#1DB954] transition-colors">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-6 text-center">
              <p className="text-sm text-crwn-text-secondary">
                Could not fetch Spotify data. Make sure your Spotify artist link is correct in your Profile.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ─── YouTube Section ─── */}
      {connectedPlatforms.youtube && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-[#FF0000] flex items-center justify-center">
              <Youtube className="w-3 h-3 text-white" />
            </div>
            <h3 className="text-sm font-semibold text-crwn-text">YouTube</h3>
          </div>

          {youtube ? (
            <>
              {/* Stats Row */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="w-4 h-4 text-[#FF0000]" />
                    <span className="text-xs text-crwn-text-secondary">Subscribers</span>
                  </div>
                  <p className="text-xl font-bold text-crwn-text">{formatNumber(youtube.subscribers)}</p>
                </div>
                <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Eye className="w-4 h-4 text-[#FF0000]" />
                    <span className="text-xs text-crwn-text-secondary">Total Views</span>
                  </div>
                  <p className="text-xl font-bold text-crwn-text">{formatNumber(youtube.totalViews)}</p>
                </div>
                <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Music className="w-4 h-4 text-[#FF0000]" />
                    <span className="text-xs text-crwn-text-secondary">Videos</span>
                  </div>
                  <p className="text-xl font-bold text-crwn-text">{youtube.videoCount}</p>
                </div>
              </div>

              {/* Recent Videos */}
              {youtube.recentVideos.length > 0 && (
                <div className="bg-crwn-card rounded-xl border border-crwn-elevated overflow-hidden">
                  <div className="px-4 py-3 border-b border-crwn-elevated">
                    <h4 className="text-sm font-medium text-crwn-text">Recent Videos</h4>
                  </div>
                  <div className="divide-y divide-crwn-elevated/50">
                    {youtube.recentVideos.map((video) => (
                      <a
                        key={video.videoId}
                        href={`https://youtube.com/watch?v=${video.videoId}`}
                        target="_blank"
                        rel="noopener"
                        className="flex items-start gap-3 px-4 py-3 hover:bg-crwn-elevated/30 transition-colors"
                      >
                        {video.thumbnailUrl && (
                          <img
                            src={video.thumbnailUrl}
                            alt=""
                            className="w-28 h-16 rounded-lg object-cover shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-crwn-text font-medium line-clamp-2">{video.title}</p>
                          <p className="text-xs text-crwn-text-secondary mt-1">
                            {new Date(video.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className="flex items-center gap-1 text-xs text-crwn-text-secondary">
                              <Eye className="w-3 h-3" /> {formatNumber(video.views)}
                            </span>
                            <span className="flex items-center gap-1 text-xs text-crwn-text-secondary">
                              <ThumbsUp className="w-3 h-3" /> {formatNumber(video.likes)}
                            </span>
                            <span className="flex items-center gap-1 text-xs text-crwn-text-secondary">
                              <MessageSquare className="w-3 h-3" /> {formatNumber(video.comments)}
                            </span>
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-6 text-center">
              <p className="text-sm text-crwn-text-secondary">
                Could not fetch YouTube data. Make sure your YouTube channel link is correct in your Profile.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Data source note */}
      <p className="text-xs text-crwn-text-secondary text-center">
        Data pulled live from Spotify Web API and YouTube Data API. Popularity scores are relative (0-100), not stream counts.
        For detailed stream analytics, check your distributor dashboard.
      </p>
    </div>
  );
}
