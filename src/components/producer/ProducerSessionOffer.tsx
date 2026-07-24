'use client';

import { useState } from 'react';
import { Loader2, Ticket, Calendar, Users, Music2 } from 'lucide-react';
import { SubscribeCTA } from '@/components/gating';
import type { LiveSession } from '@/types/live';

interface Props {
  session: LiveSession;
  artistName: string;
  artistSlug: string;
  currentUserId: string | null;
  canAccess: boolean;
  gateLoading: boolean;
  // Rendered for a fan who already holds a seat (the submit panel).
  children: React.ReactNode;
}

// The public sales view for a SCHEDULED Executive Producer Session. This is the
// page the producer scripts send fans to, so it has to sell the seat to someone
// who does not have one yet, not just show "not live yet". Branches on access:
//   logged out            -> log in to grab a seat
//   no seat + ticketed     -> buy a ticket (reuses /api/stripe/live-checkout)
//   no seat + tier-only    -> subscribe CTA
//   has a seat             -> the submit panel (children)
export function ProducerSessionOffer({ session, artistName, artistSlug, currentUserId, canAccess, gateLoading, children }: Props) {
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const when = session.scheduled_at ? new Date(session.scheduled_at).toLocaleString() : null;
  const priceLabel = session.price && session.price > 0 ? `$${(session.price / 100).toFixed(2)}` : null;
  const ticketed = !!session.price && session.price > 0;

  const buy = async () => {
    setBuying(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/live-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; return; } // external Stripe URL
      setError(data.error || 'Could not start checkout');
    } catch {
      setError('Network error');
    } finally {
      setBuying(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-10 space-y-5">
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 text-crwn-gold text-xs font-semibold uppercase tracking-wide mb-2">
          <Music2 className="w-3.5 h-3.5" /> Executive Producer Session
        </span>
        <h1 className="text-2xl font-bold text-crwn-text mb-1">{session.title}</h1>
        <p className="text-crwn-text-secondary">{artistName}</p>
      </div>

      <div className="rounded-2xl border border-crwn-elevated/60 p-4 space-y-2.5 text-sm">
        {when && (
          <div className="flex items-center gap-2 text-crwn-text">
            <Calendar className="w-4 h-4 text-crwn-gold shrink-0" /> {when}
          </div>
        )}
        <div className="flex items-center gap-2 text-crwn-text">
          <Users className="w-4 h-4 text-crwn-gold shrink-0" /> {session.max_slots} seats
          {priceLabel && <span className="text-crwn-text-secondary">· {priceLabel} a seat</span>}
        </div>
        {session.submission_prompt && (
          <div className="pt-2 border-t border-crwn-elevated/50">
            <p className="text-crwn-text-secondary text-xs uppercase tracking-wide mb-1">What you can bring</p>
            <p className="text-crwn-text">{session.submission_prompt}</p>
          </div>
        )}
        {session.description && <p className="text-crwn-text-secondary">{session.description}</p>}
      </div>

      {gateLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 text-crwn-gold animate-spin" /></div>
      ) : !currentUserId ? (
        <a
          href={`/login?next=/${artistSlug}/live/${session.id}`}
          className="neu-button-accent w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2"
        >
          <Ticket className="w-5 h-5" /> Log in to grab a seat
        </a>
      ) : canAccess ? (
        <div>
          <p className="text-crwn-gold text-sm font-semibold text-center mb-3">You have a seat. Send something in before it starts.</p>
          {children}
        </div>
      ) : ticketed ? (
        <div>
          <button
            onClick={buy}
            disabled={buying}
            className="neu-button-accent w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {buying ? <Loader2 className="w-5 h-5 animate-spin" /> : <Ticket className="w-5 h-5" />}
            Grab a seat {priceLabel}
          </button>
          {error && <p className="text-crwn-error text-sm text-center mt-2">{error}</p>}
        </div>
      ) : (
        <SubscribeCTA artistName={artistName} artistSlug={artistSlug} />
      )}
    </div>
  );
}
