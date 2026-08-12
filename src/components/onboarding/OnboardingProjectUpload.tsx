'use client';

// Onboarding "album / EP / mixtape" upload (the project flow).
//
// One container, one title, ONE artwork upload, then the EXISTING bulk uploader
// for the audio. On each successful batch this creates (or extends) the albums
// row, links tracks via album_tracks in queue order, and backfills the cover
// URL onto tracks that have no artwork of their own, because every rendering
// surface reads track.album_art_url (there is no render-time album→track
// inheritance; the URL copy is the AlbumManager convention: one storage
// object, N references, zero re-uploads).
//
// Everything runs on the browser client under RLS, exactly like the studio
// album flows: the albums INSERT policy proves ownership server-side, and
// album_tracks policies join through the album to the owning artist. No
// service role, no new pipeline.
//
// Idempotent by construction: the album is created once (ref), joins are
// UPSERTs on (album_id, track_id), numbering continues from the album's
// current max, and re-running a partly failed batch links only what is new.

import { useRef, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { validateUpload } from '@/lib/uploadValidation';
import { albumInsertPayload, albumTrackRows, type ProjectAccess } from '@/lib/projectUpload';
import { BulkUploadForm } from '@/components/artist/BulkUploadForm';

interface OnboardingProjectUploadProps {
  artistProfileId: string;
  /** Same contract as BulkUploadForm's onComplete: the wizard refresh. */
  onComplete: () => void;
}

export function OnboardingProjectUpload({ artistProfileId, onComplete }: OnboardingProjectUploadProps) {
  const { showToast } = useToast();
  const supabase = createBrowserSupabaseClient();

  const [title, setTitle] = useState('');
  const [artFile, setArtFile] = useState<File | null>(null);
  const [artPreview, setArtPreview] = useState<string | null>(null);

  // Survives re-renders and double-fires: the project is created exactly once.
  const albumIdRef = useRef<string | null>(null);
  const artUrlRef = useRef<string | null>(null);
  // Render-safe mirror of "the album exists": refs must not be read in render.
  const [projectSaved, setProjectSaved] = useState(false);

  const pickArt = (file: File | null) => {
    if (artPreview) URL.revokeObjectURL(artPreview);
    if (!file) {
      setArtFile(null);
      setArtPreview(null);
      return;
    }
    const verdict = validateUpload(file, 'image');
    if (!verdict.valid) {
      showToast(verdict.error || 'That image cannot be used', 'error');
      return;
    }
    setArtFile(file);
    setArtPreview(URL.createObjectURL(file));
  };

  /** Upload the cover ONCE. Failure never blocks the tracks: the artist can add
   *  the cover later in Studio → Albums, and we say so. */
  const ensureArtUploaded = async (): Promise<string | null> => {
    if (artUrlRef.current) return artUrlRef.current;
    if (!artFile) return null;
    const ext = artFile.name.split('.').pop();
    const path = `${artistProfileId}/albums/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('album-art').upload(path, artFile);
    if (error) {
      console.error('[project-upload] cover upload failed:', error);
      showToast('The cover upload failed. Your tracks are safe; add the cover later in Studio.', 'error');
      return null;
    }
    const { data: { publicUrl } } = supabase.storage.from('album-art').getPublicUrl(path);
    artUrlRef.current = publicUrl;
    return publicUrl;
  };

  const ensureAlbum = async (access: ProjectAccess): Promise<string | null> => {
    if (albumIdRef.current) return albumIdRef.current;
    const albumArtUrl = await ensureArtUploaded();
    const { data, error } = await supabase
      .from('albums')
      .insert(albumInsertPayload({ artistId: artistProfileId, title, albumArtUrl, access }))
      .select('id')
      .single();
    if (error || !data) {
      console.error('[project-upload] album insert failed:', error);
      throw new Error('Could not create the project');
    }
    albumIdRef.current = data.id as string;
    setProjectSaved(true);

    // Activation milestone via the existing whitelist route (idempotent server-side).
    fetch('/api/artist/milestone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ milestone: 'first_project_created' }),
    }).catch(() => {});

    return albumIdRef.current;
  };

  const linkBatch = async ({ trackIds, access }: { trackIds: string[]; access: ProjectAccess }) => {
    const albumId = await ensureAlbum(access);
    if (!albumId) return;

    // Continue numbering from the album's current max, so a retried batch
    // appends instead of colliding (same read handleBulkAddToAlbum uses).
    const { data: maxRow } = await supabase
      .from('album_tracks')
      .select('track_number')
      .eq('album_id', albumId)
      .order('track_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    const startAt = (maxRow?.track_number ?? 0) + 1;

    const rows = albumTrackRows(albumId, trackIds, startAt);
    if (rows.length > 0) {
      const { error: linkError } = await supabase
        .from('album_tracks')
        .upsert(rows, { onConflict: 'album_id,track_id' });
      if (linkError) {
        console.error('[project-upload] album_tracks upsert failed:', linkError);
        throw new Error('Could not link the tracks to the project');
      }
    }

    // The cover onto every linked track that has no artwork of its own: the
    // URL string only, never a second upload. Guarded with .is(null) so a
    // track-specific cover is never overwritten.
    const artUrl = artUrlRef.current;
    if (artUrl && trackIds.length > 0) {
      const { error: artError } = await supabase
        .from('tracks')
        .update({ album_art_url: artUrl })
        .in('id', trackIds)
        .is('album_art_url', null);
      if (artError) console.error('[project-upload] artwork backfill failed:', artError);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Project title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          disabled={projectSaved}
          placeholder="The album, EP, or mixtape name"
          className="w-full neu-inset px-4 py-3 text-crwn-text placeholder:text-crwn-text-secondary/60 focus:outline-none disabled:opacity-60"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Cover art (one upload for the whole project)</label>
        <div className="flex items-center gap-3">
          <div className="w-20 h-20 rounded-lg bg-crwn-elevated overflow-hidden flex items-center justify-center shrink-0">
            {artPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={artPreview} alt="Project cover preview" className="w-full h-full object-cover" />
            ) : (
              <ImageIcon size={24} className="text-crwn-text-secondary" />
            )}
          </div>
          <div>
            <input
              type="file"
              accept="image/*"
              id="project-cover"
              className="hidden"
              disabled={projectSaved}
              onChange={(e) => pickArt(e.target.files?.[0] ?? null)}
            />
            <label
              htmlFor="project-cover"
              className="inline-block px-4 py-2 bg-crwn-bg border border-crwn-elevated text-crwn-text text-sm rounded-lg hover:border-crwn-gold cursor-pointer"
            >
              {artPreview ? 'Change cover' : 'Choose cover'}
            </label>
            <p className="text-xs text-crwn-text-secondary mt-1.5">
              Every track in this project wears this cover. No per-track uploads.
            </p>
          </div>
        </div>
      </div>

      {title.trim() ? (
        <BulkUploadForm
          artistProfileId={artistProfileId}
          projectMode
          onBatchComplete={linkBatch}
          onComplete={onComplete}
        />
      ) : (
        <p className="text-sm text-crwn-text-secondary border border-dashed border-crwn-elevated rounded-xl px-4 py-5 text-center">
          Name the project to start adding its tracks.
        </p>
      )}
    </div>
  );
}
