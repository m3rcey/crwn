import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';

// ─── Spotify helpers ───

function extractSpotifyArtistId(url: string): string | null {
  // Handles: https://open.spotify.com/artist/6eUKZXaKkcviH0Ku9w2n3V
  const match = url.match(/artist\/([a-zA-Z0-9]+)/);
  return match?.[1] || null;
}

let spotifyTokenCache: { token: string; expiresAt: number } | null = null;

async function getSpotifyToken(): Promise<string | null> {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) return null;

  if (spotifyTokenCache && Date.now() < spotifyTokenCache.expiresAt) {
    return spotifyTokenCache.token;
  }

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const data = await res.json();
    if (data.access_token) {
      spotifyTokenCache = {
        token: data.access_token,
        expiresAt: Date.now() + (data.expires_in - 60) * 1000,
      };
      return data.access_token;
    }
  } catch {
    // silent
  }
  return null;
}

async function fetchSpotifyArtist(artistId: string) {
  const token = await getSpotifyToken();
  if (!token) return null;

  try {
    const [artistRes, topTracksRes] = await Promise.all([
      fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      }),
      fetch(`https://api.spotify.com/v1/artists/${artistId}/top-tracks?market=US`, {
        headers: { 'Authorization': `Bearer ${token}` },
      }),
    ]);

    if (!artistRes.ok) return null;

    const artist = await artistRes.json();
    const topTracksData = topTracksRes.ok ? await topTracksRes.json() : { tracks: [] };

    return {
      name: artist.name,
      followers: artist.followers?.total || 0,
      popularity: artist.popularity || 0,
      genres: artist.genres || [],
      imageUrl: artist.images?.[0]?.url || null,
      topTracks: (topTracksData.tracks || []).slice(0, 10).map((t: any) => ({
        name: t.name,
        popularity: t.popularity,
        albumName: t.album?.name || '',
        albumArt: t.album?.images?.[2]?.url || t.album?.images?.[0]?.url || null,
        previewUrl: t.preview_url,
        spotifyUrl: t.external_urls?.spotify || null,
      })),
    };
  } catch {
    return null;
  }
}

// ─── YouTube helpers ───

function extractYouTubeChannelId(url: string): { type: 'id' | 'handle' | 'user'; value: string } | null {
  // https://youtube.com/channel/UCxxxxxx
  const channelMatch = url.match(/channel\/([a-zA-Z0-9_-]+)/);
  if (channelMatch) return { type: 'id', value: channelMatch[1] };

  // https://youtube.com/@handle
  const handleMatch = url.match(/@([a-zA-Z0-9_.-]+)/);
  if (handleMatch) return { type: 'handle', value: handleMatch[1] };

  // https://youtube.com/user/username or https://youtube.com/c/name
  const userMatch = url.match(/(?:user|c)\/([a-zA-Z0-9_-]+)/);
  if (userMatch) return { type: 'user', value: userMatch[1] };

  return null;
}

async function fetchYouTubeChannel(channelInfo: { type: 'id' | 'handle' | 'user'; value: string }) {
  if (!YOUTUBE_API_KEY) return null;

  try {
    // Resolve channel ID
    let channelId = '';
    if (channelInfo.type === 'id') {
      channelId = channelInfo.value;
    } else {
      // Search for channel by handle or username
      const param = channelInfo.type === 'handle' ? `forHandle=@${channelInfo.value}` : `forUsername=${channelInfo.value}`;
      const searchRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=id&${param}&key=${YOUTUBE_API_KEY}`
      );
      const searchData = await searchRes.json();
      channelId = searchData.items?.[0]?.id || '';
      if (!channelId) return null;
    }

    // Get channel stats + recent videos
    const [channelRes, videosRes] = await Promise.all([
      fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${channelId}&key=${YOUTUBE_API_KEY}`
      ),
      fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&maxResults=10&type=video&key=${YOUTUBE_API_KEY}`
      ),
    ]);

    if (!channelRes.ok) return null;
    const channelData = await channelRes.json();
    const channel = channelData.items?.[0];
    if (!channel) return null;

    const stats = channel.statistics;
    const videosData = videosRes.ok ? await videosRes.json() : { items: [] };

    // Get video stats for each video
    const videoIds = (videosData.items || []).map((v: any) => v.id?.videoId).filter(Boolean);
    let videoStats: any[] = [];
    if (videoIds.length > 0) {
      const statsRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet,contentDetails&id=${videoIds.join(',')}&key=${YOUTUBE_API_KEY}`
      );
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        videoStats = statsData.items || [];
      }
    }

    return {
      name: channel.snippet?.title || '',
      subscribers: parseInt(stats.subscriberCount || '0'),
      totalViews: parseInt(stats.viewCount || '0'),
      videoCount: parseInt(stats.videoCount || '0'),
      thumbnailUrl: channel.snippet?.thumbnails?.default?.url || null,
      recentVideos: videoStats.map((v: any) => ({
        title: v.snippet?.title || '',
        videoId: v.id,
        publishedAt: v.snippet?.publishedAt || '',
        views: parseInt(v.statistics?.viewCount || '0'),
        likes: parseInt(v.statistics?.likeCount || '0'),
        comments: parseInt(v.statistics?.commentCount || '0'),
        thumbnailUrl: v.snippet?.thumbnails?.medium?.url || null,
        duration: v.contentDetails?.duration || '',
      })),
    };
  } catch {
    return null;
  }
}

// ─── Main route ───

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const artistId = req.nextUrl.searchParams.get('artistId');
  if (!artistId) return NextResponse.json({ error: 'Missing artistId' }, { status: 400 });

  // Verify ownership
  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id, user_id')
    .eq('id', artistId)
    .eq('user_id', user.id)
    .single();
  if (!artist) return NextResponse.json({ error: 'Not your profile' }, { status: 403 });

  // Get social links from profiles table
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('social_links')
    .eq('id', user.id)
    .single();

  const socialLinks = (profile?.social_links || {}) as Record<string, string>;

  // Fetch Spotify data
  let spotify = null;
  const spotifyUrl = socialLinks.spotify;
  if (spotifyUrl) {
    const spotifyArtistId = extractSpotifyArtistId(spotifyUrl);
    if (spotifyArtistId) {
      spotify = await fetchSpotifyArtist(spotifyArtistId);
    }
  }

  // Fetch YouTube data
  let youtube = null;
  const youtubeUrl = socialLinks.youtube;
  if (youtubeUrl) {
    const channelInfo = extractYouTubeChannelId(youtubeUrl);
    if (channelInfo) {
      youtube = await fetchYouTubeChannel(channelInfo);
    }
  }

  return NextResponse.json({
    spotify,
    youtube,
    connectedPlatforms: {
      spotify: !!spotifyUrl,
      youtube: !!youtubeUrl,
    },
  });
}
