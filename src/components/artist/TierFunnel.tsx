'use client';

// Per-rung funnel: how many people saw a tier, how many started checkout, how many joined.
//
// None of this is new measurement. tier_events has recorded card views and checkout starts for
// months, and src/lib/analytics/tierEvidence.ts already turned them into per-rung counts and
// rates. The only consumer was the Constraint Engine, so the artist could be told WHICH move to
// make next but could never look at the evidence the answer was built from. "Where did people
// drop off" was answerable and unreadable at the same time.
//
// Two rules inherited from tierEvidence and not to be softened here:
//   - A rate is null on a zero denominator, never 0. "Nobody looked at this rung" and "everybody
//     looked and nobody bought" are opposite diagnoses with opposite fixes, so a missing rate
//     renders as "no data", never as 0%.
//   - A free rung records no checkout start, on purpose, because it has no checkout. Its
//     checkout column reads "n/a" rather than implying every viewer abandoned.

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface EvidenceRow {
  tierId: string;
  tierName: string;
  priceCents: number;
  views: number;
  checkoutStarts: number;
  joins: number;
  activeMembers: number;
  viewToCheckout: number | null;
  checkoutToPaid: number | null;
  viewToPaid: number | null;
}

interface Evidence {
  tiers: EvidenceRow[];
  limitations: { interactionDataAvailable: boolean };
}

/** A rate, or an explicit "no data". Never 0% standing in for an empty denominator. */
function Rate({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-crwn-text-secondary">no data</span>;
  }
  return <span className="text-crwn-text">{Math.round(value * 100)}%</span>;
}

export default function TierFunnel({ artistId }: { artistId: string }) {
  const [data, setData] = useState<Evidence | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/artist/tier-evidence?artistId=${artistId}`);
      if (!res.ok) return;
      setData(await res.json());
    } catch {
      /* analytics must never break the page */
    } finally {
      setLoading(false);
    }
  }, [artistId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated mb-6 flex justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-crwn-text-secondary" />
      </div>
    );
  }

  if (!data || data.tiers.length === 0) return null;

  return (
    <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated mb-6">
      <p className="text-sm text-crwn-text-secondary mb-1">Where people stop</p>
      <p className="text-xs text-crwn-text-secondary mb-3 opacity-80">
        Last 30 days. A rung people look at but never start is a pricing or wording problem. A rung
        people start and never finish is a checkout problem.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-crwn-text-secondary">
              <th className="px-2 py-2 text-left font-normal">Tier</th>
              <th className="px-2 py-2 text-right font-normal">Saw it</th>
              <th className="px-2 py-2 text-right font-normal">Started</th>
              <th className="px-2 py-2 text-right font-normal">Joined</th>
              <th className="px-2 py-2 text-right font-normal">Saw to started</th>
              <th className="px-2 py-2 text-right font-normal">Started to joined</th>
            </tr>
          </thead>
          <tbody>
            {data.tiers.map((t) => {
              const isFree = t.priceCents === 0;
              return (
                <tr key={t.tierId} className="border-t border-crwn-elevated">
                  <td className="px-2 py-2 text-crwn-text">
                    {t.tierName}
                    <span className="text-xs text-crwn-text-secondary ml-2">
                      {isFree ? 'free' : `$${(t.priceCents / 100).toFixed(0)}`}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right text-crwn-text">{t.views}</td>
                  <td className="px-2 py-2 text-right text-crwn-text">
                    {isFree ? <span className="text-crwn-text-secondary">n/a</span> : t.checkoutStarts}
                  </td>
                  <td className="px-2 py-2 text-right text-crwn-gold font-medium">{t.joins}</td>
                  <td className="px-2 py-2 text-right">
                    {isFree ? <span className="text-crwn-text-secondary">n/a</span> : <Rate value={t.viewToCheckout} />}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {isFree ? <span className="text-crwn-text-secondary">n/a</span> : <Rate value={t.checkoutToPaid} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!data.limitations.interactionDataAvailable && (
        <p className="text-xs text-crwn-text-secondary mt-3">
          View counts are not available for this range yet, so the rates above stay empty rather
          than reporting a zero nobody measured.
        </p>
      )}
    </div>
  );
}
