'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Clapperboard,
  ExternalLink,
  Loader2,
  Plus,
  Scissors,
  Trash2,
  Video,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { capClipperRate, resolveClipperRate, type ClipperRateStep } from '@/lib/clipperRate';
import { usePageTour } from '@/hooks/usePageTour';
import { clipControlsTourSteps } from '@/lib/clipControlsTourSteps';
import { TourReplayButton } from '@/components/shared/TourReplayButton';

/**
 * Live Clip Controls (markers-only). The artist marks noteworthy MOMENTS on a
 * recorded session (timestamp + label) and turns a moment into a clip MISSION
 * that points clippers at it. No video is cut here — clippers download the VOD
 * and clip off-platform via the existing clipper rail (?ref= + src=clipper),
 * paid through the artist-wide clip commission.
 */

interface VodSession {
  id: string;
  title: string;
  vod_duration_seconds: number | null;
  created_at: string;
}

interface VodMarker {
  id: string;
  session_id: string;
  label: string;
  start_seconds: number;
  note: string | null;
}

/** Format seconds as mm:ss (or h:mm:ss past the hour). */
function formatTimecode(total: number | null | undefined): string {
  const s = Math.max(0, Math.round(total || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Parse "mm:ss" (also "h:mm:ss" or plain seconds) into seconds. Null = invalid. */
function parseTimecode(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  if (/^\d+$/.test(v)) return parseInt(v, 10);
  let m = v.match(/^(\d+):([0-5]?\d)$/);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  m = v.match(/^(\d+):([0-5]?\d):([0-5]?\d)$/);
  if (m) return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
  return null;
}

export default function ClipControlsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const supabase = createBrowserSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [artistId, setArtistId] = useState<string | null>(null);
  const [currentRate, setCurrentRate] = useState<number>(0);
  const [sessions, setSessions] = useState<VodSession[]>([]);
  const [markers, setMarkers] = useState<VodMarker[]>([]);

  // "Add moment" form — one open at a time, keyed by session.
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [startTime, setStartTime] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null); // preview / mission / delete in flight
  const [missionedMarkers, setMissionedMarkers] = useState<Set<string>>(new Set());

  const loadMarkers = useCallback(
    async (aid: string) => {
      const { data } = await supabase
        .from('vod_markers')
        .select('id, session_id, label, start_seconds, note')
        .eq('artist_id', aid)
        .order('start_seconds', { ascending: true });
      setMarkers((data as VodMarker[]) || []);
    },
    [supabase]
  );

  const load = useCallback(async () => {
    if (!user) return;
    const { data: artist } = await supabase
      .from('artist_profiles')
      .select('id, platform_tier, clipper_commission_rate, clipper_rate_schedule, clipper_campaign_started_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!artist) {
      setArtistId(null);
      setLoading(false);
      return;
    }
    setArtistId(artist.id);

    // The commission clippers ACTUALLY earn right now — the same resolver checkout
    // uses (ramp schedule → standard rate), capped at what's payable after the
    // platform fee so the shown number equals the paid number.
    const rate = resolveClipperRate({
      schedule: (Array.isArray(artist.clipper_rate_schedule) ? artist.clipper_rate_schedule : null) as
        | ClipperRateStep[]
        | null,
      campaignStartedAt: artist.clipper_campaign_started_at ?? null,
      standardRate: artist.clipper_commission_rate ?? 10,
      now: new Date(),
    });
    setCurrentRate(capClipperRate(rate, artist.platform_tier ?? null));

    const [sessionRes] = await Promise.all([
      supabase
        .from('live_sessions')
        .select('id, title, vod_duration_seconds, created_at')
        .eq('artist_id', artist.id)
        .eq('is_active', true)
        .eq('vod_status', 'ready')
        .order('created_at', { ascending: false }),
      loadMarkers(artist.id),
    ]);
    setSessions((sessionRes.data as VodSession[]) || []);
    setLoading(false);
  }, [user, supabase, loadMarkers]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    load();
  }, [authLoading, user, router, load]);

  // First-visit tour + on-demand replay. MUST stay above the early returns
  // below (rules of hooks) — gated by `enabled` so it only fires once the
  // real page content is rendered.
  const { replay } = usePageTour({
    tourId: 'clip-controls',
    steps: clipControlsTourSteps,
    userId: user?.id,
    enabled: !authLoading && !loading && !!artistId,
  });

  // ---- Actions --------------------------------------------------------------

  const openAddForm = (sessionId: string) => {
    setAddingFor(sessionId);
    setLabel('');
    setStartTime('');
    setNote('');
  };

  const addMarker = async (sessionId: string) => {
    if (!artistId || saving) return;
    const seconds = parseTimecode(startTime);
    if (!label.trim()) {
      showToast('Give the moment a short label.', 'error');
      return;
    }
    if (seconds === null) {
      showToast('Start time should look like 4:32 (mm:ss).', 'error');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('vod_markers').insert({
        session_id: sessionId,
        artist_id: artistId,
        label: label.trim(),
        start_seconds: seconds,
        note: note.trim() || null,
      });
      if (error) throw error;
      setAddingFor(null);
      await loadMarkers(artistId);
      showToast('Moment marked.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not save the moment.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteMarker = async (markerId: string) => {
    if (!artistId) return;
    setBusyId(markerId);
    try {
      const { error } = await supabase.from('vod_markers').delete().eq('id', markerId);
      if (error) throw error;
      setMarkers((prev) => prev.filter((m) => m.id !== markerId));
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not delete the moment.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  // Reuses the existing signed-URL VOD flow (/api/live/vod, no download flag =
  // inline playback) — same rail LivestreamManager uses; opens in a new tab.
  const previewVod = async (session: VodSession) => {
    setBusyId(session.id);
    try {
      const res = await fetch(`/api/live/vod?sessionId=${session.id}`);
      if (!res.ok) throw new Error('Could not load the recording.');
      const { url } = await res.json();
      if (url) window.open(url, '_blank', 'noopener'); // external signed URL, not an app route
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not load the recording.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  // A clip mission is just a missions row (type 'clip', target 'live' → this
  // session). Attribution + payout already exist on the clipper rail — nothing
  // money-related is created here.
  const createClipMission = async (session: VodSession, marker: VodMarker) => {
    if (!artistId || busyId) return;
    setBusyId(marker.id);
    try {
      const { error } = await supabase.from('missions').insert({
        artist_id: artistId,
        type: 'clip',
        target_kind: 'live',
        target_id: session.id,
        target_label: `${session.title} — ${marker.label}`,
        goal_count: 5,
        reward_type: 'commission',
        reward_detail: `Clip commission (${currentRate}% now)`,
        audience: 'all',
        title: `Clip: ${marker.label}`,
        description: marker.note,
        cta: 'Clip this moment',
        status: 'active',
      });
      if (error) throw error;
      setMissionedMarkers((prev) => new Set(prev).add(marker.id));
      showToast('Clip mission created', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not create the mission.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  // ---- Render ---------------------------------------------------------------

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-crwn-gold" />
      </div>
    );
  }

  if (!artistId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <p className="text-crwn-text mb-4">Clip Controls are for artists. Publish your artist page first.</p>
        <button
          onClick={() => router.push('/home')}
          className="bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full hover:bg-crwn-gold/90 transition-colors"
        >
          Back to CRWN
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <button
          onClick={() => router.push('/studio')}
          className="inline-flex items-center gap-2 text-sm text-crwn-text-secondary hover:text-crwn-text transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Studio
        </button>

        <div className="flex items-center justify-between gap-3 mb-2" data-tour="clip-controls-header">
          <h1 className="text-3xl font-bold text-crwn-text">Live Clip Controls</h1>
          <TourReplayButton onClick={replay} />
        </div>
        <p className="text-crwn-text-secondary text-sm mb-6">
          Mark the moments worth clipping on your recorded sessions, then point clippers at them with a
          clip mission. Clippers download the recording and cut it themselves.
        </p>

        {/* Current clip commission — the rate the existing clipper rail pays. */}
        <div className="border border-crwn-elevated rounded-2xl px-4 py-4 mb-10 flex flex-wrap items-center justify-between gap-3" data-tour="clip-controls-commission">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
              <Scissors className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-sm text-crwn-text">
                Clippers currently earn <span className="text-green-400 font-semibold">{currentRate}%</span> of the
                subs they bring in
              </p>
              <p className="text-xs text-crwn-text-secondary mt-0.5">Every clip mission pays at this artist-wide rate.</p>
            </div>
          </div>
          <button
            onClick={() => router.push('/profile/artist?tab=referrals')}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-crwn-text-secondary hover:text-crwn-gold transition-colors"
          >
            Manage clip rates
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Sessions — the tour anchor sits on whichever branch renders */}
        {sessions.length === 0 ? (
          <div className="border border-dashed border-crwn-elevated rounded-2xl py-14 px-6 text-center" data-tour="clip-controls-sessions">
            <Video className="w-8 h-8 text-crwn-gold mx-auto mb-3" />
            <p className="text-crwn-text font-medium mb-1">No recordings yet</p>
            <p className="text-sm text-crwn-text-secondary">
              Go live or upload a video in the Livestreams tab. Once a recording is ready it shows up here
              for marking.
            </p>
          </div>
        ) : (
          <div className="space-y-6" data-tour="clip-controls-sessions">
            {sessions.map((session) => {
              const sessionMarkers = markers.filter((m) => m.session_id === session.id);
              const isAdding = addingFor === session.id;
              return (
                <div key={session.id} className="border border-crwn-elevated rounded-2xl p-4 sm:p-5">
                  {/* Session header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-crwn-text truncate">{session.title}</p>
                      <p className="text-xs text-crwn-text-secondary mt-0.5">
                        {formatTimecode(session.vod_duration_seconds)}
                        {' · '}
                        {new Date(session.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => previewVod(session)}
                      disabled={busyId === session.id}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-crwn-text-secondary hover:text-crwn-gold transition-colors disabled:opacity-50"
                    >
                      {busyId === session.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ExternalLink className="w-4 h-4" />
                      )}
                      Preview VOD
                    </button>
                  </div>

                  {/* Markers */}
                  {sessionMarkers.length === 0 && !isAdding && (
                    <p className="text-sm text-crwn-text-secondary border border-dashed border-crwn-elevated rounded-xl px-4 py-4 mb-3">
                      No moments marked yet. Add the first one: the timestamp where something worth
                      clipping happens.
                    </p>
                  )}
                  {sessionMarkers.length > 0 && (
                    <div className="mb-3">
                      {sessionMarkers.map((marker, i) => (
                        <div key={marker.id} className={`py-3 ${i > 0 ? 'border-t border-crwn-elevated' : ''}`}>
                          <div className="flex items-center gap-3">
                            <span className="flex-shrink-0 px-2 py-0.5 rounded-full bg-crwn-gold/10 text-crwn-gold text-xs font-mono font-semibold">
                              {formatTimecode(marker.start_seconds)}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-crwn-text truncate">{marker.label}</p>
                              {marker.note && (
                                <p className="text-xs text-crwn-text-secondary truncate mt-0.5">{marker.note}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {missionedMarkers.has(marker.id) ? (
                                <button
                                  onClick={() => router.push('/missions')}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-green-400 hover:text-green-300 transition-colors"
                                >
                                  Mission created — view
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => createClipMission(session, marker)}
                                  disabled={busyId === marker.id}
                                  className="inline-flex items-center gap-1.5 bg-crwn-gold text-crwn-bg text-xs font-semibold px-3.5 py-1.5 rounded-full hover:bg-crwn-gold/90 transition-colors disabled:opacity-50"
                                >
                                  {busyId === marker.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Scissors className="w-3.5 h-3.5" />
                                  )}
                                  Create clip mission
                                </button>
                              )}
                              <button
                                onClick={() => deleteMarker(marker.id)}
                                disabled={busyId === marker.id}
                                aria-label="Delete moment"
                                className="p-1.5 text-crwn-text-secondary hover:text-red-400 transition-colors disabled:opacity-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add moment */}
                  {isAdding ? (
                    <div className="border border-crwn-elevated rounded-xl p-4 space-y-3">
                      <div className="grid grid-cols-[1fr_auto] gap-3">
                        <input
                          autoFocus
                          maxLength={120}
                          placeholder="What happens here? (e.g. unreleased hook)"
                          value={label}
                          onChange={(e) => setLabel(e.target.value)}
                          className="w-full bg-crwn-surface border border-crwn-elevated rounded-xl px-3 py-2.5 text-sm text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold"
                        />
                        <input
                          placeholder="4:32"
                          inputMode="numeric"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          className="w-24 bg-crwn-surface border border-crwn-elevated rounded-xl px-3 py-2.5 text-sm text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold font-mono"
                        />
                      </div>
                      <input
                        maxLength={300}
                        placeholder="Note for clippers (optional)"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        className="w-full bg-crwn-surface border border-crwn-elevated rounded-xl px-3 py-2.5 text-sm text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold"
                      />
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => addMarker(session.id)}
                          disabled={saving}
                          className="inline-flex items-center gap-1.5 bg-crwn-gold text-crwn-bg text-sm font-semibold px-5 py-2 rounded-full hover:bg-crwn-gold/90 transition-colors disabled:opacity-50"
                        >
                          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                          Save moment
                        </button>
                        <button
                          onClick={() => setAddingFor(null)}
                          disabled={saving}
                          className="text-sm text-crwn-text-secondary hover:text-crwn-text transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => openAddForm(session.id)}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-crwn-gold hover:text-crwn-gold/80 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Add moment
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Honest footer — markers guide clippers; nothing is auto-cut. */}
        <p className="text-xs text-crwn-text-secondary mt-10 flex items-start gap-2">
          <Clapperboard className="w-4 h-4 flex-shrink-0 mt-0.5" />
          Markers don&apos;t cut video. They tell clippers exactly where the good moments are. Clippers
          download the recording, cut the clip themselves, and earn your clip commission on the subs it
          brings in.
        </p>
      </div>
    </div>
  );
}
