'use client';

import { useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { FAN_CANCEL_REASONS, PLATFORM_CANCEL_REASONS } from '@/lib/cancellationReasons';

interface CancelModalProps {
  context: 'fan' | 'platform';
  subscriptionId: string;
  itemName: string; // artist name or "CRWN Pro" etc.
  onClose: () => void;
  onCanceled: () => void;
}

export default function CancelModal({ context, subscriptionId, itemName, onClose, onCanceled }: CancelModalProps) {
  const reasons = context === 'fan' ? FAN_CANCEL_REASONS : PLATFORM_CANCEL_REASONS;
  const [selected, setSelected] = useState<string[]>([]);
  const [freeform, setFreeform] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleReason = (key: string) => {
    setSelected(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleCancel = async () => {
    if (selected.length === 0) {
      setError('Please select at least one reason');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/subscriptions/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId,
          reasons: selected,
          freeform: freeform.trim() || null,
          context,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to cancel');
      }

      onCanceled();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-[#1A1A1A] rounded-2xl border border-[#2a2a2a] w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Cancel Subscription</h2>
              <p className="text-sm text-[#999]">{itemName}</p>
            </div>
          </div>

          <p className="text-sm text-[#ccc] mb-4">
            We&apos;re sorry to see you go. Your feedback helps us improve — please let us know why you&apos;re canceling.
          </p>

          {/* Reasons */}
          <div className="space-y-2 mb-4">
            {reasons.map((reason) => (
              <label
                key={reason.key}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                  selected.includes(reason.key)
                    ? 'border-[#D4AF37]/50 bg-[#D4AF37]/10'
                    : 'border-[#2a2a2a] hover:border-[#444]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(reason.key)}
                  onChange={() => toggleReason(reason.key)}
                  className="sr-only"
                />
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                  selected.includes(reason.key)
                    ? 'border-[#D4AF37] bg-[#D4AF37]'
                    : 'border-[#555]'
                }`}>
                  {selected.includes(reason.key) && (
                    <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-[#ccc]">{reason.label}</span>
              </label>
            ))}
          </div>

          {/* Freeform */}
          <textarea
            placeholder="Tell us more (optional)..."
            value={freeform}
            onChange={(e) => setFreeform(e.target.value)}
            rows={3}
            className="w-full bg-[#0D0D0D] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#D4AF37]/50 resize-none mb-4"
          />

          {error && (
            <p className="text-red-400 text-sm mb-4">{error}</p>
          )}

          {/* Info */}
          <p className="text-xs text-[#666] mb-4">
            Your subscription will remain active until the end of your current billing period. You won&apos;t be charged again.
          </p>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white border border-[#2a2a2a] rounded-full hover:bg-[#2a2a2a] transition-colors"
            >
              Keep Subscription
            </button>
            <button
              onClick={handleCancel}
              disabled={loading}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-full transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Canceling...
                </>
              ) : (
                'Cancel Subscription'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
