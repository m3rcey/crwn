'use client';

// The fan's testimonial surface on the Command Center.
//
// This is the PERSISTENT half of delivery: the Pop-up Engine interrupts once and is capped at one
// interruption per user per day, so a fan who dismisses it (or never wins the daily slot) still
// finds the question here. Renders nothing when there is no open ask, exactly like
// UpcomingCalendarCard, so it never clutters a fan with nothing to answer.
//
// One question, one text box, one identity choice, one consent checkbox. Not a survey. No rating,
// no stars, no sentiment, no attachment, nothing generated.

import { useCallback, useEffect, useState } from 'react';
import { MessageSquareQuote, Check, Loader2 } from 'lucide-react';
import { BODY_MAX_LENGTH, type DisplayIdentity } from '@/lib/testimonials/core';

interface PendingRequest {
  requestId: string;
  artistId: string;
  artistName: string;
  artistSlug: string | null;
  question: string;
}

export function TestimonialRequestCard() {
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [body, setBody] = useState('');
  const [identity, setIdentity] = useState<DisplayIdentity>('anonymous');
  const [allowPublic, setAllowPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const load = useCallback(() => {
    fetch('/api/testimonials')
      .then((r) => r.json())
      .then((d) => {
        setPending(d?.pending ?? null);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!pending || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/testimonials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          requestId: pending.requestId,
          body,
          displayIdentity: identity,
          allowPublicDisplay: allowPublic,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d?.error || 'Could not save that');
        return;
      }
      setDone(true);
    } catch {
      setError('Could not save that');
    } finally {
      setSaving(false);
    }
  };

  const decline = async () => {
    if (!pending || saving) return;
    setSaving(true);
    try {
      await fetch('/api/testimonials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'decline', requestId: pending.requestId }),
      });
      setPending(null);
    } catch {
      /* leaving the card up is the safe failure: nothing was recorded */
    } finally {
      setSaving(false);
    }
  };

  if (!loaded || !pending) return null;

  if (done) {
    return (
      <div className="neu-raised rounded-xl p-4">
        <div className="flex items-center gap-2">
          <Check className="w-4 h-4 text-crwn-gold" />
          <p className="text-sm text-crwn-text font-medium">Sent to {pending.artistName}</p>
        </div>
        <p className="text-xs text-crwn-text-secondary mt-1">
          {allowPublic
            ? 'They can choose to show it on their page. You can take it back any time.'
            : 'Only they will see it. It will not be shown publicly.'}
        </p>
      </div>
    );
  }

  const tooLong = body.length > BODY_MAX_LENGTH;

  return (
    <div className="neu-raised rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <MessageSquareQuote className="w-4 h-4 text-crwn-gold" />
        <p className="text-sm text-crwn-text font-medium">{pending.artistName} asked you something</p>
      </div>

      <p className="text-sm text-crwn-text-secondary mb-3">{pending.question}</p>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        maxLength={BODY_MAX_LENGTH + 50}
        placeholder="A sentence or two is plenty."
        className="w-full rounded-lg bg-crwn-elevated text-crwn-text text-sm p-3 outline-none focus:ring-1 focus:ring-crwn-gold resize-none"
      />
      <div className="flex justify-end mb-3">
        <span className={`text-[11px] ${tooLong ? 'text-red-400' : 'text-crwn-text-secondary'}`}>
          {body.length}/{BODY_MAX_LENGTH}
        </span>
      </div>

      <p className="text-xs text-crwn-text-secondary mb-2">Show this as</p>
      <div className="flex flex-col gap-2 mb-3">
        {([
          { value: 'display_name' as DisplayIdentity, label: 'My name' },
          { value: 'anonymous' as DisplayIdentity, label: 'A verified supporter' },
        ]).map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setIdentity(opt.value)}
            className={`text-left text-sm rounded-lg px-3 py-2 transition-colors ${
              identity === opt.value
                ? 'bg-crwn-gold/15 text-crwn-gold font-medium'
                : 'bg-crwn-elevated text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* The consent decision. Unchecked is a real answer, not a failure to act: the response is
          stored as private feedback the artist can see and can never publish. */}
      <label className="flex items-start gap-2 mb-3 cursor-pointer">
        <input
          type="checkbox"
          checked={allowPublic}
          onChange={(e) => setAllowPublic(e.target.checked)}
          className="mt-0.5 accent-crwn-gold"
        />
        <span className="text-xs text-crwn-text-secondary">
          {pending.artistName} can show this on their CRWN page. Leave it unchecked and only they see it.
          They can never edit your words, and you can take it back any time.
        </span>
      </label>

      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={saving || body.trim().length < 2 || tooLong}
          className="px-4 py-2 rounded-full bg-crwn-gold text-black text-sm font-semibold disabled:opacity-40 flex items-center gap-2"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Send
        </button>
        <button
          onClick={decline}
          disabled={saving}
          className="px-3 py-2 text-sm text-crwn-text-secondary hover:text-crwn-text disabled:opacity-40"
        >
          Not right now
        </button>
      </div>
    </div>
  );
}
