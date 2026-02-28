'use client';

import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { Track } from '@/types';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';

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
  play: (track: Track) => void;
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
  reorderQueue: (startIndex: number, endIndex: number) => void;
  isFavorite: (trackId: string) => boolean;
  toggleFavorite: (trackId: string) => Promise<void>;
  favorites: Set<string>;
  canPlayTrack: (track: Track) => { canPlay: boolean; isPreview: boolean };
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [queue, setQueue] = useState<Track[]>([]);
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
  }, [user, supabase]);

  // Can play track - declared before play
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const canPlayTrack = useCallback((_track: Track): { canPlay: boolean; isPreview: boolean } => {
    // For now, allow all tracks to be played (access control can be added later)
    return { canPlay: true, isPreview: false };
  }, []);

  // Log play history - declared before play
  const logPlayHistory = useCallback(async () => {
    if (!user || !currentTrack || !playStartTime) return;
    
    const durationPlayed = Math.floor((Date.now() - playStartTime) / 1000);
    const completed = duration >= 30 && durationPlayed >= duration * 0.8;
    
    await supabase.from('play_history').insert({
      user_id: user.id,
      track_id: currentTrack.id,
      duration_played: durationPlayed,
      completed,
    });
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
    
    if (nextIndex < queue.length) {
      setCurrentIndex(nextIndex);
      // play will be called from handleTrackEnd or UI
      const nextTrack = queue[nextIndex];
      if (nextTrack && audioRef.current) {
        setCurrentTrack(nextTrack);
        setCurrentTime(0);
        setPlayStartTime(Date.now());
        audioRef.current.src = nextTrack.audio_url_128 || '';
        audioRef.current.play().then(() => setIsPlaying(true));
      }
    }
  }, [queue, currentIndex, shuffle, repeat]);

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
  const play = useCallback(async (track: Track) => {
    const { canPlay, isPreview } = canPlayTrack(track);
    
    if (!canPlay && !isPreview) {
      console.log('Track cannot be played:', track);
      return;
    }

    console.log('Playing track:', track.title, 'URL:', track.audio_url_128);

    if (currentTrack?.id !== track.id) {
      if (currentTrack && playStartTime) {
        await logPlayHistory();
      }
      
      setCurrentTrack(track);
      setCurrentTime(0);
      setPlayStartTime(Date.now());
      
      if (audioRef.current) {
        const audioSrc = isPreview 
          ? `${track.audio_url_128}#t=0,30`
          : track.audio_url_128 || '';
        console.log('Setting audio src:', audioSrc);
        audioRef.current.src = audioSrc;
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
  }, [currentTrack, playStartTime, canPlayTrack, logPlayHistory]);

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

  // Update media session
  useEffect(() => {
    if ('mediaSession' in navigator && currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: 'Artist Name',
        album: 'Album Name',
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

  // Toggle functions
  const toggleShuffle = useCallback(() => setShuffle(prev => !prev), []);
  
  const toggleRepeat = useCallback(() => {
    const modes: RepeatMode[] = ['off', 'all', 'one'];
    setRepeat(prev => modes[(modes.indexOf(prev) + 1) % modes.length]);
  }, []);
  
  const toggleExpanded = useCallback(() => setIsExpanded(prev => !prev), []);

  // Queue actions
  const addToQueue = useCallback((track: Track) => {
    setQueue(prev => [...prev, track]);
  }, []);

  const playNext = useCallback((track: Track) => {
    setQueue(prev => {
      const newQueue = [...prev];
      newQueue.splice(currentIndex + 1, 0, track);
      return newQueue;
    });
  }, [currentIndex]);

  const removeFromQueue = useCallback((index: number) => {
    setQueue(prev => prev.filter((_, i) => i !== index));
    if (index < currentIndex) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex]);

  const clearQueue = useCallback(() => {
    setQueue([]);
    setCurrentIndex(0);
  }, []);

  const reorderQueue = useCallback((startIndex: number, endIndex: number) => {
    setQueue(prev => {
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
