'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { OptionSelect } from '@/components/ui/OptionSelect';
import { smartBack } from '@/lib/navigation';
import {
  READINESS_DISCLAIMER,
  type ReadinessAnswer,
  type ReadinessAnswers,
  type ReadinessQuestion,
  type ReadinessResult,
} from '@/lib/royalty/readiness';

// Royalty Readiness Check.
//
// CRWN's job here is to NOTICE, not to collect. Every action points at the
// organization that actually does the collecting. Nothing on this screen states
// or implies an amount of money owed, because every answer is self-reported and
// unverifiable. See src/lib/royalty/readiness.ts for the reasoning.

const ANSWER_OPTIONS: { value: ReadinessAnswer; label: string; hint?: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unsure', label: 'Not sure', hint: 'Counts as a gap until you confirm it' },
];

const URGENCY_STYLE: Record<string, { label: string; className: string }> = {
  now: { label: 'Do this first', className: 'bg-crwn-gold/15 text-crwn-gold' },
  soon: { label: 'Soon', className: 'bg-crwn-elevated text-crwn-text' },
  later: { label: 'When you can', className: 'bg-crwn-elevated/60 text-crwn-text-secondary' },
};

export default function RoyaltyReadinessPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [questions, setQuestions] = useState<ReadinessQuestion[]>([]);
  const [answers, setAnswers] = useState<ReadinessAnswers>({});
  const [result, setResult] = useState<ReadinessResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/royalty-readiness')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setEnabled(!!data.enabled);
        setQuestions(data.questions || []);
        setAnswers(data.answers || {});
        setResult(data.result || null);
        setShowResult(!!data.result);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  // Publishing questions only apply to writers, so an artist who does not write
  // never sees a list of gaps that are not theirs to close.
  const writes = answers.writes_music === 'yes' || answers.writes_music === 'unsure';
  const visible = useMemo(
    () => questions.filter((q) => !(q.publishingOnly && !writes)),
    [questions, writes],
  );
  const answeredAll = visible.length > 0 && visible.every((q) => !!answers[q.key]);

  const groups = useMemo(() => {
    const out: { group: string; items: ReadinessQuestion[] }[] = [];
    for (const q of visible) {
      const existing = out.find((g) => g.group === q.group);
      if (existing) existing.items.push(q);
      else out.push({ group: q.group, items: [q] });
    }
    return out;
  }, [visible]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/royalty-readiness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Could not save your answers');
        return;
      }
      setResult(data.result);
      setShowResult(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError('Could not save your answers');
    } finally {
      setSaving(false);
    }
  }, [answers]);

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

  return (
    <div className="max-w-2xl mx-auto page-fade-in pb-8">
      <button
        onClick={() => smartBack(router, '/studio')}
        className="flex items-center gap-2 text-sm text-crwn-text-secondary hover:text-crwn-text mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-crwn-text mb-2">Royalty Readiness Check</h1>
        <p className="text-sm text-crwn-text-secondary">
          Your music can earn in places your distributor never touches. If nobody is registered to collect
          those streams, that money is not waiting for you, it goes somewhere else. Twelve questions to find
          out which ones have nobody assigned to them.
        </p>
      </div>

      {showResult && result && (
        <ResultPanel result={result} onEdit={() => setShowResult(false)} />
      )}

      {!showResult && (
        <>
          <div className="space-y-6 stagger-fade-in">
            {groups.map((g) => (
              <div key={g.group}>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-crwn-text-secondary mb-3">
                  {g.group}
                </h2>
                <div className="space-y-4">
                  {g.items.map((q) => (
                    <div key={q.key} className="neu-raised rounded-xl p-4">
                      <p className="text-crwn-text font-medium mb-1">{q.label}</p>
                      {q.help && <p className="text-sm text-crwn-text-secondary mb-3">{q.help}</p>}
                      <OptionSelect
                        options={ANSWER_OPTIONS}
                        value={answers[q.key] ?? null}
                        onChange={(v) => setAnswers((a) => ({ ...a, [q.key]: v as ReadinessAnswer }))}
                        placeholder="Choose one"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-red-400 mt-4">{error}</p>}

          <button
            onClick={save}
            disabled={saving || Object.keys(answers).length === 0}
            className="w-full mt-6 px-5 py-3 rounded-full font-semibold bg-crwn-gold text-crwn-bg hover:bg-crwn-gold/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {answeredAll ? 'See what is not covered' : 'Save what I have so far'}
          </button>

          <p className="text-xs text-crwn-text-secondary/70 mt-4 leading-relaxed">{READINESS_DISCLAIMER}</p>
        </>
      )}
    </div>
  );
}

function ResultPanel({ result, onEdit }: { result: ReadinessResult; onEdit: () => void }) {
  const covered = result.actions.length === 0;
  return (
    <div className="space-y-5">
      <div className="neu-raised rounded-xl p-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-crwn-text-secondary mb-2">
          Royalty readiness
        </p>
        <p className="text-5xl font-bold text-crwn-gold">{result.score}</p>
        <p className="text-sm text-crwn-text-secondary mt-1">out of 100</p>
        <p className="text-lg font-semibold text-crwn-text mt-4">{result.band}</p>
        <p className="text-sm text-crwn-text-secondary mt-2 max-w-md mx-auto">{result.bandNote}</p>
        {result.unsureCount > 0 && (
          <p className="text-sm text-crwn-text-secondary mt-3 max-w-md mx-auto">
            You were not sure on {result.unsureCount} of them. Not knowing whether a stream is being collected
            is the same as it not being collected, so those are on the list too.
          </p>
        )}
      </div>

      {covered ? (
        <div className="neu-raised rounded-xl p-6 text-center">
          <ShieldCheck className="w-10 h-10 text-crwn-gold mx-auto mb-3" />
          <p className="text-crwn-text font-medium">Every stream that applies to you has somebody on it.</p>
          <p className="text-sm text-crwn-text-secondary mt-2">
            Come back after your next release. A new song is a new registration, and that is where the gaps
            reopen.
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
                    <p className="text-crwn-text font-medium">{a.title}</p>
                    <span className={`shrink-0 text-[11px] font-semibold px-2 py-1 rounded-full ${urgency.className}`}>
                      {urgency.label}
                    </span>
                  </div>
                  {a.mode === 'verify' && (
                    <p className="text-xs text-crwn-text-secondary/80 mb-2">
                      You were not sure about this one. Confirm it before you set anything up again.
                    </p>
                  )}
                  <p className="text-sm text-crwn-text-secondary">{a.why}</p>
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

      <button
        onClick={onEdit}
        className="w-full px-5 py-3 rounded-full font-semibold border border-crwn-elevated text-crwn-text hover:bg-crwn-elevated/40 transition-colors"
      >
        Change my answers
      </button>

      <p className="text-xs text-crwn-text-secondary/70 leading-relaxed">{READINESS_DISCLAIMER}</p>
    </div>
  );
}
