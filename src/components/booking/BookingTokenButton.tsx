'use client';

import { useState } from 'react';
import { useToast } from '@/components/shared/Toast';

interface BookingTokenButtonProps {
  tokenId: string;
  tokenStatus: 'unused' | 'used' | 'expired';
  calendarLink?: string | null;
  usedAt?: string | null;
  expiresAt: string;
  productTitle: string;
}

export default function BookingTokenButton({
  tokenId,
  tokenStatus,
  calendarLink,
  usedAt,
  expiresAt,
  productTitle,
}: BookingTokenButtonProps) {
  const { showToast } = useToast();
  const [status, setStatus] = useState(tokenStatus);
  const [revealedLink, setRevealedLink] = useState<string | null>(
    tokenStatus === 'used' ? calendarLink || null : null
  );
  const [loading, setLoading] = useState(false);

  const isExpired = tokenStatus === 'expired' || new Date(expiresAt) < new Date();

  const handleBookSession = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const res = await fetch('/api/booking-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token_id: tokenId }),
      });

      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Failed to book session', 'error');
        return;
      }

      setRevealedLink(data.calendar_link);
      setStatus('used');
      showToast('Booking link revealed! Click to schedule your session.', 'success');
    } catch (err) {
      showToast('Something went wrong', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Token expired
  if (isExpired && status !== 'used') {
    return (
      <div className="mt-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
        <p className="text-sm text-red-400">
          Your booking window has expired. Contact the artist for assistance.
        </p>
      </div>
    );
  }

  // Token already used — show the link
  if (status === 'used' && revealedLink) {
    return (
      <div className="mt-3">
        <a
          href={revealedLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-crwn-gold text-black font-semibold rounded-full hover:brightness-110 transition-all press-scale"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Schedule Your Session
        </a>
        <p className="text-xs text-crwn-text-secondary mt-2">
          Booked on {new Date(usedAt!).toLocaleDateString()}
        </p>
      </div>
    );
  }

  // Token unused — show Book button
  return (
    <div className="mt-3">
      <button
        onClick={handleBookSession}
        disabled={loading}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-crwn-gold text-black font-semibold rounded-full hover:brightness-110 transition-all press-scale disabled:opacity-50"
      >
        {loading ? (
          <span className="animate-spin w-4 h-4 border-2 border-black/30 border-t-black rounded-full" />
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        )}
        Book Your Session
      </button>
      <p className="text-xs text-crwn-text-secondary mt-2">
        Expires {new Date(expiresAt).toLocaleDateString()} · One-time use
      </p>
    </div>
  );
}
