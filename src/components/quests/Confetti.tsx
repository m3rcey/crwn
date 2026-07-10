'use client';

import { useEffect, useState } from 'react';

// Self-contained confetti burst from both sides — no dependency. Keyframes live in
// neumorphic.css (Tailwind v4 purges custom CSS from globals). Fires when `trigger`
// changes to a new truthy value, then clears itself.

const COLORS = ['#D4AF37', '#FFD700', '#FFFFFF', '#F5C518', '#E8B923', '#C9A227'];

interface Piece {
  id: string;
  left: string;
  color: string;
  dx: string;
  dy: string;
  rot: string;
  size: number;
  delay: string;
}

export function Confetti({ trigger, durationMs = 2600 }: { trigger: number; durationMs?: number }) {
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    if (!trigger) return;
    const arr: Piece[] = Array.from({ length: 90 }, (_, i) => {
      const fromLeft = i % 2 === 0;
      return {
        id: `${trigger}-${i}`,
        left: fromLeft ? '-2%' : '102%',
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        // burst inward + upward, then gravity via the keyframe's arc
        dx: `${(fromLeft ? 1 : -1) * (35 + Math.random() * 55)}vw`,
        dy: `${-(20 + Math.random() * 45)}vh`,
        rot: `${Math.random() * 900 - 450}deg`,
        size: 6 + Math.random() * 7,
        delay: `${Math.random() * 0.15}s`,
      };
    });
    setPieces(arr);
    const t = setTimeout(() => setPieces([]), durationMs + 400);
    return () => clearTimeout(t);
  }, [trigger, durationMs]);

  if (pieces.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[80] overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="crwn-confetti-piece"
          style={
            {
              left: p.left,
              width: p.size,
              height: p.size,
              background: p.color,
              animationDuration: `${durationMs}ms`,
              animationDelay: p.delay,
              ['--cx' as string]: p.dx,
              ['--cy' as string]: p.dy,
              ['--cr' as string]: p.rot,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
