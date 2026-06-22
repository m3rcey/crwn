'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { TierConfig } from '@/types';
import { LiveSession } from '@/types/live';
import { Loader2, Plus, Trash2, X, Radio, Video } from 'lucide-react';
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
      });
      if (error) throw error;
      resetForm();
      loadSessions();
    } catch (err) {
      console.error('Error creating live session:', err);
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
            <h3 className="text-crwn-text font-medium">New Live Session</h3>
            <button onClick={resetForm} className="text-crwn-text-dim hover:text-crwn-text">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
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

            <div>
              <label className="flex items-center gap-2 mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isFree}
                  onChange={(e) => { setIsFree(e.target.checked); if (e.target.checked) setSelectedTiers([]); }}
                  className="w-4 h-4"
                />
                <span className="text-crwn-text">All fans can join free</span>
              </label>
              {!isFree && tiers.length > 0 && (
                <div className="space-y-2 ml-6">
                  <p className="text-crwn-text-dim text-sm mb-1">Only these tiers can join:</p>
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

            <button
              onClick={handleCreate}
              disabled={!title.trim() || isSaving || (!isFree && selectedTiers.length === 0)}
              className="neu-button-accent w-full py-2 rounded-xl font-semibold disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Create Session'}
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
                  {statusBadge(session.status)}
                  <span>•</span>
                  <span>{session.max_slots} slots</span>
                  <span>•</span>
                  <span>{session.is_free ? 'Free for all' : `${session.allowed_tier_ids?.length || 0} tier(s)`}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {session.status === 'scheduled' && (
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
