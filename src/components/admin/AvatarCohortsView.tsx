'use client';

// Admin: side-by-side comparison of the four sub-avatar cohorts (docs/SUB_AVATARS.md).
// Realized metrics only; small samples and unmeasured metrics are labeled, never zero-filled.

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react';

interface StageRow {
  stage: string;
  label: string;
  count: number;
}

interface CohortReport {
  avatar: string;
  label: string;
  entryRoute: string | null;
  stages: StageRow[];
  accountsCreated: number;
  matureCohorts: { d30: number; d60: number; d90: number };
  firstPaidArtists: number;
  medianDaysToFirstPaid: number | null;
  gmvCapturedCents: number;
  genreBreakdown: GenreRow[];
  constraint: {
    constraintId: string;
    severity: string;
    confidence: string;
    explanation: string;
    recommendedInvestigation: string;
  } | null;
  sampleWarning: string | null;
}

interface GenreRow {
  genre: string;
  label: string;
  identities: number;
  firstPaidArtists: number;
  gmvCapturedCents: number;
  firstPaidRate: number | null;
}

interface Report {
  taxonomyVersion: string;
  since: string;
  days: number;
  genreFilter: string | null;
  truncated: boolean;
  cohorts: CohortReport[];
  attributionNote?: string;
  genreNote?: string;
  notMeasured: string[];
}

const usd = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;

export default function AvatarCohortsView() {
  const [report, setReport] = useState<Report | null>(null);
  const [days, setDays] = useState(90);
  const [genre, setGenre] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/avatar-cohorts?days=${days}${genre ? `&genre=${genre}` : ''}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [days, genre]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-crwn-text">Sub-avatar cohorts</h2>
          <p className="text-sm text-crwn-text-secondary">
            The four acquisition journeys compared on the same spine, all running the one all-in-one calculator.
            Realized numbers only; grouping is by the funnel they arrived through under{' '}
            {report?.taxonomyVersion ?? 'subAvatar@2'}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-crwn-surface-solid border border-crwn-elevated rounded-full px-3 py-1.5 text-sm text-crwn-text"
          >
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 180 days</option>
            <option value={365}>Last year</option>
          </select>
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="bg-crwn-surface border border-crwn-elevated rounded-full px-3 py-1.5 text-sm text-crwn-text"
          >
            <option value="">All genres</option>
            <option value="hiphop">Hip-hop only</option>
            <option value="rnb">R&B only</option>
            <option value="other">Other genre only</option>
            <option value="unknown">Not stated yet</option>
          </select>
          <button
            onClick={() => void load()}
            className="p-2 rounded-full hover:bg-crwn-elevated text-crwn-text-secondary"
            aria-label="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-crwn-text-secondary text-sm py-10 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading cohorts
        </div>
      )}
      {error && <div className="text-sm text-red-400">{error}</div>}

      {report?.truncated && (
        <div className="text-xs text-amber-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          The window exceeded the row cap, so counts are a truncated sample, not the full period.
        </div>
      )}

      {!loading && report && (
        <div className="grid gap-4 lg:grid-cols-2">
          {report.cohorts.map((c) => (
            <div key={c.avatar} className="bg-crwn-surface-solid border border-crwn-elevated rounded-2xl p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-crwn-text">{c.label}</h3>
                  {c.entryRoute && <p className="text-xs text-crwn-text-secondary break-all">{c.entryRoute}</p>}
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-crwn-gold">{usd(c.gmvCapturedCents)}</div>
                  <div className="text-xs text-crwn-text-secondary">captured, refund-netted</div>
                </div>
              </div>

              {c.sampleWarning && <div className="text-xs text-amber-400">{c.sampleWarning}</div>}

              <div className="space-y-1">
                {c.stages.map((s, i) => {
                  const prev = i > 0 ? c.stages[i - 1].count : null;
                  const rate = prev && prev > 0 ? Math.round((s.count / prev) * 100) : null;
                  const max = Math.max(1, c.stages[0]?.count ?? 1);
                  return (
                    <div key={s.stage} className="flex items-center gap-2 text-xs">
                      <span className="w-36 shrink-0 text-crwn-text-secondary truncate">{s.label}</span>
                      <div className="flex-1 h-2 bg-crwn-elevated rounded-full overflow-hidden">
                        <div
                          className="h-full bg-crwn-gold/70"
                          style={{ width: `${Math.min(100, (s.count / max) * 100)}%` }}
                        />
                      </div>
                      <span className="w-14 text-right text-crwn-text tabular-nums">{s.count.toLocaleString('en-US')}</span>
                      <span className="w-12 text-right text-crwn-text-secondary tabular-nums">
                        {rate !== null ? `${rate}%` : ''}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-crwn-elevated rounded-xl p-2">
                  <div className="text-crwn-text font-semibold">{c.firstPaidArtists}</div>
                  <div className="text-crwn-text-secondary">first paid fans</div>
                </div>
                <div className="bg-crwn-elevated rounded-xl p-2">
                  <div className="text-crwn-text font-semibold">
                    {c.medianDaysToFirstPaid !== null ? `${Math.round(c.medianDaysToFirstPaid)}d` : 'n/a'}
                  </div>
                  <div className="text-crwn-text-secondary">median to first paid</div>
                </div>
                <div className="bg-crwn-elevated rounded-xl p-2">
                  <div className="text-crwn-text font-semibold">
                    {c.matureCohorts.d30}/{c.matureCohorts.d60}/{c.matureCohorts.d90}
                  </div>
                  <div className="text-crwn-text-secondary">mature 30/60/90d</div>
                </div>
              </div>

              {c.genreBreakdown?.some((g) => g.identities > 0) && (
                <div className="space-y-1">
                  <div className="text-[11px] uppercase tracking-wide text-crwn-text-secondary">Who this funnel brought</div>
                  {c.genreBreakdown
                    .filter((g) => g.identities > 0)
                    .map((g) => (
                      <div key={g.genre} className="flex items-center gap-2 text-xs">
                        <span className="w-24 shrink-0 text-crwn-text-secondary">{g.label}</span>
                        <span className="w-10 text-right text-crwn-text tabular-nums">{g.identities}</span>
                        <span className="flex-1 text-crwn-text-secondary">
                          {g.firstPaidRate !== null
                            ? `${Math.round(g.firstPaidRate * 100)}% reached a first paid fan`
                            : 'too few to rate'}
                        </span>
                        <span className="text-crwn-text tabular-nums">{usd(g.gmvCapturedCents)}</span>
                      </div>
                    ))}
                </div>
              )}

              {c.constraint && (
                <div className="border border-crwn-elevated rounded-xl p-3 text-xs space-y-1">
                  <div className="text-crwn-text font-medium">
                    Largest observed drop ({c.constraint.severity}, {c.constraint.confidence} confidence)
                  </div>
                  <div className="text-crwn-text-secondary">{c.constraint.explanation}</div>
                  <div className="text-crwn-text-secondary">{c.constraint.recommendedInvestigation}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && report?.attributionNote && (
        <p className="text-xs text-crwn-text-secondary">{report.attributionNote}</p>
      )}
      {!loading && report?.genreNote && <p className="text-xs text-crwn-text-secondary">{report.genreNote}</p>}

      {!loading && report && report.notMeasured.length > 0 && (
        <div className="text-xs text-crwn-text-secondary space-y-1">
          <div className="font-medium text-crwn-text">Not yet measured at cohort grain (named, never zero-filled):</div>
          <ul className="list-disc pl-5 space-y-0.5">
            {report.notMeasured.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
