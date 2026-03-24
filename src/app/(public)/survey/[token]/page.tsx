'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { FAN_LOYALTY_REASONS, PLATFORM_LOYALTY_REASONS } from '@/lib/cancellationReasons';
import { CheckCircle, Loader2 } from 'lucide-react';

export default function SurveyPage() {
  const params = useParams();
  const token = params.token as string;

  const [selected, setSelected] = useState<string[]>([]);
  const [favorite, setFavorite] = useState('');
  const [freeform, setFreeform] = useState('');
  const [nps, setNps] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  // Decode token to determine survey type (without verifying — that happens server-side)
  let surveyType: 'loyalty_fan' | 'loyalty_artist' = 'loyalty_fan';
  try {
    const encoded = token.split('.')[0];
    const decoded = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')));
    surveyType = decoded.surveyType || 'loyalty_fan';
  } catch {
    // Default to fan
  }

  const reasons = surveyType === 'loyalty_fan' ? FAN_LOYALTY_REASONS : PLATFORM_LOYALTY_REASONS;
  const isFan = surveyType === 'loyalty_fan';

  const toggleReason = (key: string) => {
    setSelected(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleSubmit = async () => {
    if (selected.length === 0) {
      setError('Please select at least one reason');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          answers: {
            why_stayed: selected,
            favorite: favorite || null,
            freeform: freeform.trim() || null,
          },
          npsScore: nps,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit');
      }

      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0D0D0D] flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <CheckCircle className="w-16 h-16 text-[#D4AF37] mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Thank you!</h1>
          <p className="text-[#999]">Your feedback helps us make things better. We really appreciate you taking the time.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0D0D0D] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="bg-[#1A1A1A] rounded-2xl border border-[#2a2a2a] p-6 md:p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold text-white mb-1">
              {isFan ? 'What keeps you subscribed?' : 'What keeps you on CRWN?'}
            </h1>
            <p className="text-sm text-[#999]">
              Your feedback shapes what we build next. Takes 30 seconds.
            </p>
          </div>

          {/* Why do you stay? */}
          <div className="mb-6">
            <p className="text-sm text-[#ccc] font-medium mb-3">
              {isFan ? 'What keeps you coming back? (select all that apply)' : 'What\'s most valuable to you? (select all that apply)'}
            </p>
            <div className="space-y-2">
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
                    selected.includes(reason.key) ? 'border-[#D4AF37] bg-[#D4AF37]' : 'border-[#555]'
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
          </div>

          {/* Favorite thing */}
          <div className="mb-6">
            <p className="text-sm text-[#ccc] font-medium mb-2">
              What&apos;s your single favorite thing?
            </p>
            <input
              type="text"
              value={favorite}
              onChange={(e) => setFavorite(e.target.value)}
              placeholder="e.g., the exclusive tracks, the community..."
              className="w-full bg-[#0D0D0D] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#D4AF37]/50"
            />
          </div>

          {/* NPS */}
          <div className="mb-6">
            <p className="text-sm text-[#ccc] font-medium mb-2">
              How likely are you to recommend {isFan ? 'this artist' : 'CRWN'} to a friend? (0-10)
            </p>
            <div className="flex gap-1.5">
              {Array.from({ length: 11 }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setNps(i)}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
                    nps === i
                      ? i >= 9 ? 'bg-green-500/30 text-green-400 border border-green-500/50'
                        : i >= 7 ? 'bg-yellow-500/30 text-yellow-400 border border-yellow-500/50'
                        : 'bg-red-500/30 text-red-400 border border-red-500/50'
                      : 'bg-[#0D0D0D] text-[#666] border border-[#2a2a2a] hover:border-[#444]'
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-[#555] mt-1 px-1">
              <span>Not likely</span>
              <span>Very likely</span>
            </div>
          </div>

          {/* Freeform */}
          <div className="mb-6">
            <p className="text-sm text-[#ccc] font-medium mb-2">Anything else you&apos;d like to share?</p>
            <textarea
              value={freeform}
              onChange={(e) => setFreeform(e.target.value)}
              placeholder="Optional — we read every response"
              rows={3}
              className="w-full bg-[#0D0D0D] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#D4AF37]/50 resize-none"
            />
          </div>

          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-3 bg-[#D4AF37] hover:brightness-110 text-black font-semibold rounded-full transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Feedback'
            )}
          </button>
        </div>

        <p className="text-center text-[#444] text-xs mt-4">
          Powered by CRWN
        </p>
      </div>
    </div>
  );
}
