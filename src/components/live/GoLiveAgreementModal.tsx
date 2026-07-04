'use client';

import { useState } from 'react';
import { Loader2, Radio, AlertTriangle } from 'lucide-react';
import { LIVE_AGREEMENT_CHECKBOXES } from '@/lib/liveAgreement';

interface GoLiveAgreementModalProps {
  // artist_profiles.id the artist is acting as (recorded with the acceptance).
  artistId: string;
  // Called after acceptance is successfully PERSISTED server-side. The parent
  // then proceeds to actually start the stream.
  onAccepted: () => void;
  onCancel: () => void;
}

// Mandatory pre-stream screen. Every checkbox must be checked before "Go Live"
// is enabled; confirming records acceptance of the CRWN Live-Streaming
// Agreement (the persisted, liability-shifting record) BEFORE any go-live call
// fires. Server-side enforcement in /api/live/session independently re-checks
// the persisted acceptance, so this UI is the front door, not the only lock.
export function GoLiveAgreementModal({ artistId, onAccepted, onCancel }: GoLiveAgreementModalProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allChecked = LIVE_AGREEMENT_CHECKBOXES.every((c) => checked[c.id]);

  const toggle = (id: string) =>
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleConfirm = async () => {
    if (!allChecked || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/live/agreement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not record acceptance');
      }
      onAccepted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record acceptance');
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80" onClick={isSaving ? undefined : onCancel} />
      <div
        className="relative neu-modal p-6 max-w-md w-full max-h-[90vh] overflow-y-auto"
        style={{ animation: 'fadeInUp 0.3s ease-out' }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Radio className="w-5 h-5 text-crwn-gold" />
          <h3 className="text-lg font-bold text-crwn-text">Before you go live</h3>
        </div>
        <p className="text-sm text-crwn-text-secondary mb-5">
          Confirm the following to broadcast on CRWN. This protects you and the platform.
        </p>

        <div className="space-y-3 mb-5">
          {LIVE_AGREEMENT_CHECKBOXES.map((c) => (
            <label
              key={c.id}
              className="flex items-start gap-3 cursor-pointer neu-inset p-3 rounded-xl"
            >
              <input
                type="checkbox"
                checked={Boolean(checked[c.id])}
                onChange={() => toggle(c.id)}
                className="w-5 h-5 mt-0.5 flex-shrink-0 accent-crwn-gold"
              />
              <span className="text-sm text-crwn-text leading-snug">
                {c.id === 'agrees_terms' ? (
                  <>
                    I agree to the{' '}
                    <a
                      href="/live-agreement"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-crwn-gold hover:underline"
                    >
                      CRWN Live-Streaming Agreement
                    </a>
                    .
                  </>
                ) : (
                  c.label
                )}
              </span>
            </label>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-crwn-error text-sm mb-4">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isSaving}
            className="flex-1 neu-button py-2.5 text-crwn-text-secondary text-sm font-medium press-scale disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!allChecked || isSaving}
            className="flex-1 py-2.5 rounded-full text-sm font-semibold press-scale neu-button-accent text-crwn-bg disabled:opacity-50"
          >
            {isSaving ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Confirming…
              </span>
            ) : (
              'Agree & Go Live'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
