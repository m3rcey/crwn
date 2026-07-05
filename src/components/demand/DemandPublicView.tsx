'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { CalendarClock, Check, Megaphone, PartyPopper } from 'lucide-react';

export interface PublicDemandTest {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  signal_type: 'rsvp' | 'vote' | 'waitlist';
  goal_count: number;
  deadline: string | null;
  unlock_message: string | null;
  test_price: number | null;
  test_promoter_interest: boolean;
  response_count: number;
  status: string;
}

const BUTTON_LABELS: Record<PublicDemandTest['signal_type'], string> = {
  rsvp: 'RSVP',
  vote: 'I want this',
  waitlist: 'Join the waitlist',
};

const SUCCESS_LINES: Record<PublicDemandTest['signal_type'], string> = {
  rsvp: 'Your spot is reserved.',
  vote: 'Your vote is counted.',
  waitlist: 'You\'re on the list.',
};

function deadlineLabel(deadline: string): { text: string; urgent: boolean } | null {
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return null;
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return { text: `${days} day${days === 1 ? '' : 's'} left`, urgent: days <= 3 };
  const hours = Math.max(1, Math.floor(ms / 3600000));
  return { text: `${hours} hour${hours === 1 ? '' : 's'} left`, urgent: true };
}

/**
 * The fan-facing Proof of Demand page. One primary action, mobile-first,
 * conversion-focused. Money-FREE — the optional price is a labeled,
 * non-binding signal. Individual responses are never exposed here.
 */
export function DemandPublicView({
  test,
  artistName,
  artistAvatarUrl,
  artistSlug,
  isLoggedIn,
  initialResponded,
}: {
  test: PublicDemandTest;
  artistName: string;
  artistAvatarUrl: string | null;
  artistSlug: string;
  isLoggedIn: boolean;
  initialResponded: boolean;
}) {
  const router = useRouter();
  const [responded, setResponded] = useState(initialResponded);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wouldPromote, setWouldPromote] = useState(false);
  const [count, setCount] = useState(test.response_count);

  const deadline = test.deadline ? deadlineLabel(test.deadline) : null;
  const deadlinePassed = !!test.deadline && new Date(test.deadline).getTime() <= Date.now();
  const pct = Math.min(100, Math.round((count / Math.max(1, test.goal_count)) * 100));
  const goalMet = count >= test.goal_count;

  const submit = async () => {
    if (submitting || responded) return;

    if (!isLoggedIn) {
      // Responses need an account — send them to login with a way back here.
      router.push(`/login?next=${encodeURIComponent(`/${artistSlug}/demand/${test.id}`)}`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/proof-of-demand/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testId: test.id, wouldPromote }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error || 'Something went wrong. Please try again.');
        return;
      }
      if (typeof data.responseCount === 'number') setCount(data.responseCount);
      setResponded(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-crwn-bg flex flex-col">
      <main className="flex-1 w-full max-w-lg mx-auto px-4 sm:px-6 py-10">
        {/* Artist */}
        <button
          type="button"
          onClick={() => router.push(`/${artistSlug}`)}
          className="flex items-center gap-3 mb-8 group"
        >
          {artistAvatarUrl ? (
            <Image
              src={artistAvatarUrl}
              alt={artistName}
              width={40}
              height={40}
              className="w-10 h-10 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-crwn-gold/15 flex items-center justify-center flex-shrink-0">
              <span className="text-crwn-gold font-bold">{artistName.charAt(0).toUpperCase()}</span>
            </div>
          )}
          <div className="text-left">
            <p className="text-sm font-medium text-crwn-text group-hover:text-crwn-gold transition-colors">
              {artistName}
            </p>
            <p className="text-xs text-crwn-text-secondary">is testing an idea — help decide</p>
          </div>
        </button>

        {/* Idea */}
        {test.image_url && (
          <div className="relative w-full aspect-video rounded-2xl overflow-hidden mb-6 bg-crwn-elevated">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={test.image_url} alt={test.title} className="w-full h-full object-cover" />
          </div>
        )}
        <h1 className="text-3xl font-bold text-crwn-text mb-3">{test.title}</h1>
        {test.description && (
          <p className="text-crwn-text-secondary whitespace-pre-line mb-6">{test.description}</p>
        )}

        {/* Progress */}
        <div className="border border-crwn-elevated rounded-2xl p-4 mb-6">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-sm text-crwn-text">
              <span className="font-bold text-lg">{count}</span>
              <span className="text-crwn-text-secondary"> of {test.goal_count} fans in</span>
            </p>
            {deadline && (
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                  deadline.urgent ? 'text-orange-400' : 'text-crwn-text-secondary'
                }`}
              >
                <CalendarClock className="w-3.5 h-3.5" />
                {deadline.text}
              </span>
            )}
          </div>
          <div className="h-2 rounded-full bg-crwn-elevated overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${goalMet ? 'bg-green-400' : 'bg-crwn-gold'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {test.unlock_message && (
            <p className="text-xs text-crwn-text-secondary mt-3">
              <span className="text-crwn-gold font-medium">If it hits the goal:</span> {test.unlock_message}
            </p>
          )}
        </div>

        {/* Non-binding price signal */}
        {test.test_price !== null && !responded && (
          <p className="text-sm text-crwn-text-secondary mb-6">
            If this happens, it would be around{' '}
            <span className="text-crwn-text font-semibold">${(test.test_price / 100).toFixed(2)}</span>. Responding
            costs nothing — you will never be charged from this page.
          </p>
        )}

        {/* Action */}
        {responded ? (
          <div className="text-center border border-green-500/30 bg-green-500/5 rounded-2xl px-6 py-8">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-green-500/15 flex items-center justify-center">
              <PartyPopper className="w-7 h-7 text-green-400" />
            </div>
            <p className="text-xl font-bold text-crwn-text mb-1">You&apos;re in! 🎉</p>
            <p className="text-sm text-crwn-text-secondary">
              {SUCCESS_LINES[test.signal_type]} {count} of {test.goal_count} fans are in — {artistName} will see it.
            </p>
          </div>
        ) : deadlinePassed ? (
          <div className="text-center border border-crwn-elevated rounded-2xl px-6 py-8">
            <p className="text-crwn-text font-medium mb-1">This test has ended</p>
            <p className="text-sm text-crwn-text-secondary">The deadline passed — watch {artistName} for what&apos;s next.</p>
          </div>
        ) : (
          <div>
            {test.test_promoter_interest && (
              <button
                type="button"
                onClick={() => setWouldPromote((v) => !v)}
                className={`w-full text-left px-4 py-3.5 rounded-xl border transition-colors flex items-center gap-3 mb-4 ${
                  wouldPromote ? 'border-crwn-gold bg-crwn-gold/10' : 'border-crwn-elevated hover:border-crwn-gold/40'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${
                    wouldPromote ? 'bg-crwn-gold border-crwn-gold' : 'border-crwn-text-secondary/50'
                  }`}
                >
                  {wouldPromote && <Check className="w-3.5 h-3.5 text-crwn-bg" />}
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-medium text-crwn-text">I&apos;d help promote this</span>
                  <span className="block text-xs text-crwn-text-secondary mt-0.5">
                    Tell {artistName} you&apos;d spread the word.
                  </span>
                </span>
                <Megaphone className="w-4 h-4 text-crwn-gold flex-shrink-0" />
              </button>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="w-full bg-crwn-gold text-crwn-bg font-semibold text-lg px-8 py-4 rounded-full hover:bg-crwn-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'One sec…' : BUTTON_LABELS[test.signal_type]}
            </button>
            {!isLoggedIn && (
              <p className="text-xs text-crwn-text-secondary text-center mt-3">
                Free CRWN account required — takes a few seconds.
              </p>
            )}
            {error && <p className="text-sm text-red-400 text-center mt-3">{error}</p>}
            <p className="text-[11px] text-crwn-text-secondary/70 text-center mt-4">
              No payment, no commitment — this just tells {artistName} the demand is real.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
