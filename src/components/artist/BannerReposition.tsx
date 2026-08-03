'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useToast } from '@/components/shared/Toast';
import { Move, Check, X } from 'lucide-react';

/**
 * Banner reposition — the artist drags to reframe, and what persists is TWO
 * NUMBERS (a CSS object-position in percent), never a re-encoded image. The
 * upload is untouched, so reframing is lossless, free and reversible.
 *
 * Fans get a plain <Image> with the stored position. Only the owner sees the
 * Reposition affordance, and only while repositioning does the image become
 * draggable — otherwise a fan's drag would fight page scroll for no reason.
 *
 * Migration: supabase/schema-phase2-banner-position.sql. Before it runs the
 * save fails soft (the banner just keeps its default centring).
 */
export function BannerReposition({
  artistId,
  bannerUrl,
  alt,
  isOwner,
  initialX,
  initialY,
}: {
  artistId: string;
  bannerUrl: string;
  alt: string;
  isOwner: boolean;
  initialX: number;
  initialY: number;
}) {
  const { showToast } = useToast();
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  // Committed value, so Cancel restores it and Save has something to compare.
  const committed = useRef({ x: initialX, y: initialY });
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  // Escape cancels, matching every other reframe affordance in the app.
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPos(committed.current);
        setEditing(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!editing) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const frame = frameRef.current;
    if (!d || !frame) return;
    const w = frame.clientWidth || 1;
    const h = frame.clientHeight || 1;
    // Inverted: dragging right reveals what sits off to the left.
    setPos({
      x: Math.max(0, Math.min(100, d.ox - ((e.clientX - d.px) / w) * 100)),
      y: Math.max(0, Math.min(100, d.oy - ((e.clientY - d.py) / h) * 100)),
    });
  };

  const endDrag = () => { drag.current = null; };

  const save = async () => {
    setSaving(true);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase
      .from('artist_profiles')
      .update({
        banner_pos_x: Math.round(pos.x * 10) / 10,
        banner_pos_y: Math.round(pos.y * 10) / 10,
      })
      .eq('id', artistId);
    setSaving(false);
    if (error) {
      // Pre-migration this is the expected path; say something true either way.
      setPos(committed.current);
      showToast("Couldn't save the banner position. Try again in a moment.", 'error');
      console.warn('Banner position save failed (migration pending?):', error.message);
      return;
    }
    committed.current = pos;
    setEditing(false);
    showToast('Banner position saved!', 'success');
  };

  return (
    <div
      ref={frameRef}
      className="relative h-48 sm:h-64 md:h-72 w-full rounded-2xl md:rounded-[20px] overflow-hidden"
      style={{ boxShadow: '0 24px 60px color-mix(in srgb, var(--crwn-gold) 20%, transparent)' }}
    >
      <Image
        src={bannerUrl}
        alt={alt}
        fill
        priority
        className="object-cover select-none"
        style={{
          objectPosition: `${pos.x}% ${pos.y}%`,
          cursor: editing ? (drag.current ? 'grabbing' : 'grab') : undefined,
          touchAction: editing ? 'none' : undefined,
        }}
        draggable={false}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-crwn-bg/70 via-transparent to-transparent pointer-events-none" />

      {isOwner && !editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="crwn-interactive absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-2 text-xs font-medium text-crwn-text border border-white/15 hover:bg-black/85"
        >
          <Move className="w-3.5 h-3.5" />
          Reposition
        </button>
      )}

      {isOwner && editing && (
        <>
          <div className="absolute inset-0 ring-2 ring-crwn-gold rounded-2xl md:rounded-[20px] pointer-events-none" />
          <div className="absolute top-3 left-3 rounded-full bg-black/70 px-3 py-1.5 text-xs text-crwn-text pointer-events-none">
            Drag to reframe
          </div>
          <div className="absolute bottom-3 right-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setPos(committed.current); setEditing(false); }}
              className="crwn-interactive inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-2 text-xs font-medium text-crwn-text border border-white/15"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="neu-button-accent crwn-interactive inline-flex items-center gap-1.5 px-4 py-2 text-xs disabled:opacity-60"
            >
              <Check className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
