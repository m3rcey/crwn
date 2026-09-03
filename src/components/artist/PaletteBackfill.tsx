'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { samplePalette } from '@/lib/palette';

/**
 * One-time palette self-heal. Sampling needs a browser canvas, so the server can never
 * backfill; instead, when the OWNER views their own page and the palette is null, sample
 * their image here and persist. Renders nothing. Fans never run this (only the owner's
 * session can write the row anyway).
 *
 * BANNER FIRST, THEN AVATAR. Originally banner-only, which meant an artist who never
 * uploaded a banner never got a colourway at all: exactly one artist on the platform had
 * one. The avatar is a real photo of the artist and is the image a fan sees at the top of
 * a drop page, so it is a truthful second source. Banner still wins when both exist,
 * because it is the larger, more deliberate art.
 */
export function PaletteBackfill({
  artistId,
  bannerUrl,
  avatarUrl,
  isOwner,
  hasPalette,
}: {
  artistId: string;
  bannerUrl: string | null;
  avatarUrl?: string | null;
  isOwner: boolean;
  hasPalette: boolean;
}) {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    const source = bannerUrl || avatarUrl || null;
    if (!isOwner || hasPalette || !source || ran.current) return;
    ran.current = true;

    const img = new window.Image();
    // Required for canvas readback; Supabase storage public objects allow *.
    img.crossOrigin = 'anonymous';
    img.src = source;
    img
      .decode()
      .then(async () => {
        const palette = samplePalette(img);
        if (!palette) return; // no usable colour: gold stays, correctly
        const supabase = createBrowserSupabaseClient();
        const { error } = await supabase
          .from('artist_profiles')
          .update({
            accent_hex: palette.accent,
            accent2_hex: palette.accent2,
            surface_hex: palette.surface,
          })
          .eq('id', artistId);
        if (!error) router.refresh(); // re-render the server page with the accent
        else console.warn('Palette backfill skipped:', error.message);
      })
      .catch(() => {
        // CORS-blocked or undecodable image: keep gold, never retry-loop.
      });
  }, [isOwner, hasPalette, bannerUrl, avatarUrl, artistId, router]);

  return null;
}
