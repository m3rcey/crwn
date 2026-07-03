'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { validateUpload } from '@/lib/uploadValidation';
import { detectBlur } from '@/lib/blurDetection';
import { withTimeout } from '@/lib/promiseTimeout';
import ImageCropModal from '@/components/shared/ImageCropModal';

/**
 * One-thing-per-screen: just the profile photo. Reuses the same validate/blur/crop
 * pipeline as ArtistProfileForm, but persists avatar_url immediately (no separate
 * Save button) so the wizard's Continue unlocks the moment a photo lands.
 */
export function OnboardingAvatarStep({
  initialUrl,
  onSaved,
}: {
  initialUrl: string;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const supabase = createBrowserSupabaseClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(initialUrl);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSelect = async (file: File) => {
    const validation = validateUpload(file, 'image');
    if (!validation.valid) {
      showToast(validation.error!, 'error');
      return;
    }
    try {
      const blur = await detectBlur(file, 'avatar');
      if (blur.isBlurry) {
        showToast(
          `This photo looks too blurry (score ${Math.round(blur.score)}/${blur.threshold}). Try a sharper one.`,
          'error'
        );
        return;
      }
    } catch {
      /* blur detection best-effort */
    }
    setCropSrc(URL.createObjectURL(file));
  };

  const handleCropComplete = async (blob: Blob) => {
    if (!user || !cropSrc) return;
    URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    setBusy(true);
    try {
      const path = `${user.id}/avatar/${Date.now()}.jpg`;
      const { error: uploadError } = await withTimeout(
        supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg' })
      );
      if (uploadError) {
        showToast(`Upload failed: ${uploadError.message}`, 'error');
        setBusy(false);
        return;
      }
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const { error: saveError } = await withTimeout(
        supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', user.id)
      );
      if (saveError) {
        showToast('Could not save your photo. Please try again.', 'error');
        setBusy(false);
        return;
      }
      setPreview(data.publicUrl);
      showToast('Looking good!', 'success');
      onSaved();
    } catch {
      showToast('Upload failed. Please try again.', 'error');
    }
    setBusy(false);
  };

  const handleCropCancel = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="flex flex-col items-center text-center">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="relative w-40 h-40 rounded-full bg-crwn-surface overflow-hidden group disabled:opacity-60"
      >
        {preview ? (
          <Image src={preview} alt="Profile photo" fill className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl text-crwn-text-secondary">🎵</div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center rounded-full">
          <span className="text-white text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
            {preview ? 'Change' : 'Upload'}
          </span>
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleSelect(file);
        }}
      />
      <p className="text-sm text-crwn-text-secondary mt-4">
        {busy ? 'Uploading…' : 'Tap the circle to upload. Sharp and square works best (500×500).'}
      </p>

      {cropSrc && (
        <ImageCropModal
          imageSrc={cropSrc}
          type="avatar"
          onComplete={handleCropComplete}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  );
}
