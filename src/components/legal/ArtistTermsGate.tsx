'use client';

// The artist terms, full screen, before an artist can use CRWN (founder, 2026-09-30). Shown by
// MainShell to an artist who has not accepted the current version, and by the setup wizard the
// moment a new artist's page exists, so nobody uploads before accepting.
//
// The words come from src/lib/legal/artistTerms.ts and nowhere else. The record is written by
// /api/artist/terms from the session; this component only collects the typed name and ticks.

import { useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { SetupAccountBar } from '@/components/onboarding/SetupAccountBar';
import {
  ARTIST_TERMS_POINTS,
  LAUNCH_ADDENDUM_INTRO,
  LAUNCH_ADDENDUM_OUTRO,
  LAUNCH_ADDENDUM_STEPS,
  LAUNCH_ADDENDUM_TITLE,
} from '@/lib/legal/artistTerms';

export function ArtistTermsGate({ needsAddendum, onAccepted }: { needsAddendum: boolean; onAccepted: () => void }) {
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptAddendum, setAcceptAddendum] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = acceptTerms && (!needsAddendum || acceptAddendum) && name.trim().length >= 2;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/artist/terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, acceptTerms, acceptAddendum: needsAddendum ? acceptAddendum : false }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Could not record your acceptance. Try again.');
      onAccepted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record your acceptance. Try again.');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-crwn-bg">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-4 pb-16">
        <SetupAccountBar className="mb-6 pb-2.5 border-b border-crwn-elevated/60" />
        <div className="flex items-center gap-3 mb-2">
          <ShieldCheck className="w-7 h-7 text-crwn-gold flex-shrink-0" aria-hidden />
          <h1 className="text-2xl font-bold text-crwn-text">Before you use CRWN</h1>
        </div>
        <p className="text-sm text-crwn-text-secondary mb-6">
          You upload your music and content here, so you agree to the artist terms first. Read them, then sign with your name.
        </p>

        <section className="rounded-2xl bg-crwn-surface border border-crwn-elevated p-5">
          <h2 className="text-base font-semibold text-crwn-text mb-3">Artist terms for uploading music and content</h2>
          <ol className="space-y-3 list-decimal pl-5 text-sm text-crwn-text-secondary leading-relaxed">
            {ARTIST_TERMS_POINTS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-crwn-text-secondary">
            Full text:{' '}
            <a href="/artist-agreement" target="_blank" rel="noopener noreferrer" className="text-crwn-gold hover:underline">Artist Agreement</a>
            {' '}and{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-crwn-gold hover:underline">Terms of Service</a>.
          </p>
          <label className="flex items-start gap-3 mt-4 cursor-pointer">
            <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} className="mt-0.5 w-4 h-4 accent-crwn-gold flex-shrink-0" />
            <span className="text-sm text-crwn-text">I have read and agree to the artist terms, the Artist Agreement and the Terms of Service.</span>
          </label>
        </section>

        {needsAddendum ? (
          <section className="mt-5 rounded-2xl bg-crwn-surface border border-crwn-gold/40 p-5">
            <h2 className="text-base font-semibold text-crwn-text mb-2">{LAUNCH_ADDENDUM_TITLE}</h2>
            <p className="text-sm text-crwn-text-secondary leading-relaxed">{LAUNCH_ADDENDUM_INTRO}</p>
            <ol className="mt-3 space-y-2 list-decimal pl-5 text-sm text-crwn-text leading-relaxed">
              {LAUNCH_ADDENDUM_STEPS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <p className="mt-3 text-sm text-crwn-text-secondary leading-relaxed">{LAUNCH_ADDENDUM_OUTRO}</p>
            <label className="flex items-start gap-3 mt-4 cursor-pointer">
              <input type="checkbox" checked={acceptAddendum} onChange={(e) => setAcceptAddendum(e.target.checked)} className="mt-0.5 w-4 h-4 accent-crwn-gold flex-shrink-0" />
              <span className="text-sm text-crwn-text">I understand the rebuild and relaunch only applies if I complete every step above.</span>
            </label>
          </section>
        ) : null}

        <div className="mt-6">
          <label htmlFor="artist-terms-name" className="block text-sm text-crwn-text mb-2">Sign with your full legal name</label>
          <input
            id="artist-terms-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="Full legal name"
            className="w-full rounded-xl bg-crwn-elevated px-4 py-3 text-sm text-crwn-text placeholder:text-crwn-text-secondary outline-none"
          />
        </div>
        {error ? <p className="mt-3 text-sm text-red-400" role="alert">{error}</p> : null}
        <button
          type="button"
          onClick={submit}
          disabled={!ready || busy}
          className="mt-5 w-full py-3 rounded-full font-semibold bg-crwn-gold text-crwn-bg press-scale disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'I agree'}
        </button>
      </div>
    </div>
  );
}
