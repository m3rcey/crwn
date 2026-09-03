'use client';

// "Test it": let's make sure this works before you send people here.
//
// CRWN checks every piece it can truthfully observe through the one readiness module the
// roadmap and the Quest Engine also read, and names the flow that fixes a failing one. The
// two observations only the artist can make are separate, visibly manual, and recorded by
// completing the one manual quest in the chain (founder decision D5). That acknowledgement
// never stands in for state: the roadmap ANDs it with the machine checks on every read.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X as XIcon, Minus } from 'lucide-react';
import { useToast } from '@/components/shared/Toast';
import type { FunnelCheck } from '@/lib/funnelReadiness';
import { guidedFlowHref } from '@/lib/guidedSetup/flows';
import { FUNNEL_TEST_MANUAL_CHECKS, FUNNEL_TEST_QUEST_KEY } from '@/lib/guidedSetup/testQuest';
import { guidedSetupTelemetry } from '@/lib/guidedSetup/telemetry';
import type { GuidedFlowProps } from '../types';
import { GuidedShell, Why } from '../GuidedShell';

interface Readiness {
  checks: FunnelCheck[];
  readyForTraffic: boolean;
  funnel: { id: string; status: string; publicToken: string | null; url: string | null } | null;
}

const REQUIREMENT_COPY: Record<FunnelCheck['requirement'], string> = {
  launch: 'Required',
  truth: 'Required to sell honestly',
  recommended: 'Recommended',
  optional: 'Optional',
};

export default function TestFlow({ context, entry }: GuidedFlowProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [r, setR] = useState<Readiness | null>(null);
  const [acks, setAcks] = useState<Record<string, boolean>>({});
  const [questId, setQuestId] = useState<string | null>(null);
  const [questDone, setQuestDone] = useState(false);
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [ready, quests] = await Promise.all([
      fetch('/api/funnel-readiness').then((x) => (x.ok ? x.json() : null)).catch(() => null),
      fetch('/api/quests', { cache: 'no-store' }).then((x) => (x.ok ? x.json() : null)).catch(() => null),
    ]);
    setR(ready);
    const inst = (quests?.quests ?? []).find((q: { template_key: string }) => q.template_key === FUNNEL_TEST_QUEST_KEY);
    setQuestId(inst?.id ?? null);
    setQuestDone(inst?.status === 'completed');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const steps = [
    { id: 'machine', group: 'CRWN checks' },
    { id: 'manual', group: 'You check' },
  ];
  const machineOk = !!r?.readyForTraffic;
  const allAcked = FUNNEL_TEST_MANUAL_CHECKS.every((c) => acks[c.key]);

  const finish = async () => {
    if (questDone) {
      router.push(entry.returnTo);
      return;
    }
    if (!questId) {
      showToast('CRWN has not handed you this step yet. Open Rise Mode once and come back.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/quests/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questId }),
      });
      if (!res.ok) {
        showToast('Could not record the test. Try again.', 'error');
        return;
      }
      guidedSetupTelemetry.completed({ flow: 'test', artistId: context.artistId, step: 2, totalSteps: 2 });
      showToast('Tested. Your funnel is ready for people.', 'success');
      router.push(entry.returnTo);
    } finally {
      setSaving(false);
    }
  };

  if (!r) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-crwn-gold border-t-transparent rounded-full animate-spin" aria-label="Loading" />
      </div>
    );
  }

  const icon = (c: FunnelCheck) =>
    c.state === 'pass' ? <Check className="w-4 h-4 text-crwn-gold" /> : c.state === 'skip' ? <Minus className="w-4 h-4 text-crwn-text-secondary" /> : <XIcon className="w-4 h-4 text-red-400" />;

  return (
    <GuidedShell
      flow="test"
      artistId={context.artistId}
      returnTo={entry.returnTo}
      steps={steps}
      index={index}
      title={index === 0 ? "Let's make sure this works before you send people here" : 'Two things only you can check'}
      subtitle={index === 0 ? 'CRWN checked every piece it can see. Anything red opens the flow that fixes it.' : 'CRWN cannot claim your own link or run a card without creating fake fans, so these are yours.'}
      onBack={index > 0 ? () => setIndex(0) : undefined}
      onContinue={() => (index === 0 ? setIndex(1) : void finish())}
      continueLabel={index === 0 ? (machineOk ? 'Continue' : 'Continue anyway') : questDone ? 'Back to Rise Mode' : 'I checked both'}
      continueDisabled={index === 1 && !questDone && !(machineOk && allAcked)}
      continueLoading={saving}
    >
      {index === 0 && (
        <div className="space-y-2">
          {r.checks.map((c) => (
            <div key={c.key} className="rounded-xl border border-crwn-elevated p-3 flex items-start gap-3">
              <span className="mt-0.5 shrink-0">{icon(c)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-crwn-text">{c.label}</p>
                  <span className="text-[11px] text-crwn-text-secondary shrink-0">{REQUIREMENT_COPY[c.requirement]}</span>
                </div>
                <p className="text-xs text-crwn-text-secondary mt-0.5">{c.fact}</p>
                {c.state === 'fail' && (
                  <button
                    type="button"
                    onClick={() => router.push(`${guidedFlowHref(c.flow)}?returnTo=${encodeURIComponent(`${guidedFlowHref('test')}?returnTo=${encodeURIComponent(entry.returnTo)}`)}`)}
                    className="mt-1.5 text-xs text-crwn-gold press-scale"
                  >
                    Fix it
                  </button>
                )}
              </div>
            </div>
          ))}
          {!machineOk && <Why>Red items marked Required or Required to sell honestly are what CRWN needs before it calls your funnel tested. Recommended and Optional never block you.</Why>}
        </div>
      )}

      {index === 1 && (
        <div className="space-y-3">
          {r.funnel?.url && (
            <div className="rounded-xl bg-crwn-elevated p-3">
              <p className="text-xs uppercase tracking-wide text-crwn-text-secondary mb-1">Your link</p>
              <p className="text-sm text-crwn-text break-all">{r.funnel.url}</p>
            </div>
          )}
          {FUNNEL_TEST_MANUAL_CHECKS.map((c) => (
            <label key={c.key} className="rounded-xl border border-crwn-elevated p-3 flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className="mt-1" checked={!!acks[c.key] || questDone} disabled={questDone} onChange={(e) => setAcks((a) => ({ ...a, [c.key]: e.target.checked }))} />
              <span>
                <span className="block text-sm text-crwn-text">{c.label}</span>
                <span className="block text-xs text-crwn-text-secondary mt-0.5">{c.why}</span>
              </span>
            </label>
          ))}
          {!machineOk && !questDone && <Why>Finish the red items first. Your word records that you looked; it never stands in for a check CRWN can make.</Why>}
          {questDone && <Why>Already recorded. If something above changed since, CRWN reopens this step on its own.</Why>}
        </div>
      )}
    </GuidedShell>
  );
}
