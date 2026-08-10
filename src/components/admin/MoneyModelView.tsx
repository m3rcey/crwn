'use client';

// Money Model: the internal First Revenue Launch measurement system.
//
// Answers one question: is the monetization strategy producing profitable,
// repeatable customer economics? Engagement terms, founder labor, guarantee
// evidence, revenue by source, and 30-day contribution margin per artist,
// with explicit unknown states. A missing input renders as missing with its
// name, never as a zero.
//
// Admin-only: every route this fetches is gated by requireAdmin server-side.

import { useCallback, useEffect, useState } from 'react';
import {
  Banknote, CheckCircle2, Circle, ClipboardList, Loader2, Plus,
  RefreshCw, Route, ShieldCheck, Trash2, XCircle,
} from 'lucide-react';
import { FRL_WORK_CATEGORIES } from '@/lib/frl/economics';

// ---- shared shapes (mirrors the API; kept loose on purpose) -----------------

interface MoneyMetric {
  cents: number | null;
  state: 'complete' | 'modeled' | 'missing';
  missing: string[];
  note?: string;
}

interface EngagementRow {
  id: string;
  artist_id: string;
  engagement_type: string;
  status: string;
  started_on: string | null;
  target_launch_on: string | null;
  actual_launch_on: string | null;
  guarantee_eligible_on: string | null;
  completed_on: string | null;
  notes: string | null;
  fee_agreed_cents: number | null;
  fee_collected_cents: number | null;
  discount_cents: number | null;
  discount_reason: string | null;
  required_plan: string | null;
  invoice_ref: string | null;
  payment_status: string;
  acquisition_cost_cents: number | null;
  acquisition_cost_note: string | null;
  deliverables: string | null;
  exclusions: string | null;
  migration_scope: string | null;
  revision_allowance: number | null;
  revisions_used: number;
  support_period_days: number | null;
  additional_work_notes: string | null;
  case_study_consent: string;
  testimonial_consent: string;
  performance_data_consent: string;
  consent_on: string | null;
  consent_notes: string | null;
  artistSlug?: string | null;
  artistName?: string | null;
  platformTier?: string | null;
}

interface Detail {
  engagement: EngagementRow;
  artist: {
    slug: string | null; displayName: string | null; platformTier: string | null;
    platformSubscriptionStatus: string | null; recommendedPlan: string | null;
    projectedMonthlyGmvCents: number | null;
  };
  economics: {
    serviceWindow30: { startIso: string; endIso: string; elapsed: boolean } | null;
    guaranteeWindow: { startIso: string; endIso: string; elapsed: boolean } | null;
    guaranteeDeadlineOn: string | null;
    artist: {
      gmv7: MoneyMetric; gmv30: MoneyMetric; gmvLifetime: MoneyMetric; net30: MoneyMetric;
      firstPaidAt: string | null; daysToFirstPaid: number | null; paidMemberCount: number | null;
    };
    crwn: {
      implementationCollected: MoneyMetric; platformFees7: MoneyMetric; platformFees30: MoneyMetric;
      platformFeesLifetime: MoneyMetric; planSubscription30: MoneyMetric;
      revenue7: MoneyMetric; revenue30: MoneyMetric; revenueLifetime: MoneyMetric;
    };
    costs: {
      recordedLabor30: MoneyMetric; recordedLaborLifetime: MoneyMetric;
      laborMinutes30: number; laborMinutesLifetime: number;
      externalCosts30: MoneyMetric; externalCostsLifetime: MoneyMetric;
      acquisition: MoneyMetric; directCost30: MoneyMetric; directCostLifetime: MoneyMetric;
    };
    margin: {
      contribution30: MoneyMetric; contributionPct30: number | null; contributionLifetime: MoneyMetric;
      revenuePerFulfillmentHourCents: number | null;
      cacPaybackStatus: 'paid_back' | 'not_yet' | 'unknown'; cacPaybackDays: number | null;
    };
    diagnostic: {
      replicationCostCents: number | null; canFundOneMore: boolean | null; canFundTwoMore: boolean | null;
      missingInputs: string[];
      topRevenueSource: { key: string; label: string; cents: number } | null;
      topCostSource: { key: string; label: string; cents: number } | null;
    };
  };
  guarantee: {
    status: 'pending' | 'eligible' | 'achieved';
    requiredDone: number; requiredTotal: number;
    conditions: Array<{ key: string; label: string; role: string; done: boolean; current: number; target: number }>;
  };
  checklist: Array<{
    key: string; label: string; kind: 'derived' | 'manual'; evidence?: string;
    status: string; current: number | null; target: number | null;
    completedOn: string | null; note: string | null; minutesSpent: number | null;
  }>;
  workEntries: Array<{
    id: string; category: string; work_on: string; minutes: number;
    note: string | null; external_cost_cents: number | null;
  }>;
  assumptions: { founderHourlyCents: number | null };
  attribution: {
    dims: Record<string, string | null> | null;
    timeline: Array<{ stage: string; occurredAt: string; calculator: string | null; campaign: string | null; video: string | null }>;
    calculators: string[];
    subAvatar: { id: string; source: string; confidence: string | null } | null;
    revenueModel: { model: string; isDefault: boolean; confidence: string } | null;
  };
}

interface CohortRow {
  engagementId: string; artistName: string | null; artistSlug: string | null; status: string;
  feeAgreedCents: number | null; feeCollectedCents: number | null; discountCents: number | null;
  laborMinutes: number; deliveryDays: number | null;
  contactsImported: number | null; provenBuyers: number | null;
  firstPaidAt: string | null; daysToFirstPaid: number | null;
  gmv30: MoneyMetric; implementation30: MoneyMetric; planSubscription30: MoneyMetric;
  platformFees30: MoneyMetric; directCost30: MoneyMetric; contribution30: MoneyMetric;
  guaranteeStatus: string; platformTier: string | null;
  consent: { caseStudy: string; testimonial: string; performanceData: string };
  diagnostic: Detail['economics']['diagnostic'];
}

interface Aggregates {
  cohortSize: number;
  daysToFirstPaid: { mean: number | null; median: number | null; sampleSize: number };
  laborMinutes: { mean: number | null; median: number | null; sampleSize: number };
  implementationCollectedCents: { mean: number | null; median: number | null; sampleSize: number };
  contribution30Cents: { mean: number | null; median: number | null; sampleSize: number };
  guaranteeAchievedRate: { achieved: number; known: number };
  paidPlanRate: { onPaid: number; known: number };
  completeInputsCount: number;
}

// ---- small helpers ----------------------------------------------------------

const usd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hrs = (minutes: number) => `${(minutes / 60).toFixed(1)}h`;
const dollarsToCents = (v: string): number | null => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};

function Metric({ m, window: win }: { m: MoneyMetric | undefined; window?: string }) {
  if (!m) return <span className="text-crwn-text-secondary">n/a</span>;
  if (m.cents === null) {
    return (
      <span className="text-amber-400 text-xs" title={m.missing.join('; ')}>
        missing: {m.missing.join(', ') || 'unknown input'}
      </span>
    );
  }
  return (
    <span>
      {usd(m.cents)}
      {win && <span className="text-crwn-text-secondary text-xs ml-1">{win}</span>}
      {m.state === 'modeled' && (
        <span className="ml-1 text-xs text-sky-400" title={m.note || 'Modeled: no invoice records exist for platform plans'}>
          modeled
        </span>
      )}
      {m.note && m.state !== 'modeled' && (
        <span className="ml-1 text-xs text-crwn-text-secondary" title={m.note}>*</span>
      )}
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  const tone =
    status === 'verified' || status === 'done' || status === 'achieved' ? 'text-green-400'
    : status === 'not_met' || status === 'pending' ? 'text-crwn-text-secondary'
    : status === 'not_verifiable' ? 'text-amber-400'
    : status === 'eligible' ? 'text-crwn-gold'
    : 'text-crwn-text-secondary';
  return <span className={`text-xs font-medium ${tone}`}>{status.replace(/_/g, ' ')}</span>;
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-crwn-surface-solid rounded-xl border border-crwn-elevated p-4 mb-4">
      <h3 className="text-sm font-semibold text-crwn-text flex items-center gap-2 mb-3">
        {icon}{title}
      </h3>
      {children}
    </div>
  );
}

const inputCls = 'bg-crwn-elevated text-crwn-text text-sm rounded-lg px-2 py-1 border border-transparent focus:border-crwn-gold outline-none';
const btnCls = 'px-3 py-1.5 rounded-full text-xs font-medium bg-crwn-elevated text-crwn-text hover:bg-crwn-gold hover:text-black transition-colors';

// ---- main -------------------------------------------------------------------

export default function MoneyModelView() {
  const [engagements, setEngagements] = useState<EngagementRow[]>([]);
  const [cohort, setCohort] = useState<CohortRow[]>([]);
  const [aggregates, setAggregates] = useState<Aggregates | null>(null);
  const [migrationPending, setMigrationPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [founderRate, setFounderRate] = useState<string>('');
  const [rateLoaded, setRateLoaded] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/frl/engagements?view=cohort');
      const data = await res.json();
      setEngagements(data.engagements ?? []);
      setCohort(data.cohort ?? []);
      setAggregates(data.aggregates ?? null);
      setMigrationPending(!!data.migrationPending);
    } catch {
      setError('Could not load engagements');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/frl/engagements/${id}`);
      const data = await res.json();
      if (data.detail) setDetail(data.detail);
      else setError(data.error || 'Could not load the engagement');
    } catch {
      setError('Could not load the engagement');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  // Cost assumption (founder hourly) via admin_settings.
  useEffect(() => {
    fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((rows: Array<{ key: string; value: Record<string, unknown> }>) => {
        const row = Array.isArray(rows) ? rows.find((r) => r.key === 'frl_cost_assumptions') : null;
        const cents = row && typeof row.value?.founder_hourly_cents === 'number' ? row.value.founder_hourly_cents : null;
        setFounderRate(cents !== null ? (cents / 100).toFixed(2) : '');
      })
      .catch(() => {})
      .finally(() => setRateLoaded(true));
  }, []);

  const saveFounderRate = async () => {
    const cents = founderRate.trim() === '' ? null : dollarsToCents(founderRate);
    if (founderRate.trim() !== '' && cents === null) { setError('Hourly cost must be a non-negative number'); return; }
    await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'frl_cost_assumptions', value: { founder_hourly_cents: cents } }),
    });
    if (selectedId) loadDetail(selectedId);
    loadList();
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-crwn-gold animate-spin" /></div>;
  }

  return (
    <div className="text-crwn-text">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Banknote className="w-5 h-5 text-crwn-gold" />Money Model</h2>
          <p className="text-xs text-crwn-text-secondary">
            First Revenue Launch engagements: terms, labor, guarantee evidence, and 30-day contribution margin.
            A missing input shows as missing, never as zero.
          </p>
        </div>
        <button className={btnCls} onClick={() => { loadList(); if (selectedId) loadDetail(selectedId); }}>
          <RefreshCw className="w-3 h-3 inline mr-1" />Refresh
        </button>
      </div>

      {migrationPending && (
        <div className="bg-amber-950/40 border border-amber-700 text-amber-300 text-sm rounded-xl p-3 mb-4">
          The FRL migration has not been applied yet (supabase/schema-phase2-frl-engagements.sql).
          Everything here stays empty until it runs.
        </div>
      )}
      {error && (
        <div className="bg-red-950/40 border border-red-800 text-red-300 text-sm rounded-xl p-3 mb-4 flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)}><XCircle className="w-4 h-4" /></button>
        </div>
      )}

      {/* Cost assumption */}
      <Section title="Cost assumptions" icon={<ClipboardList className="w-4 h-4 text-crwn-gold" />}>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-crwn-text-secondary">Founder hourly cost ($/hr):</span>
          <input
            className={`${inputCls} w-24`}
            value={founderRate}
            placeholder="unset"
            onChange={(e) => setFounderRate(e.target.value)}
            disabled={!rateLoaded}
          />
          <button className={btnCls} onClick={saveFounderRate}>Save</button>
          <span className="text-xs text-crwn-text-secondary">
            No default is assumed. Until this is set, labor cost and contribution margin report as missing.
            Changing it transparently recomputes from the dated minute entries.
          </span>
        </div>
      </Section>

      {!selectedId && (
        <>
          <EngagementList
            engagements={engagements}
            onSelect={setSelectedId}
            onCreated={() => loadList()}
            setError={setError}
          />
          <CohortTable cohort={cohort} aggregates={aggregates} onSelect={setSelectedId} />
        </>
      )}

      {selectedId && (
        detailLoading || !detail ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-crwn-gold animate-spin" /></div>
        ) : (
          <EngagementDetail
            detail={detail}
            onBack={() => { setSelectedId(null); loadList(); }}
            onChanged={() => loadDetail(selectedId)}
            setError={setError}
          />
        )
      )}
    </div>
  );
}

// ---- list + create ----------------------------------------------------------

function EngagementList({ engagements, onSelect, onCreated, setError }: {
  engagements: EngagementRow[];
  onSelect: (id: string) => void;
  onCreated: () => void;
  setError: (e: string | null) => void;
}) {
  const [slug, setSlug] = useState('');
  const [type, setType] = useState('founding_cohort');
  const [startedOn, setStartedOn] = useState('');
  const [feeAgreed, setFeeAgreed] = useState('');
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!slug.trim()) { setError('Enter the artist slug'); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { artistSlug: slug.trim(), engagementType: type };
      if (startedOn) body.startedOn = startedOn;
      const cents = feeAgreed.trim() === '' ? null : dollarsToCents(feeAgreed);
      if (cents !== null) body.feeAgreedCents = cents;
      const res = await fetch('/api/admin/frl/engagements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Create failed');
      else { setSlug(''); setFeeAgreed(''); setStartedOn(''); onCreated(); }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Engagements" icon={<ShieldCheck className="w-4 h-4 text-crwn-gold" />}>
      <div className="flex flex-wrap items-center gap-2 mb-4 text-sm">
        <input className={`${inputCls} w-40`} placeholder="artist slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
        <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="founding_cohort">Founding cohort</option>
          <option value="standard">Standard</option>
          <option value="self_serve">Self-serve (no service)</option>
        </select>
        <input className={inputCls} type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
        <input className={`${inputCls} w-28`} placeholder="fee agreed $" value={feeAgreed} onChange={(e) => setFeeAgreed(e.target.value)} />
        <button className={btnCls} onClick={create} disabled={saving}>
          <Plus className="w-3 h-3 inline mr-1" />Create
        </button>
        <span className="text-xs text-crwn-text-secondary">
          Creating an engagement never charges the artist. The implementation fee stays a manual Stripe invoice.
        </span>
      </div>
      {engagements.length === 0 ? (
        <p className="text-sm text-crwn-text-secondary">No engagements yet. The founding cohort is three launch partners.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-crwn-text-secondary border-b border-crwn-elevated text-left">
                <th className="py-2 pr-3">Artist</th><th className="pr-3">Type</th><th className="pr-3">Status</th>
                <th className="pr-3">Started</th><th className="pr-3">Fee agreed</th><th className="pr-3">Collected</th>
                <th className="pr-3">Payment</th><th className="pr-3">Plan</th><th />
              </tr>
            </thead>
            <tbody>
              {engagements.map((e) => (
                <tr key={e.id} className="border-t border-crwn-elevated hover:bg-crwn-elevated/40 cursor-pointer" onClick={() => onSelect(e.id)}>
                  <td className="py-2 pr-3">{e.artistName || e.artistSlug || e.artist_id.slice(0, 8)}</td>
                  <td className="pr-3">{e.engagement_type.replace(/_/g, ' ')}</td>
                  <td className="pr-3"><StatusChip status={e.status} /></td>
                  <td className="pr-3">{e.started_on || 'not set'}</td>
                  <td className="pr-3">{e.fee_agreed_cents !== null ? usd(e.fee_agreed_cents) : 'not set'}</td>
                  <td className="pr-3">{e.fee_collected_cents !== null ? usd(e.fee_collected_cents) : 'not recorded'}</td>
                  <td className="pr-3">{e.payment_status}</td>
                  <td className="pr-3">{e.platformTier || 'unknown'}</td>
                  <td className="text-crwn-gold">open</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

// ---- cohort -----------------------------------------------------------------

function agg(a: { mean: number | null; median: number | null; sampleSize: number }, fmt: (n: number) => string) {
  if (a.sampleSize === 0) return 'no data';
  return `median ${a.median !== null ? fmt(a.median) : 'n/a'} / mean ${a.mean !== null ? fmt(a.mean) : 'n/a'} (n=${a.sampleSize})`;
}

function CohortTable({ cohort, aggregates, onSelect }: {
  cohort: CohortRow[]; aggregates: Aggregates | null; onSelect: (id: string) => void;
}) {
  if (cohort.length === 0) return null;
  return (
    <Section title={`Founding cohort (${cohort.length})`} icon={<Banknote className="w-4 h-4 text-crwn-gold" />}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap">
          <thead>
            <tr className="text-crwn-text-secondary border-b border-crwn-elevated text-left">
              <th className="py-2 pr-3 sticky left-0 bg-crwn-surface-solid">Artist</th>
              <th className="pr-3">Fee agreed</th><th className="pr-3">Collected</th><th className="pr-3">Discount</th>
              <th className="pr-3">Labor</th><th className="pr-3">Delivery days</th>
              <th className="pr-3">Contacts</th><th className="pr-3">Proven buyers</th>
              <th className="pr-3">First paid</th><th className="pr-3">Days to paid</th>
              <th className="pr-3">GMV 30d</th>
              <th className="pr-3">Impl. rev</th><th className="pr-3">Sub rev 30d</th><th className="pr-3">Fees 30d</th>
              <th className="pr-3">Cost 30d</th><th className="pr-3">Margin 30d</th>
              <th className="pr-3">Guarantee</th><th className="pr-3">Plan</th><th className="pr-3">Status</th><th className="pr-3">Consent</th>
            </tr>
          </thead>
          <tbody>
            {cohort.map((c) => (
              <tr key={c.engagementId} className="border-t border-crwn-elevated hover:bg-crwn-elevated/40 cursor-pointer" onClick={() => onSelect(c.engagementId)}>
                <td className="py-2 pr-3 sticky left-0 bg-crwn-surface-solid">{c.artistName || c.artistSlug || 'unknown'}</td>
                <td className="pr-3">{c.feeAgreedCents !== null ? usd(c.feeAgreedCents) : 'not set'}</td>
                <td className="pr-3">{c.feeCollectedCents !== null ? usd(c.feeCollectedCents) : 'not recorded'}</td>
                <td className="pr-3">{c.discountCents !== null ? usd(c.discountCents) : 'none'}</td>
                <td className="pr-3">{c.laborMinutes > 0 ? hrs(c.laborMinutes) : 'none logged'}</td>
                <td className="pr-3">{c.deliveryDays ?? 'n/a'}</td>
                <td className="pr-3">{c.contactsImported ?? 'unknown'}</td>
                <td className="pr-3">{c.provenBuyers ?? 'unknown'}</td>
                <td className="pr-3">{c.firstPaidAt ? c.firstPaidAt.slice(0, 10) : 'not yet'}</td>
                <td className="pr-3">{c.daysToFirstPaid ?? 'n/a'}</td>
                <td className="pr-3"><Metric m={c.gmv30} /></td>
                <td className="pr-3"><Metric m={c.implementation30} /></td>
                <td className="pr-3"><Metric m={c.planSubscription30} /></td>
                <td className="pr-3"><Metric m={c.platformFees30} /></td>
                <td className="pr-3"><Metric m={c.directCost30} /></td>
                <td className="pr-3"><Metric m={c.contribution30} /></td>
                <td className="pr-3"><StatusChip status={c.guaranteeStatus} /></td>
                <td className="pr-3">{c.platformTier || 'unknown'}</td>
                <td className="pr-3"><StatusChip status={c.status} /></td>
                <td className="pr-3">{c.consent.caseStudy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {aggregates && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-xs text-crwn-text-secondary">
          <div>Time to first paid member: {agg(aggregates.daysToFirstPaid, (n) => `${Math.round(n)}d`)}</div>
          <div>Labor: {agg(aggregates.laborMinutes, (n) => hrs(n))}</div>
          <div>Implementation revenue: {agg(aggregates.implementationCollectedCents, (n) => usd(Math.round(n)))}</div>
          <div>30-day contribution margin: {agg(aggregates.contribution30Cents, (n) => usd(Math.round(n)))}</div>
          <div>Guarantee achieved: {aggregates.guaranteeAchievedRate.known > 0 ? `${aggregates.guaranteeAchievedRate.achieved} of ${aggregates.guaranteeAchievedRate.known} with known status` : 'no known statuses'}</div>
          <div>On Pro or Scale: {aggregates.paidPlanRate.known > 0 ? `${aggregates.paidPlanRate.onPaid} of ${aggregates.paidPlanRate.known}` : 'unknown'}</div>
          <div>Complete financial inputs: {aggregates.completeInputsCount} of {aggregates.cohortSize}</div>
        </div>
      )}
    </Section>
  );
}

// ---- detail -----------------------------------------------------------------

function EngagementDetail({ detail, onBack, onChanged, setError }: {
  detail: Detail; onBack: () => void; onChanged: () => void; setError: (e: string | null) => void;
}) {
  const e = detail.engagement;
  const econ = detail.economics;

  const patch = async (fields: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/frl/engagements/${e.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'Update failed');
    else onChanged();
  };

  return (
    <div>
      <button className={`${btnCls} mb-4`} onClick={onBack}>Back to overview</button>

      <div className="flex flex-wrap items-baseline gap-3 mb-4">
        <h3 className="text-base font-semibold">{detail.artist.displayName || detail.artist.slug || 'Unknown artist'}</h3>
        <span className="text-xs text-crwn-text-secondary">{e.engagement_type.replace(/_/g, ' ')}</span>
        <StatusChip status={e.status} />
        <span className="text-xs text-crwn-text-secondary">Plan: {detail.artist.platformTier || 'unknown'}</span>
        <select
          className={inputCls}
          value={e.status}
          onChange={(ev) => patch({ status: ev.target.value })}
        >
          {['agreed', 'active', 'completed', 'cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <div>
          <EconomicsSection econ={econ} />
          <DiagnosticSection d={econ.diagnostic} />
          <GuaranteeSection g={detail.guarantee} eligibleOn={e.guarantee_eligible_on} deadline={econ.guaranteeDeadlineOn} />
          <AttributionSection a={detail.attribution} artist={detail.artist} />
        </div>
        <div>
          <TermsSection e={e} patch={patch} />
          <ChecklistSection engagementId={e.id} items={detail.checklist} onChanged={onChanged} setError={setError} />
          <WorkSection engagementId={e.id} entries={detail.workEntries} assumptions={detail.assumptions} onChanged={onChanged} setError={setError} />
          <EvidenceSection engagementId={e.id} setError={setError} />
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr className="border-t border-crwn-elevated/60">
      <td className="py-1.5 pr-3 text-crwn-text-secondary">{label}</td>
      <td className="py-1.5">{children}</td>
    </tr>
  );
}

function EconomicsSection({ econ }: { econ: Detail['economics'] }) {
  const windowLabel = econ.serviceWindow30
    ? `${econ.serviceWindow30.startIso.slice(0, 10)} to ${econ.serviceWindow30.endIso.slice(0, 10)} (UTC${econ.serviceWindow30.elapsed ? ', elapsed' : ', still open'})`
    : 'no start date set';
  return (
    <Section title="Economics" icon={<Banknote className="w-4 h-4 text-crwn-gold" />}>
      <p className="text-xs text-crwn-text-secondary mb-2">30-day service window: {windowLabel}</p>
      <table className="w-full text-xs">
        <tbody>
          <Row label="Artist GMV 7d / 30d / lifetime">
            <Metric m={econ.artist.gmv7} /> <span className="text-crwn-text-secondary">/</span> <Metric m={econ.artist.gmv30} /> <span className="text-crwn-text-secondary">/</span> <Metric m={econ.artist.gmvLifetime} />
          </Row>
          <Row label="Artist net revenue 30d"><Metric m={econ.artist.net30} /></Row>
          <Row label="Paid members now">{econ.artist.paidMemberCount ?? 'unknown'}</Row>
          <Row label="First paid member">{econ.artist.firstPaidAt ? `${econ.artist.firstPaidAt.slice(0, 10)} (day ${econ.artist.daysToFirstPaid ?? '?'})` : 'not yet'}</Row>
          <Row label="CRWN: implementation collected"><Metric m={econ.crwn.implementationCollected} /></Row>
          <Row label="CRWN: platform fees 7d / 30d / lifetime">
            <Metric m={econ.crwn.platformFees7} /> <span className="text-crwn-text-secondary">/</span> <Metric m={econ.crwn.platformFees30} /> <span className="text-crwn-text-secondary">/</span> <Metric m={econ.crwn.platformFeesLifetime} />
          </Row>
          <Row label="CRWN: plan subscription 30d"><Metric m={econ.crwn.planSubscription30} /></Row>
          <Row label="CRWN revenue 7d / 30d / lifetime">
            <Metric m={econ.crwn.revenue7} /> <span className="text-crwn-text-secondary">/</span> <Metric m={econ.crwn.revenue30} /> <span className="text-crwn-text-secondary">/</span> <Metric m={econ.crwn.revenueLifetime} />
          </Row>
          <Row label={`Labor 30d (${hrs(econ.costs.laborMinutes30)}) / lifetime (${hrs(econ.costs.laborMinutesLifetime)})`}>
            <Metric m={econ.costs.recordedLabor30} /> <span className="text-crwn-text-secondary">/</span> <Metric m={econ.costs.recordedLaborLifetime} />
          </Row>
          <Row label="External costs 30d"><Metric m={econ.costs.externalCosts30} /></Row>
          <Row label="Allocated acquisition cost"><Metric m={econ.costs.acquisition} /></Row>
          <Row label="Direct cost 30d"><Metric m={econ.costs.directCost30} /></Row>
          <Row label="Contribution margin 30d">
            <Metric m={econ.margin.contribution30} />
            {econ.margin.contributionPct30 !== null && <span className="ml-1 text-crwn-text-secondary">({econ.margin.contributionPct30}%)</span>}
          </Row>
          <Row label="Contribution margin lifetime"><Metric m={econ.margin.contributionLifetime} /></Row>
          <Row label="Revenue per fulfillment hour">
            {econ.margin.revenuePerFulfillmentHourCents !== null ? usd(econ.margin.revenuePerFulfillmentHourCents) : 'needs logged hours and known revenue'}
          </Row>
          <Row label="CAC payback">
            {econ.margin.cacPaybackStatus === 'unknown' && 'unknown (set the acquisition cost)'}
            {econ.margin.cacPaybackStatus === 'not_yet' && 'not yet paid back'}
            {econ.margin.cacPaybackStatus === 'paid_back' && `paid back on day ${econ.margin.cacPaybackDays}`}
          </Row>
        </tbody>
      </table>
      <p className="text-[11px] text-crwn-text-secondary mt-2">
        Sources: GMV and platform fees from the earnings ledger (refund-netted, fee snapshotted per row).
        Plan subscription revenue is modeled from the active plan price because no platform invoice records exist.
        Predictive LTV is unavailable: lifetime figures are historical only.
      </p>
    </Section>
  );
}

function DiagnosticSection({ d }: { d: Detail['economics']['diagnostic'] }) {
  return (
    <Section title="Money Model diagnostic" icon={<CheckCircle2 className="w-4 h-4 text-crwn-gold" />}>
      <table className="w-full text-xs">
        <tbody>
          <Row label="Cost to acquire + serve one artist (this engagement's own inputs)">
            {d.replicationCostCents !== null ? usd(d.replicationCostCents) : 'unknown'}
          </Row>
          <Row label="30-day margin funds ONE more artist?">
            {d.canFundOneMore === null ? 'cannot answer yet' : d.canFundOneMore ? 'yes' : 'no'}
          </Row>
          <Row label="Funds TWO more?">
            {d.canFundTwoMore === null ? 'cannot answer yet' : d.canFundTwoMore ? 'yes' : 'no'}
          </Row>
          <Row label="Top revenue source">{d.topRevenueSource ? `${d.topRevenueSource.label} (${usd(d.topRevenueSource.cents)})` : 'unknown'}</Row>
          <Row label="Top cost source">{d.topCostSource ? `${d.topCostSource.label} (${usd(d.topCostSource.cents)})` : 'unknown'}</Row>
        </tbody>
      </table>
      {d.missingInputs.length > 0 && (
        <p className="text-xs text-amber-400 mt-2">Missing inputs: {d.missingInputs.join('; ')}</p>
      )}
    </Section>
  );
}

function GuaranteeSection({ g, eligibleOn, deadline }: {
  g: Detail['guarantee']; eligibleOn: string | null; deadline: string | null;
}) {
  return (
    <Section title="First Paid Member Guarantee" icon={<ShieldCheck className="w-4 h-4 text-crwn-gold" />}>
      <p className="text-xs text-crwn-text-secondary mb-2">
        Status: <StatusChip status={g.status} /> ({g.requiredDone} of {g.requiredTotal} required conditions met).
        {eligibleOn ? ` Eligible since ${eligibleOn}; guarantee window ends ${deadline}.` : ' Eligibility date not reached yet.'}
        {' '}Same evaluator as the artist-facing checklist; this view works even before the launch_partner flag is flipped.
      </p>
      <ul className="text-xs space-y-1">
        {g.conditions.map((c) => (
          <li key={c.key} className="flex items-center gap-2">
            {c.done ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Circle className="w-3.5 h-3.5 text-crwn-text-secondary" />}
            <span>{c.label}</span>
            <span className="text-crwn-text-secondary">{c.role === 'outcome' ? '(outcome)' : ''} {c.target > 1 ? `${c.current}/${c.target}` : ''}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function AttributionSection({ a, artist }: { a: Detail['attribution']; artist: Detail['artist'] }) {
  return (
    <Section title="Acquisition to revenue path" icon={<Route className="w-4 h-4 text-crwn-gold" />}>
      <div className="text-xs space-y-2">
        <div>
          <span className="text-crwn-text-secondary">First-touch attribution: </span>
          {a.dims ? (
            Object.entries(a.dims)
              .filter(([k, v]) => v && k !== 'entry')
              .map(([k, v]) => <span key={k} className="inline-block bg-crwn-elevated rounded-full px-2 py-0.5 mr-1 mb-1">{k}: {v}</span>)
          ) : (
            <span>unknown (no tagged visit was ever recorded for this artist)</span>
          )}
        </div>
        <div>
          <span className="text-crwn-text-secondary">Calculators: </span>
          {a.calculators.length ? a.calculators.join(', ') : 'none recorded'}
        </div>
        <div>
          <span className="text-crwn-text-secondary">Sub-avatar: </span>
          {a.subAvatar ? `${a.subAvatar.id.replace(/_/g, ' ')} (${a.subAvatar.source}${a.subAvatar.confidence ? `, ${a.subAvatar.confidence}` : ''})` : 'unassigned'}
          <span className="text-crwn-text-secondary ml-3">Revenue model: </span>
          {a.revenueModel ? `${a.revenueModel.model.replace(/_/g, ' ')}${a.revenueModel.isDefault ? ' (default)' : ''} (${a.revenueModel.confidence})` : 'not derivable'}
        </div>
        <div>
          <span className="text-crwn-text-secondary">Recommended plan: </span>
          {artist.recommendedPlan || 'none stored'}
          {artist.projectedMonthlyGmvCents !== null && <span className="text-crwn-text-secondary"> (projected GMV {usd(artist.projectedMonthlyGmvCents)}/mo)</span>}
        </div>
        {a.timeline.length > 0 ? (
          <table className="w-full mt-1">
            <thead>
              <tr className="text-crwn-text-secondary text-left">
                <th className="py-1 pr-3">Stage</th><th className="pr-3">When</th><th className="pr-3">Calculator</th><th className="pr-3">Campaign</th><th>Video</th>
              </tr>
            </thead>
            <tbody>
              {a.timeline.map((t) => (
                <tr key={t.stage} className="border-t border-crwn-elevated/60">
                  <td className="py-1 pr-3">{t.stage.replace(/_/g, ' ')}</td>
                  <td className="pr-3">{t.occurredAt.slice(0, 10)}</td>
                  <td className="pr-3">{t.calculator || ''}</td>
                  <td className="pr-3">{t.campaign || 'unknown'}</td>
                  <td>{t.video || 'unknown'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-crwn-text-secondary">No funnel events recorded for this artist.</p>
        )}
      </div>
    </Section>
  );
}

// ---- terms / scope / consent editor ----------------------------------------

function TermsSection({ e, patch }: { e: EngagementRow; patch: (f: Record<string, unknown>) => Promise<void> }) {
  const [form, setForm] = useState({
    started_on: e.started_on ?? '', target_launch_on: e.target_launch_on ?? '',
    actual_launch_on: e.actual_launch_on ?? '', completed_on: e.completed_on ?? '',
    fee_agreed: e.fee_agreed_cents !== null ? (e.fee_agreed_cents / 100).toFixed(2) : '',
    fee_collected: e.fee_collected_cents !== null ? (e.fee_collected_cents / 100).toFixed(2) : '',
    discount: e.discount_cents !== null ? (e.discount_cents / 100).toFixed(2) : '',
    discount_reason: e.discount_reason ?? '',
    acquisition_cost: e.acquisition_cost_cents !== null ? (e.acquisition_cost_cents / 100).toFixed(2) : '',
    acquisition_cost_note: e.acquisition_cost_note ?? '',
    required_plan: e.required_plan ?? '', invoice_ref: e.invoice_ref ?? '',
    payment_status: e.payment_status,
    deliverables: e.deliverables ?? '', exclusions: e.exclusions ?? '', migration_scope: e.migration_scope ?? '',
    revision_allowance: e.revision_allowance?.toString() ?? '', revisions_used: e.revisions_used.toString(),
    support_period_days: e.support_period_days?.toString() ?? '',
    additional_work_notes: e.additional_work_notes ?? '', notes: e.notes ?? '',
    case_study_consent: e.case_study_consent, testimonial_consent: e.testimonial_consent,
    performance_data_consent: e.performance_data_consent,
    consent_on: e.consent_on ?? '', consent_notes: e.consent_notes ?? '',
  });
  const set = (k: string) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: ev.target.value }));

  const save = () => {
    const money = (v: string) => (v.trim() === '' ? null : dollarsToCents(v));
    const int = (v: string) => (v.trim() === '' ? null : Number.isInteger(Number(v)) && Number(v) >= 0 ? Number(v) : null);
    const dateOrNull = (v: string) => (v.trim() === '' ? null : v);
    const strOrNull = (v: string) => (v.trim() === '' ? null : v);
    patch({
      started_on: dateOrNull(form.started_on), target_launch_on: dateOrNull(form.target_launch_on),
      actual_launch_on: dateOrNull(form.actual_launch_on), completed_on: dateOrNull(form.completed_on),
      fee_agreed_cents: money(form.fee_agreed), fee_collected_cents: money(form.fee_collected),
      discount_cents: money(form.discount), discount_reason: strOrNull(form.discount_reason),
      acquisition_cost_cents: money(form.acquisition_cost), acquisition_cost_note: strOrNull(form.acquisition_cost_note),
      required_plan: form.required_plan === '' ? null : form.required_plan,
      invoice_ref: strOrNull(form.invoice_ref), payment_status: form.payment_status,
      deliverables: strOrNull(form.deliverables), exclusions: strOrNull(form.exclusions),
      migration_scope: strOrNull(form.migration_scope),
      revision_allowance: int(form.revision_allowance), revisions_used: int(form.revisions_used) ?? 0,
      support_period_days: int(form.support_period_days),
      additional_work_notes: strOrNull(form.additional_work_notes), notes: strOrNull(form.notes),
      case_study_consent: form.case_study_consent, testimonial_consent: form.testimonial_consent,
      performance_data_consent: form.performance_data_consent,
      consent_on: dateOrNull(form.consent_on), consent_notes: strOrNull(form.consent_notes),
    });
  };

  const consentSelect = (k: 'case_study_consent' | 'testimonial_consent' | 'performance_data_consent', label: string) => (
    <label className="flex items-center gap-2">
      <span className="w-40 text-crwn-text-secondary">{label}</span>
      <select className={inputCls} value={form[k]} onChange={set(k)}>
        {['not_granted', 'private', 'anonymized', 'public'].map((v) => <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>)}
      </select>
    </label>
  );

  return (
    <Section title="Terms, scope and consent" icon={<ClipboardList className="w-4 h-4 text-crwn-gold" />}>
      <div className="text-xs space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <label>Start<input type="date" className={`${inputCls} w-full`} value={form.started_on} onChange={set('started_on')} /></label>
          <label>Target launch<input type="date" className={`${inputCls} w-full`} value={form.target_launch_on} onChange={set('target_launch_on')} /></label>
          <label>Actual launch<input type="date" className={`${inputCls} w-full`} value={form.actual_launch_on} onChange={set('actual_launch_on')} /></label>
          <label>Completed<input type="date" className={`${inputCls} w-full`} value={form.completed_on} onChange={set('completed_on')} /></label>
          <label>Fee agreed $<input className={`${inputCls} w-full`} value={form.fee_agreed} onChange={set('fee_agreed')} /></label>
          <label>Fee collected $<input className={`${inputCls} w-full`} value={form.fee_collected} onChange={set('fee_collected')} /></label>
          <label>Discount $<input className={`${inputCls} w-full`} value={form.discount} onChange={set('discount')} /></label>
          <label>Acquisition cost $<input className={`${inputCls} w-full`} value={form.acquisition_cost} onChange={set('acquisition_cost')} /></label>
          <label>Invoice ref<input className={`${inputCls} w-full`} placeholder="manual Stripe invoice id" value={form.invoice_ref} onChange={set('invoice_ref')} /></label>
          <label>Payment status
            <select className={`${inputCls} w-full`} value={form.payment_status} onChange={set('payment_status')}>
              {['unpaid', 'partial', 'paid', 'waived'].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label>Required plan
            <select className={`${inputCls} w-full`} value={form.required_plan} onChange={set('required_plan')}>
              <option value="">none</option><option value="pro">Pro</option><option value="scale">Scale</option>
            </select>
          </label>
          <label>Support period (days)<input className={`${inputCls} w-full`} value={form.support_period_days} onChange={set('support_period_days')} /></label>
          <label>Revisions allowed<input className={`${inputCls} w-full`} value={form.revision_allowance} onChange={set('revision_allowance')} /></label>
          <label>Revisions used<input className={`${inputCls} w-full`} value={form.revisions_used} onChange={set('revisions_used')} /></label>
        </div>
        <label className="block">Discount reason<input className={`${inputCls} w-full`} value={form.discount_reason} onChange={set('discount_reason')} /></label>
        <label className="block">Acquisition cost note<input className={`${inputCls} w-full`} value={form.acquisition_cost_note} onChange={set('acquisition_cost_note')} /></label>
        <label className="block">Included deliverables<textarea className={`${inputCls} w-full h-16`} value={form.deliverables} onChange={set('deliverables')} /></label>
        <label className="block">Explicit exclusions<textarea className={`${inputCls} w-full h-12`} value={form.exclusions} onChange={set('exclusions')} /></label>
        <label className="block">Migration scope<textarea className={`${inputCls} w-full h-12`} value={form.migration_scope} onChange={set('migration_scope')} /></label>
        <label className="block">Approved additional work<textarea className={`${inputCls} w-full h-12`} value={form.additional_work_notes} onChange={set('additional_work_notes')} /></label>
        <label className="block">Internal notes<textarea className={`${inputCls} w-full h-12`} value={form.notes} onChange={set('notes')} /></label>
        <div className="space-y-1 pt-1 border-t border-crwn-elevated">
          <p className="text-crwn-text-secondary">Consent (defaults to not granted; the discount buys these rights only if the artist grants them):</p>
          {consentSelect('case_study_consent', 'Case study')}
          {consentSelect('testimonial_consent', 'Testimonial')}
          {consentSelect('performance_data_consent', 'Performance data')}
          <label className="flex items-center gap-2">
            <span className="w-40 text-crwn-text-secondary">Consent date</span>
            <input type="date" className={inputCls} value={form.consent_on} onChange={set('consent_on')} />
          </label>
          <label className="block">Consent notes<input className={`${inputCls} w-full`} value={form.consent_notes} onChange={set('consent_notes')} /></label>
        </div>
        <button className={btnCls} onClick={save}>Save terms</button>
      </div>
    </Section>
  );
}

// ---- operator checklist ------------------------------------------------------

function ChecklistSection({ engagementId, items, onChanged, setError }: {
  engagementId: string;
  items: Detail['checklist'];
  onChanged: () => void;
  setError: (e: string | null) => void;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [minutes, setMinutes] = useState<Record<string, string>>({});

  const saveManual = async (key: string, status: string) => {
    const body: Record<string, unknown> = { itemKey: key, status };
    const note = notes[key];
    if (note !== undefined && note.trim() !== '') body.note = note;
    const m = minutes[key];
    if (m !== undefined && m.trim() !== '') {
      const n = Number(m);
      if (!Number.isInteger(n) || n < 0) { setError('Minutes must be a whole number'); return; }
      body.minutesSpent = n;
    }
    const res = await fetch(`/api/admin/frl/engagements/${engagementId}/checklist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'Save failed');
    else onChanged();
  };

  return (
    <Section title="Operator delivery checklist" icon={<ClipboardList className="w-4 h-4 text-crwn-gold" />}>
      <p className="text-[11px] text-crwn-text-secondary mb-2">
        Verified items come straight from product data and cannot be set by hand.
        Manual items are your confirmations.
      </p>
      <ul className="text-xs space-y-2">
        {items.map((item) => (
          <li key={item.key} className="border-t border-crwn-elevated/60 pt-2">
            <div className="flex items-center gap-2">
              {(item.status === 'verified' || item.status === 'done') ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
              ) : item.status === 'not_verifiable' ? (
                <XCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-crwn-text-secondary shrink-0" />
              )}
              <span className="flex-1">{item.label}</span>
              <StatusChip status={item.status} />
              {item.kind === 'derived' && item.current !== null && item.target !== null && item.target > 1 && (
                <span className="text-crwn-text-secondary">{item.current}/{item.target}</span>
              )}
            </div>
            {item.kind === 'derived' && (
              <p className="text-[11px] text-crwn-text-secondary ml-5">Source: {item.evidence}</p>
            )}
            {item.kind === 'manual' && (
              <div className="flex flex-wrap items-center gap-2 ml-5 mt-1">
                <input
                  className={`${inputCls} w-52`} placeholder={item.note || 'note'}
                  value={notes[item.key] ?? ''}
                  onChange={(ev) => setNotes((n) => ({ ...n, [item.key]: ev.target.value }))}
                />
                <input
                  className={`${inputCls} w-16`} placeholder={item.minutesSpent !== null ? `${item.minutesSpent}m` : 'min'}
                  value={minutes[item.key] ?? ''}
                  onChange={(ev) => setMinutes((m) => ({ ...m, [item.key]: ev.target.value }))}
                />
                {item.status !== 'done' && <button className={btnCls} onClick={() => saveManual(item.key, 'done')}>Done</button>}
                {item.status === 'done' && <button className={btnCls} onClick={() => saveManual(item.key, 'pending')}>Reopen</button>}
                {item.status !== 'not_applicable' && <button className={btnCls} onClick={() => saveManual(item.key, 'not_applicable')}>N/A</button>}
                {item.completedOn && <span className="text-crwn-text-secondary">done {item.completedOn}</span>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---- work log ---------------------------------------------------------------

function WorkSection({ engagementId, entries, assumptions, onChanged, setError }: {
  engagementId: string;
  entries: Detail['workEntries'];
  assumptions: { founderHourlyCents: number | null };
  onChanged: () => void;
  setError: (e: string | null) => void;
}) {
  const [category, setCategory] = useState<string>(FRL_WORK_CATEGORIES[0]);
  const [workOn, setWorkOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [mins, setMins] = useState('');
  const [note, setNote] = useState('');
  const [cost, setCost] = useState('');

  const add = async () => {
    const minutes = Number(mins);
    if (!Number.isInteger(minutes) || minutes < 0) { setError('Minutes must be a whole number'); return; }
    const body: Record<string, unknown> = { category, workOn, minutes };
    if (note.trim()) body.note = note.trim();
    if (cost.trim()) {
      const cents = dollarsToCents(cost);
      if (cents === null) { setError('External cost must be a non-negative dollar amount'); return; }
      body.externalCostCents = cents;
    }
    const res = await fetch(`/api/admin/frl/engagements/${engagementId}/work`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'Could not record the entry');
    else { setMins(''); setNote(''); setCost(''); onChanged(); }
  };

  const remove = async (entryId: string) => {
    const res = await fetch(`/api/admin/frl/engagements/${engagementId}/work?entryId=${entryId}`, { method: 'DELETE' });
    if (!res.ok) setError('Delete failed');
    else onChanged();
  };

  const totalMinutes = entries.reduce((s, w) => s + w.minutes, 0);

  return (
    <Section title={`Labor and direct costs (${hrs(totalMinutes)} logged)`} icon={<ClipboardList className="w-4 h-4 text-crwn-gold" />}>
      {assumptions.founderHourlyCents === null && (
        <p className="text-[11px] text-amber-400 mb-2">
          No hourly cost assumption set (see Cost assumptions above): minutes are recorded but labor cost reads as missing.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs mb-3">
        <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
          {FRL_WORK_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
        </select>
        <input type="date" className={inputCls} value={workOn} onChange={(e) => setWorkOn(e.target.value)} />
        <input className={`${inputCls} w-16`} placeholder="min" value={mins} onChange={(e) => setMins(e.target.value)} />
        <input className={`${inputCls} w-40`} placeholder="note" value={note} onChange={(e) => setNote(e.target.value)} />
        <input className={`${inputCls} w-24`} placeholder="ext. cost $" value={cost} onChange={(e) => setCost(e.target.value)} />
        <button className={btnCls} onClick={add}><Plus className="w-3 h-3 inline mr-1" />Log</button>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-crwn-text-secondary">Nothing logged yet. The cohort exists to learn delivery hours; log everything.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-crwn-text-secondary text-left">
              <th className="py-1 pr-3">Date</th><th className="pr-3">Category</th><th className="pr-3">Time</th>
              <th className="pr-3">External cost</th><th className="pr-3">Note</th><th />
            </tr>
          </thead>
          <tbody>
            {entries.map((w) => (
              <tr key={w.id} className="border-t border-crwn-elevated/60">
                <td className="py-1 pr-3">{w.work_on}</td>
                <td className="pr-3">{w.category.replace(/_/g, ' ')}</td>
                <td className="pr-3">{w.minutes}m</td>
                <td className="pr-3">{w.external_cost_cents !== null ? usd(w.external_cost_cents) : ''}</td>
                <td className="pr-3">{w.note || ''}</td>
                <td><button onClick={() => remove(w.id)} title="Delete entry"><Trash2 className="w-3.5 h-3.5 text-crwn-text-secondary hover:text-red-400" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

// ---- evidence ---------------------------------------------------------------

const EVIDENCE_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'before_summary', label: 'Before-state summary' },
  { key: 'previous_stack', label: 'Existing monetization stack' },
  { key: 'previous_revenue_evidence', label: 'Previous direct-revenue evidence' },
  { key: 'audience_evidence', label: 'Audience / owned-list evidence' },
  { key: 'offer_launched', label: 'Offer launched' },
  { key: 'tiers_launched', label: 'Tiers launched' },
  { key: 'artist_quote', label: 'Artist quote' },
  { key: 'notes', label: 'Evidence notes' },
];

function EvidenceSection({ engagementId, setError }: { engagementId: string; setError: (e: string | null) => void }) {
  const [evidence, setEvidence] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('claimed');
  const [savings, setSavings] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/frl/engagements/${engagementId}/evidence`)
      .then((r) => r.json())
      .then((data) => {
        const ev = data.evidence as Record<string, unknown> | null;
        setEvidence(ev);
        const next: Record<string, string> = {};
        for (const f of EVIDENCE_FIELDS) next[f.key] = typeof ev?.[f.key] === 'string' ? (ev[f.key] as string) : '';
        setForm(next);
        setStatus(typeof ev?.verification_status === 'string' ? (ev.verification_status as string) : 'claimed');
        setSavings(typeof ev?.verified_savings_cents === 'number' ? ((ev.verified_savings_cents as number) / 100).toFixed(2) : '');
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [engagementId]);

  const save = async (snapshot: boolean) => {
    const body: Record<string, unknown> = { verification_status: status };
    for (const f of EVIDENCE_FIELDS) body[f.key] = form[f.key]?.trim() === '' ? null : form[f.key];
    if (savings.trim() !== '') {
      const cents = dollarsToCents(savings);
      if (cents === null) { setError('Verified savings must be a non-negative dollar amount'); return; }
      body.verified_savings_cents = cents;
    } else {
      body.verified_savings_cents = null;
    }
    if (snapshot) body.snapshotMetrics = true;
    const res = await fetch(`/api/admin/frl/engagements/${engagementId}/evidence`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'Save failed');
    else setEvidence(data.evidence);
  };

  if (!loaded) return null;
  const snap = evidence?.metrics_snapshot as Record<string, unknown> | undefined;

  return (
    <Section title="Case-study evidence (never published from here)" icon={<ShieldCheck className="w-4 h-4 text-crwn-gold" />}>
      <div className="text-xs space-y-2">
        {EVIDENCE_FIELDS.map((f) => (
          <label key={f.key} className="block">{f.label}
            <textarea
              className={`${inputCls} w-full h-12`}
              value={form[f.key] ?? ''}
              onChange={(ev) => setForm((s) => ({ ...s, [f.key]: ev.target.value }))}
            />
          </label>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-crwn-text-secondary">Verified migration savings $ (from the stack-replacement audit only):</span>
          <input className={`${inputCls} w-24`} value={savings} onChange={(ev) => setSavings(ev.target.value)} />
          <span className="text-crwn-text-secondary">Verification:</span>
          <select className={inputCls} value={status} onChange={(ev) => setStatus(ev.target.value)}>
            {['claimed', 'system_verified', 'document_verified', 'admin_reviewed'].map((v) => (
              <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button className={btnCls} onClick={() => save(false)}>Save evidence</button>
          <button className={btnCls} onClick={() => save(true)}>Save + snapshot current metrics</button>
        </div>
        {snap && (
          <p className="text-[11px] text-crwn-text-secondary">
            Metrics snapshot taken {typeof evidence?.metrics_snapshot_at === 'string' ? (evidence.metrics_snapshot_at as string).slice(0, 10) : ''}: outcome numbers were captured from the system at that moment and are what a case study cites.
          </p>
        )}
        <p className="text-[11px] text-crwn-text-secondary">
          Consent lives on the engagement (left panel). Private or anonymized permission never becomes public permission.
        </p>
      </div>
    </Section>
  );
}
