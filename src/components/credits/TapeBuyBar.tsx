'use client';

// "Get the whole tape" on a project's album page: one payment, every song, no membership. The
// product carries products.grants_album_id, and can_play_track plays every track on that album for
// the buyer (supabase/schema-phase2-tape-purchase.sql). Rendered only when the viewer cannot already
// play the whole project. The button sits at the top of the page: a call to action is always above
// the fold (CLAUDE.md).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

export function TapeBuyBar({
  productId,
  priceCents,
  albumTitle,
  songCount,
  returnPath,
}: {
  productId: string;
  priceCents: number;
  albumTitle: string;
  songCount: number;
  returnPath: string;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    setError(null);
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(returnPath)}`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/stripe/product-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.url) {
        window.location.href = data.url; // Stripe is an external page
        return;
      }
      setError(data.error || 'Checkout did not start. Try again.');
    } catch {
      setError('Checkout did not start. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-[#1A1A1A] px-4 py-4 text-center">
      <p className="text-sm text-white/80">{`Own all ${songCount} songs on ${albumTitle}. One payment, no membership.`}</p>
      <button
        type="button"
        onClick={buy}
        disabled={busy}
        className="mx-auto mt-3 flex w-full max-w-sm items-center justify-center gap-2 rounded-full bg-crwn-gold px-6 py-3 font-semibold text-crwn-bg disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {`Get the whole tape, ${dollars(priceCents)}`}
      </button>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
