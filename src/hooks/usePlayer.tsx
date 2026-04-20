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
  glideEnabled: boolean;
  isGliding: boolean;
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
  toggleGlide: () => void;
  addToQueue: (track: Track) => void;
  playNext: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  resetPlayer: () => void;
  reorderQueue: (startIndex: number, endIndex: number) => void;
  isFavorite: (trackId: string) => boolean;
  toggleFavorite: (trackId: string) => Promise<void>;
  favorites: Set<string>;
  canPlayTrack: (track: Track) => { canPlay: boolean; isPreview: boolean };
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

const GLIDE_DURATION = 17;
const GLIDE_STORAGE_KEY = 'crwn-glide-enabled';
const FLANGER_WET = 0.16;
const FLANGER_DELAY_BASE = 0.003;
const FLANGER_DEPTH = 0.002;
const FLANGER_LFO_HZ = 0.25;
const FLANGER_FEEDBACK = 0.3;

interface Deck {
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  dryGain: GainNode;
  delay: DelayNode;
  feedback: GainNode;
  wetGain: GainNode;
  merger: GainNode;
  filter: BiquadFilterNode;
  masterGain: GainNode;
  lfo: OscillatorNode;
  lfoDepth: GainNode;
}

function createDeck(ctx: AudioContext, audio: HTMLAudioElement): Deck {
  audio.crossOrigin = 'anonymous';
  audio.volume = 1;
  const source = ctx.createMediaElementSource(audio);
  const dryGain = ctx.createGain();
  const delay = ctx.createDelay(1);
  const feedback = ctx.createGain();
  const wetGain = ctx.createGain();
  const merger = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const masterGain = ctx.createGain();
  const lfo = ctx.createOscillator();
  const lfoDepth = ctx.createGain();

  dryGain.gain.value = 1;
  wetGain.gain.value = 0;
  delay.delayTime.value = FLANGER_DELAY_BASE;
  feedback.gain.value = FLANGER_FEEDBACK;
  filter.type = 'lowpass';
  filter.frequency.value = 20000;
  filter.Q.value = 0.707;
  masterGain.gain.value = 0.8;
  lfo.frequency.value = FLANGER_LFO_HZ;
  lfoDepth.gain.value = FLANGER_DEPTH;

  source.connect(dryGain).connect(merger);
  source.connect(delay);
  delay.connect(wetGain).connect(merger);
  delay.connect(feedback).connect(delay);
  merger.connect(filter).connect(masterGain).connect(ctx.destination);
  lfo.connect(lfoDepth).connect(delay.delayTime);
  lfo.start();

  return { audio, source, dryGain, delay, feedback, wetGain, merger, filter, masterGain, lfo, lfoDepth };
}

function resetDeckEffects(deck: Deck, ctx: AudioContext, volume: number) {
  const t = ctx.currentTime;
  deck.masterGain.gain.cancelScheduledValues(t);
  deck.filter.frequency.cancelScheduledValues(t);
  deck.wetGain.gain.cancelScheduledValues(t);
  deck.masterGain.gain.setValueAtTime(volume, t);
  deck.filter.frequency.setValueAtTime(20000, t);
  deck.wetGain.gain.setValueAtTime(0, t);
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();

  // Two decks — A and B. activeDeckKey tells us which one is currently playing.
  const audioARef = useRef<HTMLAudioElement | null>(null);
  const audioBRef = useRef<HTMLAudioElement | null>(null);
  const deckARef = useRef<Deck | null>(null);
  const deckBRef = useRef<Deck | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeDeckKeyRef = useRef<'A' | 'B'>('A');
  const glideInFlightRef = useRef(false);
  const preloadedStandbyTrackIdRef = useRef<string | null>(null);

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
  const [glideEnabled, setGlideEnabled] = useState(true);
  const [isGliding, setIsGliding] = useState(false);

  // Keep latest state in refs so Glide logic sees fresh values without re-binding listeners.
  const volumeRef = useRef(volume);
  const glideEnabledRef = useRef(glideEnabled);
  const repeatRef = useRef(repeat);
  const queueRef = useRef<Track[]>(queue);
  const currentIndexRef = useRef(currentIndex);
  const shuffleRef = useRef(shuffle);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { glideEnabledRef.current = glideEnabled; }, [glideEnabled]);
  useEffect(() => { repeatRef.current = repeat; }, [repeat]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);

  // Initialize audio elements (two of them). AudioContext is lazy-created on first play().
  useEffect(() => {
    audioARef.current = new Audio();
    audioBRef.current = new Audio();
    audioARef.current.preload = 'auto';
    audioBRef.current.preload = 'auto';
    // Read stored Glide preference
    try {
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem(GLIDE_STORAGE_KEY) : null;
      if (stored === 'false') setGlideEnabled(false);
    } catch {
      // ignore
    }
    return () => {
      audioARef.current?.pause();
      audioBRef.current?.pause();
      audioARef.current = null;
      audioBRef.current = null;
    };
  }, []);

  const getActiveDeck = useCallback((): Deck | null => {
    return activeDeckKeyRef.current === 'A' ? deckARef.current : deckBRef.current;
  }, []);
  const getStandbyDeck = useCallback((): Deck | null => {
    return activeDeckKeyRef.current === 'A' ? deckBRef.current : deckARef.current;
  }, []);
  const getActiveAudio = useCallback((): HTMLAudioElement | null => {
    return activeDeckKeyRef.current === 'A' ? audioARef.current : audioBRef.current;
  }, []);
  const getStandbyAudio = useCallback((): HTMLAudioElement | null => {
    return activeDeckKeyRef.current === 'A' ? audioBRef.current : audioARef.current;
  }, []);

  // Lazy-create AudioContext + decks on first user-gesture play
  const ensureAudioGraph = useCallback(async () => {
    if (!audioARef.current || !audioBRef.current) return null;
    if (!audioContextRef.current) {
      const Ctor: typeof AudioContext =
        (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!;
      const ctx = new Ctor();
      audioContextRef.current = ctx;
      deckARef.current = createDeck(ctx, audioARef.current);
      deckBRef.current = createDeck(ctx, audioBRef.current);
      deckARef.current.masterGain.gain.value = volumeRef.current;
      deckBRef.current.masterGain.gain.value = 0;
    }
    if (audioContextRef.current.state === 'suspended') {
      try { await audioContextRef.current.resume(); } catch { /* ignore */ }
    }
    return audioContextRef.current;
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const canPlayTrack = useCallback((_track: Track): { canPlay: boolean; isPreview: boolean } => {
    return { canPlay: true, isPreview: false };
  }, []);

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
    if (completed) {
      await supabase.rpc('increment_play_count', { track_id_input: currentTrack.id });
    }
  }, [user, currentTrack, playStartTime, duration, supabase]);

  // Compute the index of the next track given current state
  const computeNextIndex = useCallback((): number | null => {
    const q = queueRef.current;
    if (q.length === 0) return null;
    if (shuffleRef.current) {
      if (q.length === 1) return null;
      // Pick a random index that isn't the current one
      let idx = Math.floor(Math.random() * q.length);
      if (idx === currentIndexRef.current) idx = (idx + 1) % q.length;
      return idx;
    }
    const next = currentIndexRef.current + 1;
    if (next >= q.length) {
      return repeatRef.current === 'all' ? 0 : null;
    }
    return next;
  }, []);

  // Preload the next queued track into the standby deck so Glide can start it instantly.
  const preloadStandby = useCallback(() => {
    const standby = getStandbyAudio();
    if (!standby) return;
    const idx = computeNextIndex();
    if (idx == null) {
      preloadedStandbyTrackIdRef.current = null;
      standby.removeAttribute('src');
      standby.load();
      return;
    }
    const next = queueRef.current[idx];
    if (!next || !next.audio_url_128) {
      preloadedStandbyTrackIdRef.current = null;
      return;
    }
    if (preloadedStandbyTrackIdRef.current === next.id) return;
    preloadedStandbyTrackIdRef.current = next.id;
    try {
      standby.src = next.audio_url_128;
      standby.load();
    } catch {
      // ignore
    }
  }, [computeNextIndex, getStandbyAudio]);

  // Start a Glide transition from active → standby deck using the precomputed next track.
  const startGlide = useCallback(async () => {
    if (glideInFlightRef.current) return;
    const ctx = audioContextRef.current;
    const active = getActiveDeck();
    const standby = getStandbyDeck();
    const activeAudio = getActiveAudio();
    const standbyAudio = getStandbyAudio();
    if (!ctx || !active || !standby || !activeAudio || !standbyAudio) return;
    const nextIdx = computeNextIndex();
    if (nextIdx == null) return;
    const nextTrack = queueRef.current[nextIdx];
    if (!nextTrack) return;

    // Ensure standby is loaded with the right track (fallback: load inline if stale)
    if (preloadedStandbyTrackIdRef.current !== nextTrack.id && nextTrack.audio_url_128) {
      standbyAudio.src = nextTrack.audio_url_128;
      standbyAudio.load();
      preloadedStandbyTrackIdRef.current = nextTrack.id;
    }

    glideInFlightRef.current = true;
    setIsGliding(true);

    const t0 = ctx.currentTime;
    const t1 = t0 + GLIDE_DURATION;
    const vol = volumeRef.current;

    // Outgoing: filter sweep DOWN, volume fade OUT, flanger wet UP
    active.filter.frequency.cancelScheduledValues(t0);
    active.masterGain.gain.cancelScheduledValues(t0);
    active.wetGain.gain.cancelScheduledValues(t0);
    active.filter.frequency.setValueAtTime(Math.max(20, active.filter.frequency.value), t0);
    active.masterGain.gain.setValueAtTime(Math.max(0.0001, vol), t0);
    active.wetGain.gain.setValueAtTime(0, t0);
    active.filter.frequency.exponentialRampToValueAtTime(200, t1);
    active.masterGain.gain.linearRampToValueAtTime(0, t1);
    active.wetGain.gain.linearRampToValueAtTime(FLANGER_WET, t0 + 0.5);

    // Incoming: start low, filter sweep UP, volume fade IN, flanger wet UP then OUT
    standby.filter.frequency.cancelScheduledValues(t0);
    standby.masterGain.gain.cancelScheduledValues(t0);
    standby.wetGain.gain.cancelScheduledValues(t0);
    standby.filter.frequency.setValueAtTime(200, t0);
    standby.masterGain.gain.setValueAtTime(0, t0);
    standby.wetGain.gain.setValueAtTime(0, t0);
    standby.filter.frequency.exponentialRampToValueAtTime(20000, t1);
    standby.masterGain.gain.linearRampToValueAtTime(vol, t1);
    standby.wetGain.gain.linearRampToValueAtTime(FLANGER_WET, t0 + 0.5);
    // After glide completes, ramp incoming wet back down to 0 (clean playback)
    standby.wetGain.gain.linearRampToValueAtTime(0, t1 + 0.4);

    // Start the incoming audio
    try { standbyAudio.currentTime = 0; } catch { /* iOS may throw before metadata */ }
    try {
      await standbyAudio.play();
    } catch (err) {
      // If standby can't play, abort glide and fall back
      console.warn('Glide: standby failed to play, falling back', err);
      glideInFlightRef.current = false;
      setIsGliding(false);
      resetDeckEffects(active, ctx, vol);
      resetDeckEffects(standby, ctx, vol);
      return;
    }

    // Swap UI/state to the incoming track immediately (progress follows new active deck)
    setCurrentTrack(nextTrack);
    setCurrentIndex(nextIdx);
    setCurrentTime(0);
    setDuration(Number.isFinite(standbyAudio.duration) ? standbyAudio.duration : 0);
    setPlayStartTime(Date.now());

    const glideMs = GLIDE_DURATION * 1000;
    setTimeout(() => {
      // Finalize: pause old deck audio, reset its effect chain, swap active/standby refs
      try {
        activeAudio.pause();
        activeAudio.currentTime = 0;
      } catch { /* ignore */ }
      resetDeckEffects(active, ctx, vol);
      // Ensure incoming deck lands at clean defaults (wet=0, filter=20000, masterGain=volume)
      resetDeckEffects(standby, ctx, vol);
      activeDeckKeyRef.current = activeDeckKeyRef.current === 'A' ? 'B' : 'A';
      glideInFlightRef.current = false;
      setIsGliding(false);
      // Preload the track AFTER the newly active one
      preloadStandby();
    }, glideMs + 500);
  }, [computeNextIndex, getActiveAudio, getActiveDeck, getStandbyAudio, getStandbyDeck, preloadStandby]);

  // Manual next — no Glide. Standard swap/play.
  const next = useCallback(() => {
    const q = queueRef.current;
    if (q.length === 0) return;

    // If we're mid-glide, just let it run — the user tapping "next" during a glide
    // would be disruptive. Treat it as ignored for simplicity.
    if (glideInFlightRef.current) return;

    const nextIdx = computeNextIndex();
    if (nextIdx == null) return;

    const ctx = audioContextRef.current;
    const active = getActiveDeck();
    const activeAudio = getActiveAudio();
    if (!activeAudio) return;
    const nextTrack = q[nextIdx];
    if (!nextTrack) return;

    setCurrentIndex(nextIdx);
    setCurrentTrack(nextTrack);
    setCurrentTime(0);
    setPlayStartTime(Date.now());

    if (ctx && active) resetDeckEffects(active, ctx, volumeRef.current);
    activeAudio.src = nextTrack.audio_url_128 || '';
    activeAudio.play().then(() => setIsPlaying(true)).catch(() => {});
    // Re-preload standby (queue window shifted)
    setTimeout(() => preloadStandby(), 0);
  }, [computeNextIndex, getActiveAudio, getActiveDeck, preloadStandby]);

  // Natural track end handler — decides between Glide, next, or stop.
  const handleTrackEnd = useCallback(() => {
    if (glideInFlightRef.current) return; // Glide already swapped state via its own timer
    if (repeatRef.current === 'one') {
      const a = getActiveAudio();
      if (a) {
        a.currentTime = 0;
        a.play().catch(() => {});
      }
      return;
    }
    const nextIdx = computeNextIndex();
    if (nextIdx == null) {
      setIsPlaying(false);
      setCurrentTime(0);
      return;
    }
    // If we reached here and Glide didn't fire (user seeked past glide window, or preload failed),
    // just do a normal next.
    next();
  }, [computeNextIndex, getActiveAudio, next]);

  // Audio event handlers — bound to both decks. Only the *active* deck drives UI state.
  useEffect(() => {
    const bind = (audio: HTMLAudioElement | null, key: 'A' | 'B') => {
      if (!audio) return () => {};
      const handleTimeUpdate = () => {
        if (activeDeckKeyRef.current !== key) return;
        setCurrentTime(audio.currentTime);
        const dur = audio.duration;
        if (!glideEnabledRef.current) return;
        if (glideInFlightRef.current) return;
        if (!Number.isFinite(dur) || dur <= 0) return;
        if (repeatRef.current === 'one') return;
        const remaining = dur - audio.currentTime;
        if (remaining > 0 && remaining <= GLIDE_DURATION) {
          const nextIdx = computeNextIndex();
          if (nextIdx != null) {
            startGlide();
          }
        }
      };
      const handleLoadedMetadata = () => {
        if (activeDeckKeyRef.current !== key) return;
        setDuration(audio.duration);
      };
      const handleEnded = () => {
        if (activeDeckKeyRef.current !== key) return;
        handleTrackEnd();
      };
      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.addEventListener('ended', handleEnded);
      return () => {
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio.removeEventListener('ended', handleEnded);
      };
    };
    const cleanA = bind(audioARef.current, 'A');
    const cleanB = bind(audioBRef.current, 'B');
    return () => { cleanA(); cleanB(); };
  }, [handleTrackEnd, computeNextIndex, startGlide]);

  // Play — user-gesture entry point. Lazily creates AudioContext + graphs.
  const play = useCallback(async (track: Track, trackList?: Track[]) => {
    const { canPlay, isPreview } = canPlayTrack(track);
    if (!canPlay && !isPreview) return;

    await ensureAudioGraph();

    if (trackList && trackList.length > 0) {
      setOriginalQueue(trackList);
      setQueueState(trackList);
      const startIndex = trackList.findIndex(t => t.id === track.id);
      setCurrentIndex(startIndex !== -1 ? startIndex : 0);
    }

    const activeAudio = getActiveAudio();
    const activeDeck = getActiveDeck();
    const ctx = audioContextRef.current;

    if (currentTrack?.id !== track.id) {
      if (currentTrack && playStartTime) {
        await logPlayHistory();
      }

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
            profile: profileData as unknown,
          };
          trackWithArtist = {
            ...track,
            artist: artistProfile as Track['artist'],
            artist_name: profileData?.display_name || 'Unknown Artist',
          };
        }
      }

      setCurrentTrack(trackWithArtist);
      setCurrentTime(0);
      setPlayStartTime(Date.now());

      if (activeAudio) {
        if (ctx && activeDeck) resetDeckEffects(activeDeck, ctx, volumeRef.current);
        const audioSrc = isPreview ? `${track.audio_url_128}#t=0,30` : (track.audio_url_128 || '');
        activeAudio.src = audioSrc;
      }
    }

    if (activeAudio) {
      try {
        await activeAudio.play();
        setIsPlaying(true);
        // Preload the next track onto the standby deck so Glide can start instantly
        setTimeout(() => preloadStandby(), 0);
      } catch (error) {
        console.error('Error playing audio:', error);
      }
    }
  }, [currentTrack, playStartTime, canPlayTrack, logPlayHistory, supabase, ensureAudioGraph, getActiveAudio, getActiveDeck, preloadStandby]);

  const playAll = useCallback(async (tracks: Track[], startIndex = 0) => {
    if (!tracks || tracks.length === 0) return;
    setOriginalQueue(tracks);
    setQueueState(tracks);
    setCurrentIndex(startIndex);
    const track = tracks[startIndex];
    if (track) {
      await play(track);
    }
  }, [play]);

  const pause = useCallback(() => {
    const activeAudio = getActiveAudio();
    const standbyAudio = getStandbyAudio();
    if (activeAudio) activeAudio.pause();
    // If gliding, pause both so nothing keeps playing under the hood.
    if (glideInFlightRef.current && standbyAudio) standbyAudio.pause();
    setIsPlaying(false);
  }, [getActiveAudio, getStandbyAudio]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else if (currentTrack) {
      play(currentTrack);
    }
  }, [isPlaying, currentTrack, pause, play]);

  const previous = useCallback(() => {
    const q = queueRef.current;
    if (q.length === 0) return;
    if (glideInFlightRef.current) return;
    let prevIndex = currentIndexRef.current - 1;
    if (prevIndex < 0) {
      if (repeatRef.current === 'all') prevIndex = q.length - 1;
      else return;
    }
    const prevTrack = q[prevIndex];
    if (prevTrack) play(prevTrack);
  }, [play]);

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
          return { ...prev, artist: { ...(prev.artist || {}), id: artistData.id, slug: artistData.slug, profile } as Track['artist'], artist_name: (profile as { display_name?: string } | undefined)?.display_name || 'Unknown Artist' } as Track;
        });
      }
    };
    enrichTrack();
  }, [currentTrack?.id, currentTrack?.artist?.slug, currentTrack?.artist_id, supabase, currentTrack]);

  // Media session — always bound to the active deck via our control handlers.
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

  const seek = useCallback((time: number) => {
    const activeAudio = getActiveAudio();
    if (activeAudio) {
      activeAudio.currentTime = time;
      setCurrentTime(time);
    }
  }, [getActiveAudio]);

  const setVolume = useCallback((newVolume: number) => {
    setVolumeState(newVolume);
    // Apply volume via GainNode of the active deck (iOS-friendly).
    const ctx = audioContextRef.current;
    const active = getActiveDeck();
    if (ctx && active && !glideInFlightRef.current) {
      active.masterGain.gain.setValueAtTime(newVolume, ctx.currentTime);
    }
  }, [getActiveDeck]);

  const toggleShuffle = useCallback(() => {
    setShuffle(prev => {
      const newShuffle = !prev;
      if (newShuffle) {
        const otherTracks = queue.filter((_, i) => i !== currentIndex);
        for (let i = otherTracks.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [otherTracks[i], otherTracks[j]] = [otherTracks[j], otherTracks[i]];
        }
        const currentT = queue[currentIndex];
        const newQueue = [...otherTracks];
        newQueue.splice(currentIndex, 0, currentT);
        setQueueState(newQueue);
      } else {
        setQueueState([...originalQueue]);
        const currentTrackId = currentTrack?.id;
        const originalIndex = originalQueue.findIndex(t => t.id === currentTrackId);
        if (originalIndex !== -1) setCurrentIndex(originalIndex);
      }
      return newShuffle;
    });
    // Queue window shifted — refresh preload on next tick
    setTimeout(() => preloadStandby(), 0);
  }, [queue, currentIndex, originalQueue, currentTrack, preloadStandby]);

  const toggleRepeat = useCallback(() => {
    const modes: RepeatMode[] = ['off', 'all', 'one'];
    setRepeat(prev => modes[(modes.indexOf(prev) + 1) % modes.length]);
  }, []);

  const toggleExpanded = useCallback(() => setIsExpanded(prev => !prev), []);

  const toggleGlide = useCallback(() => {
    setGlideEnabled(prev => {
      const next = !prev;
      try { window.localStorage.setItem(GLIDE_STORAGE_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const addToQueue = useCallback((track: Track) => {
    setQueueState(prev => [...prev, track]);
    setTimeout(() => preloadStandby(), 0);
  }, [preloadStandby]);

  const playNext = useCallback((track: Track) => {
    setQueueState(prev => {
      const newQueue = [...prev];
      newQueue.splice(currentIndex + 1, 0, track);
      return newQueue;
    });
    setTimeout(() => preloadStandby(), 0);
  }, [currentIndex, preloadStandby]);

  const removeFromQueue = useCallback((index: number) => {
    setQueueState(prev => prev.filter((_, i) => i !== index));
    if (index < currentIndex) setCurrentIndex(prev => prev - 1);
    setTimeout(() => preloadStandby(), 0);
  }, [currentIndex, preloadStandby]);

  const clearQueue = useCallback(() => {
    setQueueState([]);
    setCurrentIndex(0);
  }, []);

  const resetPlayer = useCallback(() => {
    const a = audioARef.current;
    const b = audioBRef.current;
    if (a) { a.pause(); a.src = ''; }
    if (b) { b.pause(); b.src = ''; }
    setCurrentTrack(null);
    setIsPlaying(false);
    setQueueState([]);
    setCurrentIndex(0);
    preloadedStandbyTrackIdRef.current = null;
  }, []);

  const reorderQueue = useCallback((startIndex: number, endIndex: number) => {
    setQueueState(prev => {
      const newQueue = [...prev];
      const [removed] = newQueue.splice(startIndex, 1);
      newQueue.splice(endIndex, 0, removed);
      return newQueue;
    });
    if (startIndex === currentIndex) setCurrentIndex(endIndex);
    else if (startIndex < currentIndex && endIndex >= currentIndex) setCurrentIndex(prev => prev - 1);
    else if (startIndex > currentIndex && endIndex <= currentIndex) setCurrentIndex(prev => prev + 1);
    setTimeout(() => preloadStandby(), 0);
  }, [currentIndex, preloadStandby]);

  const isFavorite = useCallback((trackId: string) => favorites.has(trackId), [favorites]);

  const toggleFavorite = useCallback(async (trackId: string) => {
    if (!user) return;
    await supabase.rpc('toggle_favorite', { p_user_id: user.id, p_track_id: trackId });
    setFavorites(prev => {
      const newSet = new Set(prev);
      if (newSet.has(trackId)) newSet.delete(trackId);
      else newSet.add(trackId);
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
      glideEnabled,
      isGliding,
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
      toggleGlide,
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
