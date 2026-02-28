'use client';

import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { Track } from '@/types';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';

type RepeatMode = 'off' | 'all' | 'one';

interface PlayerContextType {
  // Current track
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  
  // Queue
  queue: Track[];
  currentIndex: number;
  
  // Playback settings
  shuffle: boolean;
  repeat: RepeatMode;
  
  // Player state
  isExpanded: boolean;
  
  // Actions
  play: (track: Track) => void;
  pause: () => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  toggleExpanded: () => void;
  
  // Queue actions
  addToQueue: (track: Track) => void;
  playNext: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  reorderQueue: (startIndex: number, endIndex: number) => void;
  
  // Favorites
  isFavorite: (trackId: string) => boolean;
  toggleFavorite: (trackId: string) => Promise<void>;
  favorites: Set<string>;
  
  // Gating
  canPlayTrack: (track: Track) => { canPlay: boolean; isPreview: boolean };
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Player state
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
    audioRef.current.volume = volume;
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Load favorites
  useEffect(() => {
    if (user) {
      loadFavorites();
    }
  }, [user]);

  const loadFavorites = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('favorites')
      .select('track_id')
      .eq('user_id', user.id);
    
    if (data) {
      setFavorites(new Set(data.map(f => f.track_id)));
    }
  };

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
  }, [currentTrack, repeat, queue, currentIndex]);

  // Update media session
  useEffect(() => {
    if ('mediaSession' in navigator && currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: 'Artist Name', // TODO: Get from track.artist
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
  }, [currentTrack]);

  const handleTrackEnd = useCallback(() => {
    if (repeat === 'one') {
      // Replay current track
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
  }, [repeat, currentIndex, queue.length]);

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
  }, [user, currentTrack, playStartTime, duration]);

  const canPlayTrack = (track: Track): { canPlay: boolean; isPreview: boolean } => {
    if (track.access_level === 'free') {
      return { canPlay: true, isPreview: false };
    }
    
    // TODO: Check user's subscription status for this artist
    // For now, assume non-free tracks require subscription
    const hasAccess = false; // Replace with actual subscription check
    
    return {
      canPlay: hasAccess,
      isPreview: !hasAccess, // Will play 30-second preview
    };
  };

  const play = async (track: Track) => {
    const { canPlay, isPreview } = canPlayTrack(track);
    
    if (!canPlay && !isPreview) {
      // Show subscription required message
      return;
    }

    if (currentTrack?.id !== track.id) {
      // Log previous track if exists
      if (currentTrack && playStartTime) {
        await logPlayHistory();
      }
      
      setCurrentTrack(track);
      setCurrentTime(0);
      setPlayStartTime(Date.now());
      
      if (audioRef.current) {
        audioRef.current.src = isPreview 
          ? `${track.audio_url_128}#t=0,30` // 30 second preview
          : track.audio_url_128 || '';
      }
    }
    
    if (audioRef.current) {
      await audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const pause = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
      pause();
    } else if (currentTrack) {
      play(currentTrack);
    }
  };

  const next = () => {
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
      play(queue[nextIndex]);
    }
  };

  const previous = () => {
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
    play(queue[prevIndex]);
  };

  const seek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const setVolume = (newVolume: number) => {
    setVolumeState(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  const toggleShuffle = () => setShuffle(!shuffle);
  const toggleRepeat = () => {
    const modes: RepeatMode[] = ['off', 'all', 'one'];
    const currentIndex = modes.indexOf(repeat);
    setRepeat(modes[(currentIndex + 1) % modes.length]);
  };
  const toggleExpanded = () => setIsExpanded(!isExpanded);

  const addToQueue = (track: Track) => {
    setQueue(prev => [...prev, track]);
  };

  const playNext = (track: Track) => {
    setQueue(prev => {
      const newQueue = [...prev];
      newQueue.splice(currentIndex + 1, 0, track);
      return newQueue;
    });
  };

  const removeFromQueue = (index: number) => {
    setQueue(prev => prev.filter((_, i) => i !== index));
    if (index < currentIndex) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const clearQueue = () => {
    setQueue([]);
    setCurrentIndex(0);
  };

  const reorderQueue = (startIndex: number, endIndex: number) => {
    setQueue(prev => {
      const newQueue = [...prev];
      const [removed] = newQueue.splice(startIndex, 1);
      newQueue.splice(endIndex, 0, removed);
      return newQueue;
    });
    
    // Update current index if needed
    if (startIndex === currentIndex) {
      setCurrentIndex(endIndex);
    } else if (startIndex < currentIndex && endIndex >= currentIndex) {
      setCurrentIndex(prev => prev - 1);
    } else if (startIndex > currentIndex && endIndex <= currentIndex) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const isFavorite = (trackId: string) => favorites.has(trackId);

  const toggleFavorite = async (trackId: string) => {
    if (!user) return;
    
    const { data } = await supabase.rpc('toggle_favorite', {
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
  };

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
