'use client';

// Promise to Delivery: "what do my members need from me?"
//
// Lives on /account/tiers, under the ladder the artist edits, because that is where the
// promise is made (founder decision D4, 2026-09-03). One row per benefit on the tier that owns
// it: the fan-facing promise, a readiness chip, one plain fact, and ONE action that opens the
// existing creation surface with the rung already known. Not a dashboard, not a second
// priority engine: it reads /api/tier-benefits/readiness and renders it.
//
// Built as a component so it can move if evidence ever shows a better home.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCw } from 'lucide-react';
import { STATE_COPY, type DeliveryRow, type ReadinessState } from '@/lib/benefitReadiness';

interface Payload {
  artistSlug: string | null;
  tiers: { id: string; name: string; price: number }[];
  rows: DeliveryRow[];
}

const CHIP: Record<ReadinessState, string> = {
  needs_setup: 'bg-crwn-error/15 text-crwn-error',
  nothing_yet: 'bg-crwn-elevated text-crwn-text-secondary',
  upcoming: 'bg-crwn-gold/15 text-crwn-gold',
  active: 'bg-crwn-gold text-crwn-bg',
  ready: 'bg-crwn-gold/15 text-crwn-gold',
  manual: 'bg-crwn-elevated text-crwn-text-secondary',
  retired: 'bg-crwn-elevated text-crwn-text-secondary',
};

export function PromiseDeliveryPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch('/api/tier-benefits/readiness', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 text-crwn-text-secondary text-sm py-4">
        <Loader2 className="w-4 h-4 animate-spin" /> Checking what your members are owed
      </div>
    );
  }
  if (failed || !data) {
    return (
      <p className="text-crwn-text-secondary text-sm py-4">
        Could not check your promises right now.{' '}
        <button type="button" onClick={load} className="text-crwn-gold hover:underline">
          Try again
        </button>
      </p>
    );
  }
  if (data.rows.length === 0) {
    return (
      <div className="bg-crwn-surface border border-crwn-elevated rounded-xl p-5">
        <h3 className="text-lg font-semibold text-crwn-text">What do my members need from me?</h3>
        <p className="text-sm text-crwn-text-secondary mt-1">
          Nothing yet. Pick what fans get when you edit a tier, and each promise shows up here with
          whether it is ready and the one tap that keeps it.
        </p>
      </div>
    );
  }

  const byTier = data.tiers
    .map((t) => ({ tier: t, rows: data.rows.filter((r) => r.tierId === t.id) }))
    .filter((g) => g.rows.length > 0);
  const needsWork = data.rows.filter((r) => r.state === 'needs_setup' || r.state === 'nothing_yet').length;

  return (
    <div className="bg-crwn-surface border border-crwn-elevated rounded-xl p-5" data-tour="promise-delivery">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-crwn-text">What do my members need from me?</h3>
          <p className="text-sm text-crwn-text-secondary mt-1">
            {needsWork > 0
              ? `${needsWork} ${needsWork === 1 ? 'promise has' : 'promises have'} nothing behind ${needsWork === 1 ? 'it' : 'them'} yet. A member who paid for it is waiting.`
              : 'Every promise CRWN can check has something behind it.'}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          aria-label="Refresh"
          className="p-2 rounded-full text-crwn-text-secondary hover:text-crwn-gold"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="mt-4 space-y-5">
        {byTier.map(({ tier, rows }) => (
          <div key={tier.id}>
            <div className="flex items-baseline gap-2 mb-2">
              <h4 className="font-semibold text-crwn-gold">{tier.name}</h4>
              <span className="text-xs text-crwn-text-secondary">
                {tier.price > 0 ? `$${(tier.price / 100).toFixed(2)}/mo` : 'Free'}
              </span>
            </div>
            <ul className="divide-y divide-crwn-elevated">
              {rows.map((r) => (
                <li key={`${r.tierId}:${r.benefit}`} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-crwn-text">{r.label}</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${CHIP[r.state]}`}>{STATE_COPY[r.state]}</span>
                      {r.scheduled && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-crwn-elevated text-crwn-text-secondary">
                          On your calendar
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-crwn-text-secondary mt-0.5">
                      {r.fact}
                      {r.servesTierNames.length > 0 && r.support !== 'retired' ? ` Also serves ${r.servesTierNames.join(' and ')}.` : ''}
                    </p>
                  </div>
                  {r.fastAction ? (
                    <Link
                      prefetch
                      href={r.fastAction.href}
                      className="shrink-0 text-sm font-semibold px-4 py-2 rounded-full bg-crwn-gold text-crwn-bg hover:bg-crwn-gold/90"
                    >
                      {r.fastAction.label}
                    </Link>
                  ) : r.state === 'retired' ? (
                    <span className="shrink-0 text-xs text-crwn-text-secondary">Remove it from the tier, or replace it.</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
