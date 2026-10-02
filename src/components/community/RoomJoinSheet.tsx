'use client';

// The rope. A non-member tapped something in a room they are not in: say who is enjoying it,
// say they are not a member YET, and offer the one rung that opens it.
//
// Money moves through the SAME two calls TierCards makes, never a new path:
//   - no membership, or only the free one  -> POST /api/stripe/checkout (a free rung is
//     joined there without Stripe), then off to Stripe;
//   - already on a cheaper PAID rung        -> POST /api/stripe/subscription-update, a
//     proration change on the subscription they have. A second checkout would leave them
//     with two subscriptions, the double-charge this codebase guards against everywhere.
// The checkout returns them to this room (?tab=community&room=<id>), which is a validated
// internal path (checkoutReturnUrls).

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Lock, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useArtistPreview } from '@/hooks/useArtistPreview';
import { getPersistedReferralCode, getPersistedAttributionSource } from '@/components/shared/ReferralPersist';
import { loginWithReturn } from '@/components/artist/SubscribeSection';
import { PURCHASE_BLOCKER_MESSAGE } from '@/lib/stripe/paymentReadiness';
import { ropeButtonLabel } from '@/lib/community/rooms';
import type { TierConfig } from '@/types';

interface RoomJoinSheetProps {
  open: boolean;
  onClose: () => void;
  headline: string;
  target: TierConfig;
  currentTier: TierConfig | null;
  artistId: string;
  artistSlug: string;
  roomId: string | null;
}

export function RoomJoinSheet({ open, onClose, headline, target, currentTier, artistId, artistSlug, roomId }: RoomJoinSheetProps) {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { previewing, embedded } = useArtistPreview();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || typeof document === 'undefined') return null;

  const blocked = target.purchasable === false;
  const upgrading = !!currentTier && currentTier.price > 0 && target.price > currentTier.price;
  // A paying member locked out of a CHEAPER rung's legacy post (an old exact-match list).
  // A checkout here would open a second subscription, so there is no button to press.
  const sideways = !!currentTier && currentTier.price > 0 && !upgrading;
  const label = ropeButtonLabel(target, currentTier);

  const join = async () => {
    if (previewing || embedded) {
      setError('This is how fans see it. Joining is switched off in preview.');
      return;
    }
    if (!user) {
      router.push(loginWithReturn());
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (upgrading) {
        const res = await fetch('/api/stripe/subscription-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newTierId: target.id, artistId }),
        });
        const data = await res.json();
        if (data.success) {
          window.location.reload();
          return;
        }
        setError(data.error || 'Could not upgrade. Try again.');
        return;
      }
      const returnUrl = `/${artistSlug}?tab=community${roomId ? `&room=${roomId}` : ''}`;
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tierId: target.id,
          artistSlug,
          returnUrl,
          interval: 'month',
          referralCode: getPersistedReferralCode(searchParams.get('ref') || ''),
          attributionSource: getPersistedAttributionSource(searchParams.get('src') || ''),
          utmSource: searchParams.get('utm_source') || '',
          utmMedium: searchParams.get('utm_medium') || '',
          utmCampaign: searchParams.get('utm_campaign') || '',
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error || 'Could not start checkout. Try again.');
    } catch {
      setError('Could not start checkout. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="w-full sm:max-w-sm bg-crwn-surface border border-crwn-elevated rounded-t-2xl sm:rounded-2xl p-6 pb-8"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex justify-end -mt-2 -mr-2">
          <button onClick={onClose} className="p-2 text-crwn-text-secondary hover:text-crwn-text" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="w-12 h-12 rounded-full bg-crwn-gold/15 flex items-center justify-center mx-auto mb-4">
          <Lock className="w-6 h-6 text-crwn-gold" />
        </div>
        <p className="text-center text-lg font-semibold text-crwn-text leading-snug">{headline}</p>
        <p className="text-center text-sm text-crwn-text-secondary mt-2">
          {target.price === 0
            ? `Join ${target.name} free to get in.`
            : `${target.name} members get the full post, the comments, and everything else in this room.`}
        </p>

        {sideways ? (
          <p className="mt-6 text-center text-sm text-crwn-text-secondary">
            Your {currentTier?.name} membership does not include this post. Ask the artist to open it to {currentTier?.name}.
          </p>
        ) : blocked ? (
          <p className="mt-6 text-center text-sm text-crwn-text-secondary">{PURCHASE_BLOCKER_MESSAGE.artist_payments_unavailable}</p>
        ) : (
          <button
            onClick={join}
            disabled={busy}
            className="mt-6 w-full py-3 rounded-full font-semibold bg-crwn-gold text-crwn-bg hover:bg-crwn-gold/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {label}
          </button>
        )}
        {error && <p className="mt-3 text-center text-sm text-crwn-error">{error}</p>}
      </div>
    </div>,
    document.body,
  );
}
