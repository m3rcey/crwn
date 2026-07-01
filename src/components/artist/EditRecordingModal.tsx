'use client';

import { useState, useEffect, useRef } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { TierConfig } from '@/types';
import { LiveSession } from '@/types/live';
import { validateUpload } from '@/lib/uploadValidation';
import { Loader2, X, Camera, Upload, Check } from 'lucide-react';

interface EditRecordingModalProps {
  session: LiveSession;
  artistId: string;
  tiers: TierConfig[];
  onClose: () => void;
  onSaved: () => void;
}

export function EditRecordingModal({ session, artistId, tiers, onClose, onSaved }: EditRecordingModalProps) {
  const supabase = createBrowserSupabaseClient();
  const isPrerecorded = session.source_type === 'prerecorded';

  const [title, setTitle] = useState(session.title);
  const [description, setDescription] = useState(session.description || '');
  const [visibility, setVisibility] = useState<'public' | 'private'>(session.visibility || 'public');
  const [isFree, setIsFree] = useState(session.is_free);
  const [selectedTiers, setSelectedTiers] = useState<string[]>(
    Array.isArray(session.allowed_tier_ids) ? session.allowed_tier_ids : []
  );

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [thumbBlob, setThumbBlob] = useState<Blob | null>(null); // new cover, not yet saved
  const [thumbPreview, setThumbPreview] = useState<string | null>(
    session.vod_thumbnail_url ? `/api/live/thumbnail?sessionId=${session.id}` : null
  );
  const [thumbNote, setThumbNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null); // CORS player — plays and exports frames

  // Fetch the access-gated signed URL for both playback and capture.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/live/vod?sessionId=${session.id}`);
        if (!res.ok) throw new Error('vod fetch failed');
        const { url } = await res.json();
        if (alive) setVideoUrl(url || null);
      } catch {
        if (alive) setError('Could not load the video.');
      } finally {
        if (alive) setLoadingVideo(false);
      }
    })();
    return () => { alive = false; };
  }, [session.id]);

  // Grab the frame the artist is currently paused on. Uses the hidden CORS video
  // so the canvas isn't tainted — requires R2 bucket CORS; if it fails we tell
  // them to upload instead.
  const captureFrame = async () => {
    const v = videoRef.current;
    if (!v) return;
    setCapturing(true);
    setThumbNote(null);
    try {
      const w = v.videoWidth;
      const h = v.videoHeight;
      if (!w || !h) throw new Error('video not ready');
      const scale = Math.min(1, 1280 / w);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no canvas');
      // Draw the frame the player is currently on (tainted-canvas-safe: the
      // player is crossOrigin and R2 returns CORS headers).
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/jpeg', 0.85));
      if (!blob) throw new Error('capture failed');
      if (thumbPreview && thumbPreview.startsWith('blob:')) URL.revokeObjectURL(thumbPreview);
      setThumbBlob(blob);
      setThumbPreview(URL.createObjectURL(blob));
    } catch {
      setThumbNote('Could not grab this frame (R2 CORS may not be applied to this domain). You can upload an image instead.');
    } finally {
      setCapturing(false);
    }
  };

  const onPickImage = (file: File) => {
    const v = validateUpload(file, 'image');
    if (!v.valid) { setThumbNote(v.error || 'Invalid image'); return; }
    setThumbNote(null);
    if (thumbPreview && thumbPreview.startsWith('blob:')) URL.revokeObjectURL(thumbPreview);
    setThumbBlob(file);
    setThumbPreview(URL.createObjectURL(file));
  };

  // Throws a specific message so the UI can distinguish a presign/auth failure
  // from R2 rejecting the upload (usually CORS not allowing PUT for this domain).
  const uploadThumbnail = async (blob: Blob, filename: string): Promise<{ key: string; url: string }> => {
    const contentType = blob.type || 'image/jpeg';
    const signRes = await fetch('/api/live/thumbnail-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artistId, filename, contentType }),
    });
    if (!signRes.ok) {
      const body = await signRes.json().catch(() => ({}));
      throw new Error(`Could not prepare upload (${signRes.status}${body.error ? `: ${body.error}` : ''}).`);
    }
    const { uploadUrl, key, publicUrl } = await signRes.json();
    let putRes: Response;
    try {
      putRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob });
    } catch {
      // A network-level failure here is almost always CORS blocking the PUT.
      throw new Error('Upload blocked by R2: add PUT to the bucket CORS policy for this domain.');
    }
    if (!putRes.ok) throw new Error(`R2 rejected the upload (${putRes.status}).`);
    return { key, url: publicUrl };
  };

  // Access is editable for live sessions, and for prerecorded videos set to public.
  const gatingEditable = !isPrerecorded || visibility === 'public';

  const save = async () => {
    if (!title.trim()) { setError('Title is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      const update: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || null,
      };
      if (isPrerecorded) update.visibility = visibility;
      if (gatingEditable) {
        update.is_free = isFree;
        update.allowed_tier_ids = isFree ? [] : selectedTiers;
      } else {
        update.is_free = false;
        update.allowed_tier_ids = [];
      }
      if (thumbBlob) {
        const name = thumbBlob instanceof File ? thumbBlob.name : `${title.trim() || 'cover'}.jpg`;
        const up = await uploadThumbnail(thumbBlob, name);
        update.vod_thumbnail_key = up.key;
        update.vod_thumbnail_url = up.url;
      }
      const { error: updErr } = await supabase.from('live_sessions').update(update).eq('id', session.id);
      if (updErr) throw updErr;
      onSaved();
    } catch (err) {
      console.error('Error saving recording:', err);
      setError(err instanceof Error ? err.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-crwn-bg border border-crwn-elevated rounded-2xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between p-4 border-b border-crwn-elevated">
          <h3 className="text-crwn-text font-bold">Edit recording</h3>
          <button onClick={onClose} className="text-crwn-text-dim hover:text-crwn-text" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Thumbnail: scrub the video and grab a frame, or upload your own */}
          <div>
            <label className="block text-crwn-text-dim text-sm mb-2">Thumbnail</label>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="bg-black rounded-xl overflow-hidden">
                {loadingVideo ? (
                  <div className="aspect-video flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-crwn-gold animate-spin" />
                  </div>
                ) : videoUrl ? (
                  /* eslint-disable-next-line jsx-a11y/media-has-caption */
                  <video ref={videoRef} src={videoUrl} crossOrigin="anonymous" controls playsInline className="w-full aspect-video object-contain" />
                ) : (
                  <div className="aspect-video flex items-center justify-center text-crwn-text-dim text-sm px-4 text-center">
                    Video unavailable
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-crwn-text-dim text-xs">Current cover</p>
                <div className="aspect-video rounded-xl overflow-hidden bg-crwn-elevated bg-cover bg-center flex items-center justify-center"
                  style={thumbPreview ? { backgroundImage: `url(${thumbPreview})` } : undefined}>
                  {!thumbPreview && <span className="text-crwn-text-dim text-xs">No cover yet</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={captureFrame}
                    disabled={!videoUrl || capturing}
                    className="neu-button px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {capturing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                    Use this frame
                  </button>
                  <label className="neu-button px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" /> Upload
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickImage(f); e.target.value = ''; }}
                    />
                  </label>
                </div>
                {thumbNote && <p className="text-crwn-text-dim text-xs">{thumbNote}</p>}
                {thumbBlob && (
                  <p className="text-crwn-success text-xs flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> New cover ready: Save to apply
                  </p>
                )}
              </div>
            </div>
            {videoUrl && <p className="text-crwn-text-dim text-xs mt-1">Pause on the frame you want, then hit “Use this frame”.</p>}
          </div>

          <div>
            <label className="block text-crwn-text-dim text-sm mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="neu-inset w-full px-3 py-2 text-crwn-text placeholder-crwn-text-secondary focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-crwn-text-dim text-sm mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="neu-inset w-full px-3 py-2 text-crwn-text placeholder-crwn-text-secondary focus:outline-none resize-none"
            />
          </div>

          {isPrerecorded && (
            <div>
              <label className="block text-crwn-text-dim text-sm mb-1">Visibility</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setVisibility('public')}
                  className={`px-3 py-2 rounded-xl text-sm font-semibold ${visibility === 'public' ? 'neu-button-accent' : 'neu-button text-crwn-text-dim'}`}>
                  Public
                </button>
                <button type="button" onClick={() => setVisibility('private')}
                  className={`px-3 py-2 rounded-xl text-sm font-semibold ${visibility === 'private' ? 'neu-button-accent' : 'neu-button text-crwn-text-dim'}`}>
                  Private
                </button>
              </div>
            </div>
          )}

          {gatingEditable && (
            <div>
              <label className="flex items-center gap-2 mb-3 cursor-pointer">
                <input type="checkbox" checked={isFree}
                  onChange={(e) => { setIsFree(e.target.checked); if (e.target.checked) setSelectedTiers([]); }}
                  className="w-4 h-4" />
                <span className="text-crwn-text">All fans can watch free</span>
              </label>
              {!isFree && tiers.length > 0 && (
                <div className="space-y-2 ml-6">
                  <p className="text-crwn-text-dim text-sm mb-1">Only these tiers can watch:</p>
                  {tiers.map((tier) => (
                    <label key={tier.id} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={selectedTiers.includes(tier.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedTiers([...selectedTiers, tier.id]);
                          else setSelectedTiers(selectedTiers.filter((id) => id !== tier.id));
                        }}
                        className="w-4 h-4" />
                      <span className="text-crwn-text">{tier.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-crwn-error text-sm">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-crwn-elevated">
          <button onClick={onClose} className="neu-button px-4 py-2 rounded-xl text-sm font-semibold">Cancel</button>
          <button
            onClick={save}
            disabled={saving || !title.trim() || (gatingEditable && !isFree && selectedTiers.length === 0)}
            className="neu-button-accent px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
