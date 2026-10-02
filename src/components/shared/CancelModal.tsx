'use client';

import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, Pause, ArrowDown } from 'lucide-react';
import { FAN_CANCEL_REASONS, PLATFORM_CANCEL_REASONS } from '@/lib/cancellationReasons';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { stepDownOffer, type StepDownOffer } from '@/lib/subscriptions/stepDown';

interface CancelModalProps {
  context: 'fan' | 'platform';
  subscriptionId: string;
  itemName: string; // artist name or "CRWN Pro" etc.
  /** Fan context: the artist and the tier the fan is on, so a cheaper tier can be offered first. */
  artistId?: string;
  currentTierId?: string | null;
  onClose: () => void;
  onCanceled: () => void;
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

export default function CancelModal({ context, subscriptionId, itemName, artistId, currentTierId, onClose, onCanceled }: CancelModalProps) {
  const reasons = context === 'fan' ? FAN_CANCEL_REASONS : PLATFORM_CANCEL_REASONS;
  const [selected, setSelected] = useState<string[]>([]);
  const [freeform, setFreeform] = useState('');
  const [loading, setLoading] = useState(false);
  const [pauseLoading, setPauseLoading] = useState(false);
  const [error, setError] = useState('');
  // Founder decision 2026-10-02: a fan who cancels is offered the next cheaper paid tier first
  // (stepDown.ts). The change is scheduled in Stripe at the paid boundary, so they keep what
  // they already paid for and are billed the lower price from then on.
  const [offer, setOffer] = useState<StepDownOffer | null>(null);
  const [stepLoading, setStepLoading] = useState(false);
  const [steppedTo, setSteppedTo] = useState<{ name: string; date: string } | null>(null);

  useEffect(() => {
    if (context !== 'fan' || !artistId || !currentTierId) return;
    let live = true;
    createBrowserSupabaseClient()
      .from('subscription_tiers')
      .select('id, name, price, stripe_price_id, is_active')
      .eq('artist_id', artistId)
      .eq('is_active', true)
      .then(({ data }) => {
        if (live) setOffer(stepDownOffer(data ?? [], currentTierId));
      });
    return () => {
      live = false;
    };
  }, [context, artistId, currentTierId]);

  const handleStepDown = async () => {
    if (!offer || !artistId) return;
    setStepLoading(true);
    setError('');
    try {
      const res = await fetch('/api/stripe/subscription-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newTierId: offer.tierId, artistId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not switch tiers');
      const date = data.effectiveDate
        ? new Date(data.effectiveDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
        : 'your next billing date';
      setSteppedTo({ name: offer.name, date });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setStepLoading(false);
    }
  };

  if (steppedTo) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
        <div className="bg-[#1A1A1A] rounded-2xl border border-[#2a2a2a] w-full max-w-md p-6">
          <h2 className="text-lg font-semibold text-white mb-2">You&apos;re staying with {itemName}</h2>
          <p className="text-sm text-[#ccc] mb-6">
            You keep your current tier until {steppedTo.date}. After that you&apos;re on {steppedTo.name} and pay the lower price. Nothing else changes.
          </p>
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-[#D4AF37] text-black font-semibold rounded-full text-sm hover:brightness-110 transition-all"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

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
            We&apos;re sorry to see you go. Your feedback helps us improve, so please let us know why you&apos;re canceling.
          </p>

          {/* Step-down offer: the next cheaper paid tier, before the pause and the cancel. */}
          {context === 'fan' && offer && (
            <div className="bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-3 mb-2">
                <ArrowDown className="w-5 h-5 text-[#D4AF37]" />
                <p className="text-sm font-medium text-white">
                  Stay on {offer.name} for {dollars(offer.priceCents)}/mo instead?
                </p>
              </div>
              <p className="text-xs text-[#ccc] mb-3">
                You keep your current tier until your billing date, then switch to {offer.name} and pay less. You stay a member of {itemName}.
              </p>
              <button
                onClick={handleStepDown}
                disabled={stepLoading}
                className="w-full py-2 bg-[#D4AF37] text-black font-semibold rounded-full text-sm hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {stepLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Switching...
                  </>
                ) : (
                  `Switch to ${offer.name}`
                )}
              </button>
            </div>
          )}

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

          {/* Pause offer — only for fan context */}
          {context === 'fan' && (
            <div className="bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-3 mb-2">
                <Pause className="w-5 h-5 text-[#D4AF37]" />
                <p className="text-sm font-medium text-white">Need a break instead?</p>
              </div>
              <p className="text-xs text-[#ccc] mb-3">
                Pause your subscription for 30 days. You&apos;ll keep access until the end of your current period, and billing resumes automatically after the break.
              </p>
              <button
                onClick={async () => {
                  setPauseLoading(true);
                  setError('');
                  try {
                    const res = await fetch('/api/subscriptions/pause', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ subscriptionId, action: 'pause' }),
                    });
                    if (!res.ok) {
                      const data = await res.json();
                      throw new Error(data.error || 'Failed to pause');
                    }
                    onCanceled(); // reuse callback — will refresh the UI
                  } catch (err: unknown) {
                    setError(err instanceof Error ? err.message : 'Failed to pause');
                  } finally {
                    setPauseLoading(false);
                  }
                }}
                disabled={pauseLoading}
                className="w-full py-2 bg-[#D4AF37] text-black font-semibold rounded-full text-sm hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {pauseLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Pausing...
                  </>
                ) : (
                  'Pause for 30 Days'
                )}
              </button>
            </div>
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
