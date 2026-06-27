'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { TierConfig } from '@/types';
import { LiveSession } from '@/types/live';
import { Loader2, Plus, Trash2, X, Radio, Video, Download } from 'lucide-react';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { BroadcasterStudio } from './BroadcasterStudio';

interface LivestreamManagerProps {
  artistId: string;
  artistSlug: string;
  tiers: TierConfig[];
}

const SLOT_OPTIONS = [10, 25, 50, 100, 250, 500];

export function LivestreamManager({ artistId, artistSlug, tiers }: LivestreamManagerProps) {
  const supabase = createBrowserSupabaseClient();
  const { user } = useAuth();

  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [studioSession, setStudioSession] = useState<LiveSession | null>(null);

  // Form state
  const [mode, setMode] = useState<'live' | 'prerecorded'>('live');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [maxSlots, setMaxSlots] = useState(50);
  const [isFree, setIsFree] = useState(false);
  const [selectedTiers, setSelectedTiers] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState('');

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
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
      setIsLoading(false);
    }
  }, [artistId, supabase]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const resetForm = () => {
    setMode('live');
    setVisibility('public');
    setVideoFile(null);
    setTitle('');
    setDescription('');
    setMaxSlots(50);
    setIsFree(false);
    setSelectedTiers([]);
    setScheduledAt('');
    setShowForm(false);
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

  const handleGoLive = async (session: LiveSession) => {
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
          title: 'Live now',
          message: `${session.title} just started`,
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
      const res = await fetch(`/api/live/vod?sessionId=${session.id}`);
      if (!res.ok) throw new Error('vod fetch failed');
      const { url } = await res.json();
      if (url) window.open(url, '_blank'); // external R2 signed URL — not internal nav
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
    if (status === 'ended') return <span className="text-crwn-text-dim">Ended</span>;
    return <span className="text-crwn-gold">Scheduled</span>;
  };

  return (
    <div className="neu-raised rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-crwn-text flex items-center gap-2">
          <Radio className="w-5 h-5 text-crwn-gold" /> Live Sessions
        </h2>
        <button
          onClick={() => setShowForm(true)}
          className="neu-button-accent px-4 py-2 rounded-xl flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Session
        </button>
      </div>

      {showForm && (
        <div className="neu-inset p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-crwn-text font-medium">New Session</h3>
            <button onClick={resetForm} className="text-crwn-text-dim hover:text-crwn-text">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Mode: go live, or upload a pre-recorded video that becomes a downloadable recording */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('live')}
                className={`px-3 py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 ${mode === 'live' ? 'neu-button-accent' : 'neu-button text-crwn-text-dim'}`}
              >
                <Radio className="w-4 h-4" /> Go Live
              </button>
              <button
                type="button"
                onClick={() => setMode('prerecorded')}
                className={`px-3 py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 ${mode === 'prerecorded' ? 'neu-button-accent' : 'neu-button text-crwn-text-dim'}`}
              >
                <Video className="w-4 h-4" /> Upload Video
              </button>
            </div>

            {mode === 'prerecorded' && (
              <>
                <div>
                  <label className="block text-crwn-text-dim text-sm mb-1">Video file *</label>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                    className="neu-inset w-full px-3 py-2 text-crwn-text text-sm focus:outline-none file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-crwn-gold file:text-black file:font-semibold"
                  />
                  {videoFile && <p className="text-crwn-text-dim text-xs mt-1">{videoFile.name} ({(videoFile.size / 1_000_000).toFixed(1)} MB)</p>}
                </div>
                <div>
                  <label className="block text-crwn-text-dim text-sm mb-1">Visibility</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setVisibility('public')}
                      className={`px-3 py-2 rounded-xl text-sm font-semibold ${visibility === 'public' ? 'neu-button-accent' : 'neu-button text-crwn-text-dim'}`}
                    >
                      Public
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibility('private')}
                      className={`px-3 py-2 rounded-xl text-sm font-semibold ${visibility === 'private' ? 'neu-button-accent' : 'neu-button text-crwn-text-dim'}`}
                    >
                      Private
                    </button>
                  </div>
                  <p className="text-crwn-text-dim text-xs mt-1">
                    {visibility === 'public' ? 'Fans can watch (subject to tier access below).' : 'Only you can see it. Use this to hand raw footage to a clipper.'}
                  </p>
                </div>
              </>
            )}

            <div>
              <label className="block text-crwn-text-dim text-sm mb-1">Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Late Night Listening Session"
                className="neu-inset w-full px-3 py-2 text-crwn-text placeholder-crwn-text-secondary focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-crwn-text-dim text-sm mb-1">Description</label>
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
                  <label className="block text-crwn-text-dim text-sm mb-1">Max slots</label>
                  <select
                    value={maxSlots}
                    onChange={(e) => setMaxSlots(parseInt(e.target.value))}
                    className="neu-inset w-full px-3 py-2 text-crwn-text focus:outline-none"
                  >
                    {SLOT_OPTIONS.map(s => <option key={s} value={s}>{s} viewers</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-crwn-text-dim text-sm mb-1">Scheduled for (optional)</label>
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
                    <p className="text-crwn-text-dim text-sm mb-1">Only these tiers can {mode === 'live' ? 'join' : 'watch'}:</p>
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
                  <p className="text-crwn-text-dim text-sm ml-6">Create subscription tiers first to gate access.</p>
                )}
              </div>
            )}

            <button
              onClick={handleCreate}
              disabled={
                !title.trim() ||
                isSaving ||
                (mode === 'prerecorded' && !videoFile) ||
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
                <div className="flex items-center gap-3 mt-1 text-crwn-text-dim text-sm flex-wrap">
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
                      <button
                        onClick={() => handleDownloadVod(session)}
                        disabled={busyId === session.id}
                        className="neu-button px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-1 disabled:opacity-50"
                        title="Download recording"
                      >
                        {busyId === session.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        Recording
                      </button>
                    )}
                  </>
                )}
                {session.source_type !== 'prerecorded' && session.status === 'scheduled' && (
                  <button
                    onClick={() => handleGoLive(session)}
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
                  <button
                    onClick={() => handleDownloadVod(session)}
                    disabled={busyId === session.id}
                    className="neu-button px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-1 disabled:opacity-50"
                    title="Download recording"
                  >
                    {busyId === session.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Recording
                  </button>
                )}
                {session.status === 'ended' && (session.vod_status === 'recording' || session.vod_status === 'processing') && (
                  <span className="text-crwn-text-dim text-sm flex items-center gap-1">
                    <Loader2 className="w-4 h-4 animate-spin" /> Processing recording
                  </span>
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
        <p className="text-crwn-text-dim text-center py-8">No live sessions yet. Create one to broadcast to your fans.</p>
      )}

      {studioSession && (
        <BroadcasterStudio
          sessionId={studioSession.id}
          title={studioSession.title}
          currentUserId={user?.id || ''}
          onClose={() => setStudioSession(null)}
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
