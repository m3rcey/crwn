'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { smartBack, requestHubReopen } from '@/lib/navigation';
import {
  READINESS_DISCLAIMER,
  type ReadinessAnswer,
  type ReadinessAnswers,
  type ReadinessQuestion,
  type ReadinessResult,
} from '@/lib/royalty/readiness';

// Royalty Readiness Check — ONE QUESTION PER SCREEN, same shell as the artist setup
// wizard (/setup): sticky progress header, one large ask, sticky footer nav.
//
// Why this shape: twelve questions about registrations an artist has mostly never
// heard of is intimidating as a wall. One at a time, in large type, it is twelve
// easy taps. This is the same reasoning that drove the setup wizard to one field
// per screen, and the same rule applies: NEVER stack two asks on one screen.
//
// CRWN's job here is to NOTICE, not to collect. Every action points at the
// organization that actually does the collecting, and nothing on this screen states
// or implies an amount of money owed, because every answer is self-reported and
// unverifiable. See src/lib/royalty/readiness.ts.

const ANSWER_OPTIONS: { value: ReadinessAnswer; label: string; hint?: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unsure', label: 'Not sure', hint: 'Counts as a gap until you confirm it' },
];

const GROUPS = ['Your songs', 'Registration', 'Collection'] as const;

const URGENCY_STYLE: Record<string, { label: string; className: string }> = {
  now: { label: 'Do this first', className: 'bg-crwn-gold/15 text-crwn-gold' },
  soon: { label: 'Soon', className: 'bg-crwn-elevated text-crwn-text' },
  later: { label: 'When you can', className: 'bg-crwn-elevated/60 text-crwn-text-secondary' },
};

export default function RoyaltyReadinessPage() {
  const router = useRouter();
  // F-10: this page is now indexed in the hamburger AccountHub (?from=hub). The wizard has
  // no header X, so the footer Exit and the result's Done are the hub-aware controls: opened
  // from the menu they return to it (same reopen flag as HubBackControl); reached any other
  // way they are the normal smartBack.
  const exitPage = useCallback(() => {
    const fromHub =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('from') === 'hub';
    if (fromHub) requestHubReopen();
    smartBack(router, '/studio');
  }, [router]);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [questions, setQuestions] = useState<ReadinessQuestion[]>([]);
  const [answers, setAnswers] = useState<ReadinessAnswers>({});
  const [result, setResult] = useState<ReadinessResult | null>(null);
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'questions' | 'result'>('questions');

  useEffect(() => {
    let active = true;
    fetch('/api/royalty-readiness')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setEnabled(!!data.enabled);
        setQuestions(data.questions || []);
        setAnswers(data.answers || {});
        if (data.result) {
          setResult(data.result);
          setPhase('result');
        }
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  // Publishing questions only apply to writers, so an artist who does not write is
  // never asked about gaps that are not theirs to close. `writes_music` is the first
  // screen, so answering it reshapes the rest of the flow live.
  const writes = answers.writes_music === 'yes' || answers.writes_music === 'unsure';
  const screens = useMemo(
    () => questions.filter((q) => !(q.publishingOnly && !writes)),
    [questions, writes],
  );

  // The list can shrink under us (answering "no" to writes_music removes screens),
  // so the cursor is clamped rather than trusted.
  const safeIndex = Math.min(index, Math.max(0, screens.length - 1));
  const current = screens[safeIndex];
  const isLast = safeIndex === screens.length - 1;
  const progressPct = screens.length ? Math.round((safeIndex / screens.length) * 100) : 0;

  const save = useCallback(
    async (finalAnswers: ReadinessAnswers) => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch('/api/royalty-readiness', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers: finalAnswers }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error || 'Could not save your answers');
          return;
        }
        setResult(data.result);
        setPhase('result');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch {
        setError('Could not save your answers');
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  // Tapping an answer SELECTS it and nothing else. Advancing is always an explicit
  // Continue, matching /setup.
  //
  // This started out auto-advancing on tap and that was wrong: with three options
  // where "Not sure" is a legitimate answer, the screen changing underneath the
  // finger removes the beat where someone reconsiders, and a mis-tap is committed
  // and gone before they can look at it. Selecting and advancing are two different
  // intents; do not merge them again.
  const selectAnswer = useCallback(
    (value: ReadinessAnswer) => {
      if (!current) return;
      setAnswers((a) => ({ ...a, [current.key]: value }));
    },
    [current],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="max-w-2xl mx-auto page-fade-in">
        <div className="neu-raised rounded-xl p-8 text-center">
          <ShieldCheck className="w-12 h-12 text-crwn-gold/30 mx-auto mb-3" />
          <p className="text-crwn-text font-medium">Not available yet</p>
          <p className="text-sm text-crwn-text-secondary mt-2 max-w-sm mx-auto">
            The Royalty Readiness Check is still being finished. It will show up in your Studio when it opens.
          </p>
          <button
            onClick={() => router.push('/studio')}
            className="mt-5 px-5 py-2 rounded-full font-semibold text-sm bg-crwn-gold text-crwn-bg hover:bg-crwn-gold/90 transition-colors"
          >
            Back to Studio
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'result' && result) {
    return (
      <ResultView
        result={result}
        onRedo={() => {
          setIndex(0);
          setPhase('questions');
          window.scrollTo({ top: 0 });
        }}
        onReset={async () => {
          // Blank slate: drop the saved row AND the local answers, so the check
          // reopens on question 1 with nothing selected.
          await fetch('/api/royalty-readiness', { method: 'DELETE' }).catch(() => {});
          setAnswers({});
          setResult(null);
          setIndex(0);
          setPhase('questions');
          window.scrollTo({ top: 0 });
        }}
        onDone={exitPage}
      />
    );
  }

  if (!current) return null;

  const selected = answers[current.key] ?? null;

  return (
    // Deliberately NOT sticky. /setup can pin its header and footer because it is a
    // full-screen route outside the app shell; this page lives inside (main), where a
    // sticky footer sits under the fixed mobile nav (z-50) and a sticky header sits
    // under the floating hamburger (z-[70]). One question plus three answers fits a
    // phone screen without scrolling, so pinning them would only buy z-index fights.
    <div className="max-w-2xl mx-auto page-fade-in flex flex-col min-h-[70vh]">
      {/* Progress header */}
      <header className="border-b border-crwn-elevated pb-4 mb-2">
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-crwn-gold font-bold tracking-tight">Royalty check</span>
            <span className="text-xs text-crwn-text-secondary">
              {safeIndex + 1} of {screens.length}
            </span>
          </div>

          <div className="h-1.5 rounded-full bg-crwn-elevated overflow-hidden mb-4">
            <div
              className="h-full bg-crwn-gold rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="flex items-center gap-2">
            {GROUPS.map((g, i) => {
              const groupScreens = screens.filter((q) => q.group === g);
              const done = groupScreens.length > 0 && groupScreens.every((q) => !!answers[q.key]);
              const isActive = current.group === g;
              return (
                <div key={g} className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span
                    className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                      done
                        ? 'bg-crwn-gold text-crwn-bg border-crwn-gold'
                        : isActive
                        ? 'border-crwn-gold text-crwn-gold'
                        : 'border-crwn-elevated text-crwn-text-secondary/60'
                    }`}
                  >
                    {done ? <Check className="w-3 h-3" /> : i + 1}
                  </span>
                  <span
                    className={`text-xs font-medium truncate ${
                      isActive ? 'text-crwn-gold' : done ? 'text-crwn-text' : 'text-crwn-text-secondary/60'
                    }`}
                  >
                    {g}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </header>

      {/* One question */}
      <main className="flex-1">
        <div className="py-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-crwn-text leading-snug">{current.label}</h1>
          {current.help && (
            <p className="text-crwn-text-secondary text-base sm:text-lg mt-3 leading-relaxed">{current.help}</p>
          )}

          <div className="mt-8 space-y-3">
            {ANSWER_OPTIONS.map((o) => {
              const isSelected = selected === o.value;
              return (
                <button
                  key={o.value}
                  onClick={() => selectAnswer(o.value)}
                  disabled={saving}
                  className={`w-full text-left rounded-2xl border px-5 py-5 transition-colors disabled:opacity-50 ${
                    isSelected
                      ? 'border-crwn-gold bg-crwn-gold/10'
                      : 'border-crwn-elevated bg-crwn-surface hover:bg-crwn-elevated/40'
                  }`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-xl font-semibold text-crwn-text">{o.label}</span>
                      {o.hint && <span className="block text-sm text-crwn-text-secondary mt-0.5">{o.hint}</span>}
                    </span>
                    {isSelected && <Check className="w-6 h-6 text-crwn-gold shrink-0" />}
                  </span>
                </button>
              );
            })}
          </div>

          {error && <p className="text-sm text-red-400 mt-5">{error}</p>}
        </div>
      </main>

      {/* Footer nav */}
      <footer className="border-t border-crwn-elevated">
        <div className="py-4 flex items-center justify-between gap-3">
          <button
            onClick={() => (safeIndex === 0 ? exitPage() : setIndex((i) => Math.max(0, i - 1)))}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium text-crwn-text-secondary hover:text-crwn-text disabled:opacity-30 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {safeIndex === 0 ? 'Exit' : 'Back'}
          </button>

          <button
            onClick={() => (isLast ? save(answers) : setIndex((i) => i + 1))}
            disabled={!selected || saving}
            className="inline-flex items-center gap-2 bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full hover:bg-crwn-gold/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Checking…' : isLast ? 'See what is not covered' : 'Continue'}
            {!saving && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>
      </footer>
    </div>
  );
}

function ResultView({
  result,
  onRedo,
  onReset,
  onDone,
}: {
  result: ReadinessResult;
  onRedo: () => void;
  onReset: () => void;
  onDone: () => void;
}) {
  const covered = result.actions.length === 0;
  return (
    <div className="max-w-2xl mx-auto page-fade-in pb-8 space-y-5">
      <div className="neu-raised rounded-xl p-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-crwn-text-secondary mb-2">
          Royalty readiness
        </p>
        <p className="text-6xl font-bold text-crwn-gold">{result.score}</p>
        <p className="text-sm text-crwn-text-secondary mt-1">out of 100</p>
        <p className="text-xl font-semibold text-crwn-text mt-4">{result.band}</p>
        <p className="text-base text-crwn-text-secondary mt-2 max-w-md mx-auto leading-relaxed">{result.bandNote}</p>
        {result.unsureCount > 0 && (
          <p className="text-sm text-crwn-text-secondary mt-3 max-w-md mx-auto">
            You were not sure on {result.unsureCount} of them. Not knowing whether a stream is being collected is the
            same as it not being collected, so those are on the list too.
          </p>
        )}
      </div>

      {covered ? (
        <div className="neu-raised rounded-xl p-6 text-center">
          <ShieldCheck className="w-10 h-10 text-crwn-gold mx-auto mb-3" />
          <p className="text-crwn-text font-medium">Every stream that applies to you has somebody on it.</p>
          <p className="text-sm text-crwn-text-secondary mt-2">
            Come back after your next release. A new song is a new registration, and that is where the gaps reopen.
          </p>
        </div>
      ) : (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-crwn-text-secondary mb-3">
            What is not covered, worst first
          </h2>
          <div className="space-y-3">
            {result.actions.map((a) => {
              const urgency = URGENCY_STYLE[a.urgency] ?? URGENCY_STYLE.later;
              return (
                <div key={a.key} className="neu-raised rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="text-crwn-text font-semibold text-lg">{a.title}</p>
                    <span className={`shrink-0 text-[11px] font-semibold px-2 py-1 rounded-full ${urgency.className}`}>
                      {urgency.label}
                    </span>
                  </div>
                  {a.mode === 'verify' && (
                    <p className="text-xs text-crwn-text-secondary/80 mb-2">
                      You were not sure about this one. Confirm it before you set anything up again.
                    </p>
                  )}
                  <p className="text-sm text-crwn-text-secondary leading-relaxed">{a.why}</p>
                  <p className="text-sm text-crwn-text-secondary/80 mt-2">{a.where}</p>
                  {a.links.length > 0 && (
                    <div className="flex flex-wrap gap-3 mt-3">
                      {a.links.map((l) => (
                        <a
                          key={l.url}
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm font-medium text-crwn-gold hover:underline"
                        >
                          {l.label}
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={onDone}
          className="flex-1 px-5 py-3 rounded-full font-semibold bg-crwn-gold text-crwn-bg hover:bg-crwn-gold/90 transition-colors"
        >
          Done
        </button>
        <button
          onClick={onRedo}
          className="flex-1 px-5 py-3 rounded-full font-semibold border border-crwn-elevated text-crwn-text hover:bg-crwn-elevated/40 transition-colors"
        >
          Change my answers
        </button>
      </div>

      {/* Start over wipes the saved check; "Change my answers" keeps it and edits.
          Two different intents, so they are two different controls, and the
          destructive one is the smaller, quieter of the two. */}
      <button
        onClick={onReset}
        className="w-full text-sm text-crwn-text-secondary hover:text-crwn-text transition-colors"
      >
        Start over from scratch
      </button>

      <p className="text-xs text-crwn-text-secondary/70 leading-relaxed">{READINESS_DISCLAIMER}</p>
    </div>
  );
}
