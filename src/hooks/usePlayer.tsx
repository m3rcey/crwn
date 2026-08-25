'use client';

import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { Track } from '@/types';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { clientHasDnt } from '@/lib/analytics/doNotTrack';

type RepeatMode = 'off' | 'all' | 'one';

interface PlayerContextType {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  queue: Track[];
  currentIndex: number;
  shuffle: boolean;
  repeat: RepeatMode;
  isExpanded: boolean;
  play: (track: Track, trackList?: Track[]) => void;
  playAll: (tracks: Track[], startIndex?: number) => void;
  pause: () => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  setVolume: (newVolume: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  toggleExpanded: () => void;
  addToQueue: (track: Track) => void;
  playNext: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  resetPlayer: () => void;
  reorderQueue: (startIndex: number, endIndex: number) => void;
  isFavorite: (trackId: string) => boolean;
  toggleFavorite: (trackId: string) => Promise<void>;
  favorites: Set<string>;
  /** True when the database handed this reader a playable audio URL. */
  canPlayTrack: (track: Track) => boolean;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const supabase = createBrowserSupabaseClient();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [queue, setQueueState] = useState<Track[]>([]);
  const [originalQueue, setOriginalQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');
  const [isExpanded, setIsExpanded] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [playStartTime, setPlayStartTime] = useState<number | null>(null);

  // Initialize audio element
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.volume = 0.8;
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Load favorites on user change
  useEffect(() => {
    async function fetchFavorites() {
      if (!user) return;
      const { data } = await supabase
        .from('favorites')
        .select('track_id')
        .eq('user_id', user.id);
      
      if (Array.isArray(data)) {
        setFavorites(new Set(data.map(f => f.track_id)));
      }
    }
    fetchFavorites();
  }, [user?.id, supabase]);

  // Can play track - declared before play
  //
  // The DATABASE decides, not this hook. `tracks_public` NULLs audio_url_* for any
  // reader who is not entitled (free / owner / purchaser / subscribed on an allowed
  // tier), and anon+authenticated hold no grant on those columns of `tracks`. So a
  // missing URL IS the gate, already enforced server-side. The client only reflects
  // it -- it never re-derives entitlement, which is exactly how the old leak worked.
  //
  // This used to `return { canPlay: true }` unconditionally ("access control can be
  // added later"), so any surface calling play() streamed paid tracks in full.
  const canPlayTrack = useCallback((track: Track): boolean => {
    return !!track.audio_url_128;
  }, []);

  // Resolve the <audio> source for a track.
  //
  // The `audio` bucket is private, so the URL stored on the row is a LOCATOR, not
  // a link -- it no longer resolves. /api/tracks/[id]/stream re-reads tracks_public
  // as the caller and, if the view hands back a url, signs it for an hour. The
  // server decides again; this hook never re-derives entitlement.
  //
  // Rapid skipping means several of these can be in flight at once. The monotonic
  // token makes the newest request the only one allowed to touch `src`, so a slow
  // response for a track the listener already skipped past cannot win the race.
  const srcRequestRef = useRef(0);

  const setAudioSource = useCallback(async (track: Track): Promise<boolean> => {
    if (!audioRef.current) return false;
    const token = ++srcRequestRef.current;
    try {
      const res = await fetch(`/api/tracks/${track.id}/stream`, { cache: 'no-store' });
      if (!res.ok) return false;
      const { url } = await res.json();
      // Superseded by a later track, or the element went away while we waited.
      if (token !== srcRequestRef.current || !audioRef.current || !url) return false;
      audioRef.current.src = url;
      return true;
    } catch {
      return false;
    }
  }, []);

  // Log play history - declared before play
  const logPlayHistory = useCallback(async () => {
    if (!user || !currentTrack || !playStartTime) return;
    // Founder devices are never counted (src/lib/analytics/doNotTrack.ts): no play_history
    // row, no play_count increment. Trade-off, accepted: recently-played stops accruing on a
    // marked device, because play_history is also what artist analytics counts plays from.
    if (clientHasDnt()) return;

    const durationPlayed = Math.floor((Date.now() - playStartTime) / 1000);
    const completed = duration >= 30 && durationPlayed >= duration * 0.8;
    await supabase.from('play_history').insert({
      user_id: user.id,
      track_id: currentTrack.id,
      duration_played: durationPlayed,
      completed,
    });
    // Increment play count on completed listen
    if (completed) {
      await supabase.rpc('increment_play_count', { track_id_input: currentTrack.id });
    }
  }, [user, currentTrack, playStartTime, duration, supabase]);

  // Next - declared before handleTrackEnd
  const next = useCallback(() => {
    if (queue.length === 0) return;
    
    let nextIndex: number;
    if (shuffle) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else {
      nextIndex = currentIndex + 1;
      if (nextIndex >= queue.length && repeat === 'all') {
        nextIndex = 0;
      }
    }
    
    // Skip past locked tracks rather than stalling on an empty <audio src>. A queue
    // can legitimately mix free and gated tracks (an album, a playlist), and
    // tracks_public hands back a NULL url for the ones this listener cannot play.
    // Bounded by queue.length so an all-locked queue terminates.
    let scanned = 0;
    while (nextIndex < queue.length && !queue[nextIndex]?.audio_url_128 && scanned < queue.length) {
      nextIndex = repeat === 'all' && nextIndex + 1 >= queue.length ? 0 : nextIndex + 1;
      scanned++;
    }

    if (nextIndex < queue.length && queue[nextIndex]?.audio_url_128) {
      setCurrentIndex(nextIndex);
      // play will be called from handleTrackEnd or UI
      const nextTrack = queue[nextIndex];
      if (nextTrack && audioRef.current) {
        setCurrentTrack(nextTrack);
        setCurrentTime(0);
        setPlayStartTime(Date.now());
        void (async () => {
          if (!(await setAudioSource(nextTrack))) {
            setIsPlaying(false);
            return;
          }
          audioRef.current?.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        })();
      }
    } else {
      setIsPlaying(false);
    }
  }, [queue, currentIndex, shuffle, repeat, setAudioSource]);

  // Handle track end - declared after next
  const handleTrackEnd = useCallback(() => {
    if (repeat === 'one') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
    } else if (currentIndex < queue.length - 1 || repeat === 'all') {
      next();
    } else {
      setIsPlaying(false);
      setCurrentTime(0);
    }
  }, [repeat, currentIndex, queue.length, next]);

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => handleTrackEnd();
    
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [handleTrackEnd]);

  // Play - declared after dependencies
  const play = useCallback(async (track: Track, trackList?: Track[]) => {
    if (!canPlayTrack(track)) {
      // Surfaces that render their own lock (GatedTrackPlayer) never reach here.
      // Explore, Liked Songs, playlists and share pages call play() directly, so
      // without this they would fail silently with an empty <audio src>.
      showToast(
        track.price ? 'Buy this track to listen' : 'Subscribe to listen',
        'info'
      );
      return;
    }

    // If trackList provided, set as queue
    if (trackList && trackList.length > 0) {
      setOriginalQueue(trackList);
      setQueueState(trackList);
      const startIndex = trackList.findIndex(t => t.id === track.id);
      setCurrentIndex(startIndex !== -1 ? startIndex : 0);
    }

    if (currentTrack?.id !== track.id) {
      if (currentTrack && playStartTime) {
        await logPlayHistory();
      }
      
      // Fetch artist info if missing (Option B)
      let trackWithArtist = track;
      if (track.artist_id && !track.artist?.slug) {
        const { data: artistData } = await supabase
          .from('artist_profiles')
          .select('id, slug, user_id, profile:profiles!inner(id, role, display_name, username, avatar_url, bio, social_links, created_at, updated_at)')
          .eq('id', track.artist_id)
          .single();
        
        if (artistData) {
          const profileArray = (artistData.profile || []) as unknown as { id: string; role: string; display_name: string; username: string; avatar_url: string | null; bio: string | null; social_links: Record<string, unknown> | null; created_at: string; updated_at: string }[];
          const profileData = Array.isArray(profileArray) ? profileArray[0] : profileArray;
          
          const artistProfile = {
            id: artistData.id,
            slug: artistData.slug,
            user_id: artistData.user_id,
            is_verified: false,
            banner_url: null,
            tagline: null,
            stripe_connect_id: null,
            tier_config: [],
            created_at: '',
            updated_at: '',
            profile: profileData as any,
          };
          trackWithArtist = {
            ...track,
            artist: artistProfile,
            artist_name: profileData?.display_name || 'Unknown Artist',
          };
        }
      }
      
      setCurrentTrack(trackWithArtist);
      setCurrentTime(0);
      setPlayStartTime(Date.now());

      // Only a NEW track needs a fresh signed url. Resuming the current one keeps
      // the src it already has, so pause/resume costs no round trip.
      if (audioRef.current && !(await setAudioSource(track))) {
        showToast('Could not load this track', 'error');
        setIsPlaying(false);
        return;
      }
    }

    if (audioRef.current) {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (error) {
        console.error('Error playing audio:', error);
      }
    }
  }, [currentTrack, playStartTime, canPlayTrack, logPlayHistory, showToast, setAudioSource]);

  // Play all - plays a list of tracks starting from a specific index
  const playAll = useCallback(async (tracks: Track[], startIndex = 0) => {
    if (!tracks || tracks.length === 0) return;
    
    setOriginalQueue(tracks);
    setQueueState(tracks);
    setCurrentIndex(startIndex);
    
    const track = tracks[startIndex];
    if (track) {
      if (!canPlayTrack(track)) {
        showToast(
          track.price ? 'Buy this track to listen' : 'Subscribe to listen',
          'info'
        );
        return;
      }

      setCurrentTrack(track);
      setCurrentTime(0);
      setPlayStartTime(Date.now());

      if (audioRef.current) {
        if (!(await setAudioSource(track))) {
          showToast('Could not load this track', 'error');
          setIsPlaying(false);
          return;
        }
        audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      }
    }
  }, [canPlayTrack, showToast, setAudioSource]);

  // Pause
  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  // Toggle play
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else if (currentTrack) {
      play(currentTrack);
    }
  }, [isPlaying, currentTrack, pause, play]);

  // Previous - declared after play
  const previous = useCallback(() => {
    if (queue.length === 0) return;
    
    let prevIndex = currentIndex - 1;
    if (prevIndex < 0) {
      if (repeat === 'all') {
        prevIndex = queue.length - 1;
      } else {
        return;
      }
    }
    
    setCurrentIndex(prevIndex);
    const prevTrack = queue[prevIndex];
    if (prevTrack) {
      play(prevTrack);
    }
  }, [queue, currentIndex, repeat, play]);

  // Enrich current track with artist data if missing
  useEffect(() => {
    if (!currentTrack || currentTrack.artist?.slug) return;
    if (!currentTrack.artist_id) return;
    const enrichTrack = async () => {
      const { data: artistData } = await supabase
        .from('artist_profiles')
        .select('id, slug, profile:profiles(display_name)')
        .eq('id', currentTrack.artist_id)
        .single();
      if (artistData) {
        const profile = Array.isArray(artistData.profile) ? artistData.profile[0] : artistData.profile;
        setCurrentTrack(prev => {
          if (!prev || prev.id !== currentTrack?.id) return prev;
          return { ...prev, artist: { ...(prev.artist || {}), id: artistData.id, slug: artistData.slug, profile } as any, artist_name: (profile as any)?.display_name || 'Unknown Artist' } as Track;
        });
      }
    };
    enrichTrack();
  }, [currentTrack?.id, currentTrack?.artist?.slug, currentTrack?.artist_id]);

  // Update media session
  useEffect(() => {
    if ('mediaSession' in navigator && currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist_name || currentTrack.artist?.profile?.display_name || 'Unknown Artist',
        album: '',
        artwork: currentTrack.album_art_url 
          ? [{ src: currentTrack.album_art_url, sizes: '512x512', type: 'image/jpeg' }]
          : undefined,
      });

      navigator.mediaSession.setActionHandler('play', () => play(currentTrack));
      navigator.mediaSession.setActionHandler('pause', pause);
      navigator.mediaSession.setActionHandler('previoustrack', previous);
      navigator.mediaSession.setActionHandler('nexttrack', next);
    }
  }, [currentTrack, play, pause, previous, next]);

  // Seek
  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  // Set volume
  const setVolume = useCallback((newVolume: number) => {
    setVolumeState(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  }, []);

  // Toggle shuffle - shuffles or restores queue
  const toggleShuffle = useCallback(() => {
    setShuffle(prev => {
      const newShuffle = !prev;
      if (newShuffle) {
        // Shuffle the queue, keeping current track at current position
        const currentTrackId = queue[currentIndex]?.id;
        const otherTracks = queue.filter((_, i) => i !== currentIndex);
        // Fisher-Yates shuffle
        for (let i = otherTracks.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [otherTracks[i], otherTracks[j]] = [otherTracks[j], otherTracks[i]];
        }
        // Insert current track back at current position
        const currentTrack = queue[currentIndex];
        const newQueue = [...otherTracks];
        newQueue.splice(currentIndex, 0, currentTrack);
        setQueueState(newQueue);
      } else {
        // Restore original queue order
        setQueueState([...originalQueue]);
        // Find the current track in original queue
        const currentTrackId = currentTrack?.id;
        const originalIndex = originalQueue.findIndex(t => t.id === currentTrackId);
        if (originalIndex !== -1) {
          setCurrentIndex(originalIndex);
        }
      }
      return newShuffle;
    });
  }, [queue, currentIndex, originalQueue, currentTrack]);
  
  const toggleRepeat = useCallback(() => {
    const modes: RepeatMode[] = ['off', 'all', 'one'];
    setRepeat(prev => modes[(modes.indexOf(prev) + 1) % modes.length]);
  }, []);
  
  const toggleExpanded = useCallback(() => setIsExpanded(prev => !prev), []);

  // Queue actions
  const addToQueue = useCallback((track: Track) => {
    setQueueState(prev => [...prev, track]);
  }, []);

  const playNext = useCallback((track: Track) => {
    setQueueState(prev => {
      const newQueue = [...prev];
      newQueue.splice(currentIndex + 1, 0, track);
      return newQueue;
    });
  }, [currentIndex]);

  const removeFromQueue = useCallback((index: number) => {
    setQueueState(prev => prev.filter((_, i) => i !== index));
    if (index < currentIndex) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex]);

  const clearQueue = useCallback(() => {
    setQueueState([]);
    setCurrentIndex(0);
  }, []);

  const resetPlayer = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setCurrentTrack(null);
    setIsPlaying(false);
    setQueueState([]);
    setCurrentIndex(0);
  }, []);

  const reorderQueue = useCallback((startIndex: number, endIndex: number) => {
    setQueueState(prev => {
      const newQueue = [...prev];
      const [removed] = newQueue.splice(startIndex, 1);
      newQueue.splice(endIndex, 0, removed);
      return newQueue;
    });
    
    if (startIndex === currentIndex) {
      setCurrentIndex(endIndex);
    } else if (startIndex < currentIndex && endIndex >= currentIndex) {
      setCurrentIndex(prev => prev - 1);
    } else if (startIndex > currentIndex && endIndex <= currentIndex) {
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex]);

  // Favorites
  const isFavorite = useCallback((trackId: string) => favorites.has(trackId), [favorites]);

  const toggleFavorite = useCallback(async (trackId: string) => {
    if (!user) return;
    
    await supabase.rpc('toggle_favorite', {
      p_user_id: user.id,
      p_track_id: trackId,
    });
    
    setFavorites(prev => {
      const newSet = new Set(prev);
      if (newSet.has(trackId)) {
        newSet.delete(trackId);
      } else {
        newSet.add(trackId);
      }
      return newSet;
    });
  }, [user, supabase]);

  return (
    <PlayerContext.Provider value={{
      currentTrack,
      isPlaying,
      currentTime,
      duration,
      volume,
      queue,
      currentIndex,
      shuffle,
      repeat,
      isExpanded,
      play,
      playAll,
      pause,
      togglePlay,
      next,
      previous,
      seek,
      setVolume,
      toggleShuffle,
      toggleRepeat,
      toggleExpanded,
      addToQueue,
      playNext,
      removeFromQueue,
      clearQueue,
      resetPlayer,
      reorderQueue,
      isFavorite,
      toggleFavorite,
      favorites,
      canPlayTrack,
    }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (context === undefined) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
}
