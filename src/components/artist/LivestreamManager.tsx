'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { TierConfig } from '@/types';
import { LiveSession } from '@/types/live';
import { Loader2, Plus, Trash2, X, Radio, Video, Download, Pencil, Trophy, Inbox, BarChart3, Repeat } from 'lucide-react';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { BroadcasterStudio } from './BroadcasterStudio';
import { LiveGoalsEditor } from './LiveGoalsEditor';
import { EditRecordingModal } from './EditRecordingModal';
import { GoLiveAgreementModal } from '@/components/live/GoLiveAgreementModal';
import { SubmissionReviewPanel } from '@/components/producer/SubmissionReviewPanel';
import { SessionStatsPanel } from '@/components/producer/SessionStatsPanel';
import { validateUpload } from '@/lib/uploadValidation';
import { CalculatorPrefillBanner } from '@/components/lead-magnets/CalculatorPrefillBanner';
import { CalculatorSuggestions } from '@/components/lead-magnets/CalculatorSuggestions';

interface LivestreamManagerProps {
  artistId: string;
  artistSlug: string;
  artistName: string;
  tiers: TierConfig[];
}

export function LivestreamManager({ artistId, artistSlug, artistName, tiers }: LivestreamManagerProps) {
  const supabase = createBrowserSupabaseClient();
  const router = useRouter();
  const { user } = useAuth();

  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [studioSession, setStudioSession] = useState<LiveSession | null>(null);
  const [editingSession, setEditingSession] = useState<LiveSession | null>(null);
  // Tip goals (dark-launched behind admin_settings.live_tips).
  const [goalsSession, setGoalsSession] = useState<LiveSession | null>(null);
  const [tipsEnabled, setTipsEnabled] = useState(false);
  // Executive Producer Sessions (fan submissions + polls), dark-launched.
  const [producerEnabled, setProducerEnabled] = useState(false);
  const [reviewSession, setReviewSession] = useState<LiveSession | null>(null);
  const [statsSession, setStatsSession] = useState<LiveSession | null>(null);
  // Session awaiting Live-Streaming Agreement acceptance before it can go live.
  const [pendingLiveSession, setPendingLiveSession] = useState<LiveSession | null>(null);

  // Form state
  const [mode, setMode] = useState<'live' | 'prerecorded'>('live');
  // Executive Producer Session fields (only offered while the flag is on + mode=live).
  const [acceptsSubmissions, setAcceptsSubmissions] = useState(false);
  const [submissionPrompt, setSubmissionPrompt] = useState('');
  const [submissionDeadline, setSubmissionDeadline] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [maxSlots, setMaxSlots] = useState(50);
  const [isFree, setIsFree] = useState(false);
  const [selectedTiers, setSelectedTiers] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState('');
  // Optional pre-sale ticket price (dollars, as typed). Only meaningful on gated
  // live sessions — a ticket lets non-subscribers buy their way in.
  const [ticketPrice, setTicketPrice] = useState('');

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadSessions = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('live_sessions')
        .select('*')
        .eq('artist_id', artistId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setSessions((data as LiveSession[]) || []);
    } catch (err) {
      console.error('Error loading live sessions:', err);
    } finally {
      if (!opts?.silent) setIsLoading(false);
    }
  }, [artistId, supabase]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Dark-launch flag for tip goals. The route answers `enabled` regardless of
  // whether the session id resolves, so any owned session works as the probe.
  const flagProbeId = sessions[0]?.id;
  useEffect(() => {
    const probeId = flagProbeId;
    if (!probeId) return;
    let cancelled = false;
    fetch(`/api/live/tips?sessionId=${probeId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setTipsEnabled(!!d.enabled); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [flagProbeId]);

  // Producer Sessions dark-launch probe (independent of any session existing).
  useEffect(() => {
    let cancelled = false;
    fetch('/api/producer/flag')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setProducerEnabled(!!d.enabled); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // A recording finalizes on the server (LiveKit egress -> R2 -> webhook), not in
  // this browser. While anything is still processing, quietly re-poll so the row
  // flips to "Download" on its own — the artist can leave this screen entirely.
  const hasProcessing = sessions.some(
    (s) => s.vod_status === 'recording' || s.vod_status === 'processing'
  );
  useEffect(() => {
    if (!hasProcessing) return;
    const id = setInterval(() => loadSessions({ silent: true }), 8000);
    return () => clearInterval(id);
  }, [hasProcessing, loadSessions]);

  // One-shot prefill when routed here straight from the Live Experience / Executive Producer
  // calculator (post-onboarding). Opens the create form pre-filled with the calculator's own
  // numbers, the same way runItAgain does from a past session. lm_prefill=1 also shows the banner.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current || typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    if (q.get('lm_prefill') !== '1') return;
    prefilledRef.current = true;

    setMode('live');
    const t = q.get('lm_title');
    if (t) setTitle(t);
    const tp = q.get('lm_ticket_price');
    if (tp && parseFloat(tp) > 0) {
      // A ticket price only applies to a gated session, so turn gating on.
      setIsFree(false);
      setTicketPrice(tp);
    }
    const slots = parseInt(q.get('lm_max_slots') || '', 10);
    if (Number.isFinite(slots) && slots > 0) setMaxSlots(slots);
    // Submissions are the Executive Producer angle. Write-time still gates this on the producer
    // flag, so setting it optimistically is safe even if the flag is off.
    if (q.get('lm_submissions') === '1') setAcceptsSubmissions(true);
    setShowForm(true);
  }, []);

  const resetForm = () => {
    setMode('live');
    setVisibility('public');
    setVideoFile(null);
    setThumbnailFile(null);
    setTitle('');
    setDescription('');
    setMaxSlots(50);
    setIsFree(false);
    setSelectedTiers([]);
    setScheduledAt('');
    setTicketPrice('');
    setAcceptsSubmissions(false);
    setSubmissionPrompt('');
    setSubmissionDeadline('');
    setShowForm(false);
  };

  // "Run it again": open the create form pre-filled from a past session so an
  // artist can schedule the next one in one tap. This is the recurrence primitive
  // for producer sessions: a live event needs the artist present, so it is
  // assisted repetition, not silent auto-creation. Everything copies EXCEPT the
  // dates (a new session needs a new time) and any uploaded video.
  const runItAgain = (session: LiveSession) => {
    setMode('live');
    setVisibility('public');
    setVideoFile(null);
    setThumbnailFile(null);
    setTitle(session.title);
    setDescription(session.description || '');
    setMaxSlots(session.max_slots || 50);
    setIsFree(session.is_free);
    setSelectedTiers(Array.isArray(session.allowed_tier_ids) ? session.allowed_tier_ids : []);
    setScheduledAt('');
    setTicketPrice(session.price && session.price > 0 ? (session.price / 100).toFixed(2) : '');
    setAcceptsSubmissions(!!session.accepts_submissions);
    setSubmissionPrompt(session.submission_prompt || '');
    setSubmissionDeadline('');
    setShowForm(true);
  };

  // Grab a real still frame from an uploaded video, client-side (no server
  // pipeline). Seeks a beat in so we don't capture a black leader frame.
  const captureVideoFrame = (file: File): Promise<Blob | null> =>
    new Promise((resolve) => {
      try {
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.src = url;
        const done = (blob: Blob | null) => { URL.revokeObjectURL(url); resolve(blob); };
        video.onloadedmetadata = () => {
          const t = Math.min(1, (video.duration || 2) * 0.25);
          video.currentTime = isFinite(t) ? t : 0;
        };
        video.onseeked = () => {
          try {
            const w = video.videoWidth || 1280;
            const h = video.videoHeight || 720;
            const scale = Math.min(1, 1280 / w);
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(w * scale);
            canvas.height = Math.round(h * scale);
            const ctx = canvas.getContext('2d');
            if (!ctx) return done(null);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => done(blob), 'image/jpeg', 0.82);
          } catch { done(null); }
        };
        video.onerror = () => done(null);
      } catch { resolve(null); }
    });

  // Upload a cover image to R2 via a signed PUT. Returns the stored key + public URL.
  const uploadThumbnail = async (blob: Blob, filename: string): Promise<{ key: string; url: string } | null> => {
    try {
      const contentType = blob.type || 'image/jpeg';
      const signRes = await fetch('/api/live/thumbnail-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistId, filename, contentType }),
      });
      if (!signRes.ok) return null;
      const { uploadUrl, key, publicUrl } = await signRes.json();
      const putRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob });
      if (!putRes.ok) return null;
      return { key, url: publicUrl };
    } catch {
      return null;
    }
  };

  const handleCreate = async () => {
    if (!user || !title.trim()) return;
    setIsSaving(true);
    try {
      const roomName = `ls_${crypto.randomUUID()}`;

      if (mode === 'prerecorded') {
        if (!videoFile) return;
        // 1) get a signed upload URL, 2) PUT the file straight to R2.
        const signRes = await fetch('/api/live/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ artistId, filename: videoFile.name, contentType: videoFile.type }),
        });
        if (!signRes.ok) throw new Error('Could not get upload URL');
        const { uploadUrl, key, publicUrl } = await signRes.json();

        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': videoFile.type },
          body: videoFile,
        });
        if (!putRes.ok) throw new Error('Upload failed');

        // 2b) cover image: a custom upload overrides; otherwise auto-grab a real
        // frame from the video. Either way it's best-effort — a failed cover
        // never blocks the upload (the card falls back to a placeholder).
        let vodThumbKey: string | null = null;
        let vodThumbUrl: string | null = null;
        const coverBlob: Blob | null = thumbnailFile || await captureVideoFrame(videoFile);
        if (coverBlob) {
          const coverName = thumbnailFile
            ? thumbnailFile.name
            : `${videoFile.name.replace(/\.[^.]+$/, '')}-cover.jpg`;
          const up = await uploadThumbnail(coverBlob, coverName);
          if (up) { vodThumbKey = up.key; vodThumbUrl = up.url; }
        }

        // 3) create the session — the uploaded file IS the VOD (ready immediately).
        const isPublic = visibility === 'public';
        const { error } = await supabase.from('live_sessions').insert({
          artist_id: artistId,
          title: title.trim(),
          description: description.trim() || null,
          max_slots: maxSlots,
          is_free: isPublic ? isFree : false,
          allowed_tier_ids: isPublic && !isFree ? selectedTiers : [],
          scheduled_at: null,
          status: 'scheduled',
          room_name: roomName,
          source_type: 'prerecorded',
          visibility,
          vod_status: 'ready',
          vod_key: key,
          vod_url: publicUrl,
          vod_size_bytes: videoFile.size,
          vod_thumbnail_key: vodThumbKey,
          vod_thumbnail_url: vodThumbUrl,
        });
        if (error) throw error;
        resetForm();
        loadSessions();
        return;
      }

      // mode === 'live'
      const { error } = await supabase.from('live_sessions').insert({
        artist_id: artistId,
        title: title.trim(),
        description: description.trim() || null,
        max_slots: maxSlots,
        is_free: isFree,
        allowed_tier_ids: isFree ? [] : selectedTiers,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        status: 'scheduled',
        room_name: roomName,
        source_type: 'live',
        // Pre-sale ticket price (cents). Only on gated lives; a ticket buys access
        // for fans who don't hold an allowed tier.
        price: !isFree && ticketPrice && parseFloat(ticketPrice) > 0
          ? Math.round(parseFloat(ticketPrice) * 100)
          : null,
        // Executive Producer Session: fans submit beats/vocals/ideas beforehand.
        // Guarded by the dark-launch flag, so this is only ever true when enabled.
        accepts_submissions: producerEnabled && acceptsSubmissions,
        submission_prompt: producerEnabled && acceptsSubmissions ? (submissionPrompt.trim() || null) : null,
        submission_deadline: producerEnabled && acceptsSubmissions && submissionDeadline
          ? new Date(submissionDeadline).toISOString()
          : null,
      });
      if (error) throw error;
      resetForm();
      loadSessions();
    } catch (err) {
      console.error('Error creating session:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Fires only AFTER the Live-Streaming Agreement modal records acceptance.
  // (The go-live API independently re-checks the persisted acceptance server-side.)
  const proceedGoLive = async (session: LiveSession) => {
    setPendingLiveSession(null);
    setBusyId(session.id);
    try {
      const res = await fetch('/api/live/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, action: 'start' }),
      });
      if (!res.ok) throw new Error('start failed');

      // Notify subscribers (best-effort).
      fetch('/api/notifications/notify-subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artistId,
          type: 'live_session',
          title: `${artistName} is live`,
          message: `${session.title} · Tap to join the live session`,
          link: `/${artistSlug}/live/${session.id}`,
        }),
      }).catch(() => {});

      await loadSessions();
      setStudioSession({ ...session, status: 'live' });
    } catch (err) {
      console.error('Error going live:', err);
    } finally {
      setBusyId(null);
    }
  };

  const handleEnd = async (session: LiveSession) => {
    setBusyId(session.id);
    try {
      const res = await fetch('/api/live/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, action: 'end' }),
      });
      if (!res.ok) throw new Error('end failed');
      await loadSessions();
    } catch (err) {
      console.error('Error ending session:', err);
    } finally {
      setBusyId(null);
    }
  };

  const handleDownloadVod = async (session: LiveSession) => {
    setBusyId(session.id);
    try {
      const res = await fetch(`/api/live/vod?sessionId=${session.id}&download=1`);
      if (!res.ok) throw new Error('vod fetch failed');
      const { url } = await res.json();
      if (url) {
        // URL carries Content-Disposition: attachment, so this saves the file.
        const a = document.createElement('a');
        a.href = url;
        a.rel = 'noopener';
        a.click();
      }
    } catch (err) {
      console.error('Error fetching VOD:', err);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await supabase.from('live_sessions').update({ is_active: false }).eq('id', deletingId);
      loadSessions();
    } catch (err) {
      console.error('Error deleting session:', err);
    } finally {
      setShowDeleteModal(false);
      setDeletingId(null);
    }
  };

  const statusBadge = (status: string) => {
    if (status === 'live') return <span className="text-red-500 font-semibold flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />Live</span>;
    if (status === 'ended') return <span className="text-crwn-text-secondary">Ended</span>;
    return <span className="text-crwn-gold">Scheduled</span>;
  };

  return (
    <div className="neu-raised rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-crwn-text flex items-center gap-2">
          <Radio className="w-5 h-5 text-crwn-gold" /> Live Sessions
        </h2>
        <div className="flex items-center gap-2">
          {/* Markers-only clip workflow: mark moments on a VOD, spin up clip missions. */}
          <button
            onClick={() => router.push('/clip-controls')}
            className="bg-crwn-gold text-crwn-bg text-sm font-semibold px-4 py-2 rounded-full hover:bg-crwn-gold/90 transition-colors"
          >
            🎬 Clip Controls
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="neu-button-accent px-4 py-2 rounded-xl flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Session
          </button>
        </div>
      </div>

      {showForm && (
        <div className="neu-inset p-4 mb-6">
          <CalculatorPrefillBanner />
          <CalculatorSuggestions />
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-crwn-text font-medium">New Session</h3>
            <button onClick={resetForm} className="text-crwn-text-secondary hover:text-crwn-text">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Mode: go live, or upload a pre-recorded video that becomes a downloadable recording */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('live')}
                className={`px-3 py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 ${mode === 'live' ? 'neu-button-accent' : 'neu-button text-crwn-text-secondary'}`}
              >
                <Radio className="w-4 h-4" /> Go Live
              </button>
              <button
                type="button"
                onClick={() => setMode('prerecorded')}
                className={`px-3 py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 ${mode === 'prerecorded' ? 'neu-button-accent' : 'neu-button text-crwn-text-secondary'}`}
              >
                <Video className="w-4 h-4" /> Upload Video
              </button>
            </div>

            {mode === 'prerecorded' && (
              <>
                <div>
                  <label className="block text-crwn-text-secondary text-sm mb-1">Video file *</label>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                    className="neu-inset w-full px-3 py-2 text-crwn-text text-sm focus:outline-none file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-crwn-gold file:text-black file:font-semibold"
                  />
                  {videoFile && <p className="text-crwn-text-secondary text-xs mt-1">{videoFile.name} ({(videoFile.size / 1_000_000).toFixed(1)} MB)</p>}
                </div>
                <div>
                  <label className="block text-crwn-text-secondary text-sm mb-1">Thumbnail (optional)</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      if (f) {
                        const v = validateUpload(f, 'image');
                        if (!v.valid) { console.error(v.error); e.target.value = ''; return; }
                      }
                      setThumbnailFile(f);
                    }}
                    className="neu-inset w-full px-3 py-2 text-crwn-text text-sm focus:outline-none file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-crwn-gold file:text-black file:font-semibold"
                  />
                  <p className="text-crwn-text-secondary text-xs mt-1">
                    {thumbnailFile ? thumbnailFile.name : "Leave blank and we'll grab a frame from your video."}
                  </p>
                </div>
                <div>
                  <label className="block text-crwn-text-secondary text-sm mb-1">Visibility</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setVisibility('public')}
                      className={`px-3 py-2 rounded-xl text-sm font-semibold ${visibility === 'public' ? 'neu-button-accent' : 'neu-button text-crwn-text-secondary'}`}
                    >
                      Public
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibility('private')}
                      className={`px-3 py-2 rounded-xl text-sm font-semibold ${visibility === 'private' ? 'neu-button-accent' : 'neu-button text-crwn-text-secondary'}`}
                    >
                      Private
                    </button>
                  </div>
                  <p className="text-crwn-text-secondary text-xs mt-1">
                    {visibility === 'public' ? 'Fans can watch (subject to tier access below).' : 'Only you can see it. Use this to hand raw footage to a clipper.'}
                  </p>
                </div>
              </>
            )}

            <div>
              <label className="block text-crwn-text-secondary text-sm mb-1">Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Late Night Listening Session"
                className="neu-inset w-full px-3 py-2 text-crwn-text placeholder-crwn-text-secondary focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-crwn-text-secondary text-sm mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Previewing unreleased tracks live..."
                rows={3}
                className="neu-inset w-full px-3 py-2 text-crwn-text placeholder-crwn-text-secondary focus:outline-none resize-none"
              />
            </div>

            {mode === 'live' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-crwn-text-secondary text-sm mb-1">Seats</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={maxSlots}
                    onChange={(e) => {
                      // Free entry: any number of seats. Empty string stays editable;
                      // clamp to >= 1 only once a real value is typed.
                      const n = parseInt(e.target.value, 10);
                      setMaxSlots(Number.isNaN(n) ? 0 : Math.max(1, n));
                    }}
                    placeholder="How many seats?"
                    className="neu-inset w-full px-3 py-2 text-crwn-text placeholder-crwn-text-secondary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-crwn-text-secondary text-sm mb-1">Scheduled for (optional)</label>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="neu-inset w-full px-3 py-2 text-crwn-text focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Tier access: live always; prerecorded only when public (private is owner-only) */}
            {(mode === 'live' || visibility === 'public') && (
              <div>
                <label className="flex items-center gap-2 mb-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isFree}
                    onChange={(e) => { setIsFree(e.target.checked); if (e.target.checked) setSelectedTiers([]); }}
                    className="w-4 h-4"
                  />
                  <span className="text-crwn-text">{mode === 'live' ? 'All fans can join free' : 'All fans can watch free'}</span>
                </label>
                {!isFree && tiers.length > 0 && (
                  <div className="space-y-2 ml-6">
                    <p className="text-crwn-text-secondary text-sm mb-1">Only these tiers can {mode === 'live' ? 'join' : 'watch'}:</p>
                    {tiers.map(tier => (
                      <label key={tier.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedTiers.includes(tier.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedTiers([...selectedTiers, tier.id]);
                            else setSelectedTiers(selectedTiers.filter(id => id !== tier.id));
                          }}
                          className="w-4 h-4"
                        />
                        <span className="text-crwn-text">{tier.name}</span>
                      </label>
                    ))}
                  </div>
                )}
                {!isFree && tiers.length === 0 && (
                  <p className="text-crwn-text-secondary text-sm ml-6">Create subscription tiers first to gate access.</p>
                )}
                {/* Pre-sale ticket: gated lives only. Lets non-subscribers buy in. */}
                {!isFree && mode === 'live' && (
                  <div className="mt-4 ml-6">
                    <label className="block text-crwn-text-secondary text-sm mb-1">
                      Pre-sale ticket price (optional)
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-crwn-text-secondary">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={ticketPrice}
                        onChange={(e) => setTicketPrice(e.target.value)}
                        className="neu-inset w-32 px-3 py-2 text-crwn-text focus:outline-none"
                      />
                    </div>
                    <p className="text-crwn-text-secondary text-xs mt-1">
                      Leave blank for tier-only access. Set a price and fans who
                      aren&apos;t subscribed can buy a ticket to get in.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Executive Producer Session: fan submissions. Live sessions only, and
                only while the dark-launch flag is on. */}
            {producerEnabled && mode === 'live' && (
              <div className="border-t border-crwn-elevated pt-4">
                <label className="flex items-center gap-2 mb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acceptsSubmissions}
                    onChange={(e) => setAcceptsSubmissions(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-crwn-text">Let fans submit beats, vocals, and ideas</span>
                </label>
                {acceptsSubmissions && (
                  <div className="ml-6 space-y-3">
                    <div>
                      <label className="block text-crwn-text-secondary text-sm mb-1">What can they send?</label>
                      <textarea
                        value={submissionPrompt}
                        onChange={(e) => setSubmissionPrompt(e.target.value)}
                        rows={2}
                        placeholder="e.g. Dark trap beats around 140 BPM, or a hook idea for the intro."
                        className="neu-inset w-full px-3 py-2 text-crwn-text placeholder-crwn-text-secondary focus:outline-none resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-crwn-text-secondary text-sm mb-1">Submissions close (optional)</label>
                      <input
                        type="datetime-local"
                        value={submissionDeadline}
                        onChange={(e) => setSubmissionDeadline(e.target.value)}
                        className="neu-inset w-full px-3 py-2 text-crwn-text focus:outline-none"
                      />
                      <p className="text-crwn-text-secondary text-xs mt-1">Leave blank to keep them open until you go live.</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleCreate}
              disabled={
                !title.trim() ||
                isSaving ||
                (mode === 'prerecorded' && !videoFile) ||
                (mode === 'live' && (!maxSlots || maxSlots < 1)) ||
                ((mode === 'live' || visibility === 'public') && !isFree && selectedTiers.length === 0)
              }
              className="neu-button-accent w-full py-2 rounded-xl font-semibold disabled:opacity-50"
            >
              {isSaving
                ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" />{mode === 'prerecorded' ? 'Uploading…' : 'Creating…'}</span>
                : (mode === 'prerecorded' ? 'Upload Video' : 'Create Session')}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
        </div>
      ) : sessions.length > 0 ? (
        <div className="space-y-3">
          {sessions.map(session => (
            <div key={session.id} className="neu-inset p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h4 className="text-crwn-text font-medium truncate">{session.title}</h4>
                <div className="flex items-center gap-3 mt-1 text-crwn-text-secondary text-sm flex-wrap">
                  {session.source_type === 'prerecorded' ? (
                    <>
                      <span className="text-crwn-gold flex items-center gap-1"><Video className="w-3.5 h-3.5" /> Video</span>
                      <span>•</span>
                      <span>{session.visibility === 'private' ? 'Private' : 'Public'}</span>
                      {session.visibility === 'public' && (
                        <>
                          <span>•</span>
                          <span>{session.is_free ? 'Free for all' : `${session.allowed_tier_ids?.length || 0} tier(s)`}</span>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      {statusBadge(session.status)}
                      <span>•</span>
                      <span>{session.max_slots} slots</span>
                      <span>•</span>
                      <span>{session.is_free ? 'Free for all' : `${session.allowed_tier_ids?.length || 0} tier(s)`}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {session.source_type === 'prerecorded' && (
                  <>
                    {session.visibility === 'public' && (
                      <a
                        href={`/${artistSlug}/live/${session.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="neu-button px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-1"
                      >
                        <Video className="w-4 h-4" /> View
                      </a>
                    )}
                    {session.vod_status === 'ready' && (
                      <>
                        <button
                          onClick={() => setEditingSession(session)}
                          className="neu-button px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-1"
                          title="Edit recording"
                        >
                          <Pencil className="w-4 h-4" /> Edit
                        </button>
                        <button
                          onClick={() => handleDownloadVod(session)}
                          disabled={busyId === session.id}
                          className="neu-button px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-1 disabled:opacity-50"
                          title="Download video"
                        >
                          {busyId === session.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                          Download
                        </button>
                      </>
                    )}
                  </>
                )}
                {session.source_type !== 'prerecorded' && session.status === 'scheduled' && (
                  <button
                    onClick={() => setPendingLiveSession(session)}
                    disabled={busyId === session.id}
                    className="neu-button-accent px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-1 disabled:opacity-50"
                  >
                    {busyId === session.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
                    Go Live
                  </button>
                )}
                {session.status === 'live' && (
                  <>
                    <button
                      onClick={() => setStudioSession(session)}
                      className="neu-button px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-1"
                    >
                      <Video className="w-4 h-4" /> Studio
                    </button>
                    <button
                      onClick={() => handleEnd(session)}
                      disabled={busyId === session.id}
                      className="neu-button px-3 py-2 rounded-xl text-sm font-semibold text-crwn-error disabled:opacity-50"
                    >
                      {busyId === session.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'End'}
                    </button>
                  </>
                )}
                {session.status === 'ended' && session.vod_status === 'ready' && (
                  <>
                    <button
                      onClick={() => setEditingSession(session)}
                      className="neu-button px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-1"
                      title="Edit recording"
                    >
                      <Pencil className="w-4 h-4" /> Edit
                    </button>
                    <button
                      onClick={() => handleDownloadVod(session)}
                      disabled={busyId === session.id}
                      className="neu-button px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-1 disabled:opacity-50"
                      title="Download recording"
                    >
                      {busyId === session.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      Download
                    </button>
                  </>
                )}
                {session.status === 'ended' && (session.vod_status === 'recording' || session.vod_status === 'processing') && (
                  <span className="text-crwn-text-secondary text-sm flex items-center gap-1">
                    <Loader2 className="w-4 h-4 animate-spin" /> Processing recording
                  </span>
                )}
                {/* Recording never produced a file — say so instead of showing nothing. */}
                {session.status === 'ended' && session.vod_status === 'failed' && (
                  <span className="text-crwn-error text-sm" title="The recording could not be saved. Check that LiveKit Egress and R2 are configured.">
                    Recording failed
                  </span>
                )}
                {session.status === 'ended' && (!session.vod_status || session.vod_status === 'none') && (
                  <span className="text-crwn-text-secondary text-sm" title="No recording was captured for this session (recording was not enabled or could not start).">
                    Not recorded
                  </span>
                )}
                {/* Tip goals: only for real live sessions, and only once the
                    live_tips flag is on (otherwise fans see no bar to fill). */}
                {tipsEnabled && session.source_type !== 'prerecorded' && session.status !== 'ended' && (
                  <button
                    onClick={() => setGoalsSession(session)}
                    className="neu-button px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-1"
                    title="Tip goals"
                  >
                    <Trophy className="w-4 h-4" /> Goals
                  </button>
                )}
                {/* Review the fan submission queue + per-session stats (Executive
                    Producer Sessions). */}
                {producerEnabled && session.accepts_submissions && (
                  <>
                    <button
                      onClick={() => setReviewSession(session)}
                      className="neu-button px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-1"
                      title="Review submissions"
                    >
                      <Inbox className="w-4 h-4" /> Submissions
                    </button>
                    <button
                      onClick={() => setStatsSession(session)}
                      className="neu-button px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-1"
                      title="Session stats"
                    >
                      <BarChart3 className="w-4 h-4" /> Stats
                    </button>
                    {/* Schedule the next one, pre-filled from this session. */}
                    {session.status === 'ended' && (
                      <button
                        onClick={() => runItAgain(session)}
                        className="neu-button px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-1"
                        title="Schedule the next one with these settings"
                      >
                        <Repeat className="w-4 h-4" /> Run it again
                      </button>
                    )}
                  </>
                )}
                {session.status !== 'live' && (
                  <button
                    onClick={() => { setDeletingId(session.id); setShowDeleteModal(true); }}
                    className="neu-icon-button p-2 text-crwn-error"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-crwn-text-secondary text-center py-8">No live sessions yet. Create one to broadcast to your fans.</p>
      )}

      {studioSession && (
        <BroadcasterStudio
          sessionId={studioSession.id}
          title={studioSession.title}
          currentUserId={user?.id || ''}
          producerControls={producerEnabled && !!studioSession.accepts_submissions}
          onClose={() => setStudioSession(null)}
        />
      )}

      {goalsSession && (
        <LiveGoalsEditor
          sessionId={goalsSession.id}
          artistId={artistId}
          sessionTitle={goalsSession.title}
          onClose={() => setGoalsSession(null)}
        />
      )}

      {reviewSession && (
        <SubmissionReviewPanel
          sessionId={reviewSession.id}
          sessionTitle={reviewSession.title}
          onClose={() => setReviewSession(null)}
        />
      )}

      {statsSession && (
        <SessionStatsPanel
          sessionId={statsSession.id}
          sessionTitle={statsSession.title}
          onClose={() => setStatsSession(null)}
        />
      )}

      {pendingLiveSession && (
        <GoLiveAgreementModal
          artistId={artistId}
          onAccepted={() => proceedGoLive(pendingLiveSession)}
          onCancel={() => setPendingLiveSession(null)}
        />
      )}

      {editingSession && (
        <EditRecordingModal
          session={editingSession}
          artistId={artistId}
          tiers={tiers}
          onClose={() => setEditingSession(null)}
          onSaved={() => { setEditingSession(null); loadSessions(); }}
        />
      )}

      <ConfirmModal
        isOpen={showDeleteModal}
        title="Delete Session"
        message="Delete this live session? This cannot be undone."
        confirmText="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => { setShowDeleteModal(false); setDeletingId(null); }}
      />
    </div>
  );
}
