'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, FlaskConical, Info } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

// Admin Experiments + experience analytics. Extends the existing admin analytics (reads the same
// funnel_events / opportunity_ledger data) and adds experience comparison + experiment management.
// Projected opportunity is rendered in a separate block from actual captured revenue, and every
// metric row carries its definition. Feature-flag state is shown; no experiment runs by default.

const GOLD = '#D4AF37';
const TT = { backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 8, color: '#fff', fontSize: 12 } as const;

const money = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const pct = (r: number | null) => (r == null ? 'n/a' : `${(r * 100).toFixed(1)}%`);
const sinceFromPeriod = (days: string) => new Date(Date.now() - Number(days) * 86_400_000).toISOString().slice(0, 10);

interface Variant { key: string; title: string; isControl: boolean }
interface Experiment {
  key: string; title: string; hypothesis: string; experienceKeys: string[]; variants: Variant[];
  primaryMetric: string; secondaryMetrics: string[]; configVersion: string; status: string;
  allocation: Record<string, number>; startAt: string | null; endAt: string | null;
  conclusion: string | null; winnerVariant: string | null; notes: string | null; stopReason: string | null;
}
interface MetricDef { key: string; label: string; definition: string; basis: string; available: boolean }
interface ExperienceStat {
  key: string; title: string; eligible: number; exposed: number; toolCompletions: number; resultViews: number;
  builderStarts: number; previews: number; signupStarts: number; signupCompletions: number;
  onboardingCompletions: number; featurePublications: number; firstDollars: number; firstDollarsAvailable: boolean;
}
interface Insight { metricLabel: string; text: string; sufficient: boolean }
interface Analytics {
  period: { since: string };
  experiences: ExperienceStat[];
  insights: Insight[];
  funnel: { stages: { stage: string; count: number }[]; conversions: { from: string; to: string; rate: number | null }[] };
  tools: { toolKey: string; title: string; lifecycle: string; promotion: string; completions: number; activations: number }[];
  videoCampaign: { byVideo: Dim[]; byCampaign: Dim[]; byReferrer: Dim[] };
  opportunity: { projected: { revealedCents: number }; actual: { capturedCents: number; activatedCount: number }; note: string };
  metricDefinitions: MetricDef[];
  dataQuality: { funnelEvents: boolean; opportunityLedger: boolean; experimentEvents: boolean; notes: string[] };
}
interface Dim { key: string; visits: number; completions: number; signups: number; published: number }

const PERIODS = [{ id: '7', label: '7d' }, { id: '30', label: '30d' }, { id: '90', label: '90d' }, { id: '365', label: '1y' }];
const STATUS_ACTIONS: Record<string, string[]> = {
  draft: ['running'], scheduled: ['running'], running: ['paused', 'completed'], paused: ['running', 'completed'], completed: ['archived'], archived: [],
};

export default function ExperimentsView() {
  const [enabled, setEnabled] = useState(false);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [defs, setDefs] = useState<MetricDef[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30');
  const [showDefs, setShowDefs] = useState(false);
  const [saving, setSaving] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ex, an] = await Promise.all([
        fetch('/api/admin/experiments').then((r) => r.json()),
        fetch(`/api/admin/experiment-analytics?since=${sinceFromPeriod(period)}`).then((r) => r.json()),
      ]);
      if (ex?.experiments) { setExperiments(ex.experiments); setDefs(ex.metricDefinitions || []); setEnabled(!!ex.enabled); }
      if (an?.experiences) setAnalytics(an);
    } catch {
      /* silent: spinner then empty */
    } finally {
      setLoading(false);
    }
  }, [period]);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (key: string, status: string) => {
    setSaving(key);
    try {
      await fetch('/api/admin/experiments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, status }) });
      await load();
    } finally {
      setSaving('');
    }
  };

  if (loading && !analytics) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-crwn-gold" /></div>;

  return (
    <div className="space-y-6">
      {/* Header + flag state + period */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-crwn-gold" />
          <h2 className="text-lg font-bold text-crwn-text">Experiments</h2>
          <span className={`text-xs px-2 py-0.5 rounded-full ${enabled ? 'bg-green-500/15 text-green-400' : 'bg-crwn-elevated text-crwn-text-secondary'}`}>
            engine {enabled ? 'on' : 'off'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowDefs((s) => !s)} className="flex items-center gap-1 text-xs text-crwn-text-secondary hover:text-crwn-text">
            <Info className="w-3.5 h-3.5" /> Metric definitions
          </button>
          <div className="flex bg-crwn-surface rounded-full p-1">
            {PERIODS.map((pr) => (
              <button key={pr.id} onClick={() => setPeriod(pr.id)} className={`px-3 py-1 rounded-full text-xs ${period === pr.id ? 'bg-crwn-elevated text-crwn-text' : 'text-crwn-text-secondary'}`}>{pr.label}</button>
            ))}
          </div>
        </div>
      </div>

      {!enabled && (
        <div className="rounded-xl bg-crwn-surface border border-crwn-elevated p-3 text-xs text-crwn-text-secondary">
          The experiments engine is off, so no variant is assigned or exposed and nothing changes for visitors. The analytics below still compare experiences from existing funnel data. Turn it on with admin_settings key <span className="text-crwn-gold">experiments</span> (value {`{ "enabled": true }`}) once the migration is applied.
        </div>
      )}

      {analytics?.dataQuality?.notes?.length ? (
        <div className="rounded-xl bg-crwn-surface border border-crwn-elevated p-3 text-xs text-crwn-text-secondary space-y-1">
          <div className="font-semibold text-crwn-text">Data quality</div>
          {analytics.dataQuality.notes.map((n, i) => <div key={i}>• {n}</div>)}
        </div>
      ) : null}

      {showDefs && (
        <div className="rounded-xl bg-crwn-surface-solid border border-crwn-elevated p-4 space-y-2">
          {defs.map((d) => (
            <div key={d.key} className="text-xs">
              <span className="text-crwn-text font-semibold">{d.label}</span>
              {!d.available && <span className="ml-2 text-crwn-text-secondary">(unavailable)</span>}
              <span className="ml-2 text-[10px] uppercase tracking-wide text-crwn-gold">{d.basis}</span>
              <p className="text-crwn-text-secondary mt-0.5">{d.definition}</p>
            </div>
          ))}
        </div>
      )}

      {/* 1. Experience Performance + insights */}
      <Section title="Experience performance">
        {analytics?.insights?.length ? (
          <div className="grid sm:grid-cols-2 gap-2 mb-4">
            {analytics.insights.map((ins, i) => (
              <div key={i} className={`rounded-xl border p-3 text-xs ${ins.sufficient ? 'bg-crwn-surface-solid border-crwn-elevated text-crwn-text' : 'bg-crwn-surface border-crwn-elevated text-crwn-text-secondary'}`}>
                {ins.text}
              </div>
            ))}
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-crwn-text-secondary text-xs text-left">
                <th className="py-2 pr-4">Experience</th><th className="pr-4">Eligible</th><th className="pr-4">Exposed</th>
                <th className="pr-4">Tool done</th><th className="pr-4">Builder</th><th className="pr-4">Preview</th>
                <th className="pr-4">Signups</th><th className="pr-4">Onboard</th><th className="pr-4">Published</th><th className="pr-4">First $</th>
              </tr>
            </thead>
            <tbody>
              {(analytics?.experiences || []).map((e) => (
                <tr key={e.key} className="border-t border-crwn-elevated text-crwn-text">
                  <td className="py-2 pr-4 font-medium">{e.title}</td>
                  <td className="pr-4">{e.eligible}</td><td className="pr-4">{e.exposed}</td>
                  <td className="pr-4">{e.toolCompletions}</td><td className="pr-4">{e.builderStarts}</td><td className="pr-4">{e.previews}</td>
                  <td className="pr-4">{e.signupCompletions}</td><td className="pr-4">{e.onboardingCompletions}</td><td className="pr-4">{e.featurePublications}</td>
                  <td className="pr-4">{e.firstDollarsAvailable ? e.firstDollars : <span className="text-crwn-text-secondary">n/a</span>}</td>
                </tr>
              ))}
              {!analytics?.experiences?.length && <tr><td colSpan={10} className="py-6 text-center text-crwn-text-secondary">No experience data.</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 2. Funnel Performance */}
      <Section title="Funnel performance">
        {analytics?.funnel?.stages?.length ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={analytics.funnel.stages} layout="vertical" margin={{ left: 40 }}>
              <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="stage" width={130} tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TT} />
              <Bar dataKey="count" radius={[0, 6, 6, 0]}>{analytics.funnel.stages.map((_, i) => <Cell key={i} fill={GOLD} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : <Empty />}
        <div className="text-xs text-crwn-text-secondary mt-2 space-y-0.5">
          {(analytics?.funnel?.conversions || []).map((c, i) => <div key={i}>{c.from} → {c.to}: {pct(c.rate)}</div>)}
        </div>
      </Section>

      {/* 3. Tool Performance (promotion status visible) */}
      <Section title="Tool performance">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-crwn-text-secondary text-xs text-left"><th className="py-2 pr-4">Tool</th><th className="pr-4">Lifecycle</th><th className="pr-4">Promotion</th><th className="pr-4">Completions</th><th className="pr-4">Activations</th></tr></thead>
            <tbody>
              {(analytics?.tools || []).map((t) => (
                <tr key={t.toolKey} className="border-t border-crwn-elevated text-crwn-text">
                  <td className="py-2 pr-4">{t.title}</td>
                  <td className="pr-4"><span className="text-xs px-2 py-0.5 rounded-full bg-crwn-elevated">{t.lifecycle}</span></td>
                  <td className="pr-4"><span className={`text-xs px-2 py-0.5 rounded-full ${t.promotion === 'primary' ? 'bg-crwn-gold/20 text-crwn-gold' : 'bg-crwn-elevated text-crwn-text-secondary'}`}>{t.promotion}</span></td>
                  <td className="pr-4">{t.completions}</td><td className="pr-4">{t.activations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 4. Video / Campaign */}
      <Section title="Video and campaign performance">
        <DimTable title="By video (utm_content)" rows={analytics?.videoCampaign?.byVideo || []} />
        <DimTable title="By campaign" rows={analytics?.videoCampaign?.byCampaign || []} />
      </Section>

      {/* 5. Opportunity: projected vs actual, never combined */}
      <Section title="Opportunity performance">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-xl bg-crwn-surface border border-crwn-elevated p-4">
            <div className="text-xs text-crwn-text-secondary">Projected (modeled)</div>
            <div className="text-xl font-bold text-crwn-text">{money(analytics?.opportunity?.projected?.revealedCents || 0)}</div>
            <div className="text-[11px] text-crwn-text-secondary mt-1">Opportunity revealed. A projection, not money earned.</div>
          </div>
          <div className="rounded-xl bg-crwn-surface-solid border border-crwn-gold/30 p-4">
            <div className="text-xs text-crwn-text-secondary">Actual (captured)</div>
            <div className="text-xl font-bold text-crwn-gold">{money(analytics?.opportunity?.actual?.capturedCents || 0)}</div>
            <div className="text-[11px] text-crwn-text-secondary mt-1">Refund-netted real revenue. {analytics?.opportunity?.actual?.activatedCount || 0} activated.</div>
          </div>
        </div>
        <p className="text-[11px] text-crwn-text-secondary mt-2">{analytics?.opportunity?.note}</p>
      </Section>

      {/* Experiment management */}
      <Section title="Experiment configurations">
        <div className="space-y-3">
          {experiments.map((x) => (
            <div key={x.key} className="rounded-xl bg-crwn-surface-solid border border-crwn-elevated p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-crwn-text">{x.title}</div>
                  <div className="text-xs text-crwn-text-secondary">{x.experienceKeys.join(' vs ')} · v{x.configVersion}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-crwn-elevated text-crwn-text">{x.status}</span>
                  {(STATUS_ACTIONS[x.status] || []).map((next) => (
                    <button key={next} disabled={saving === x.key} onClick={() => setStatus(x.key, next)} className="text-xs px-3 py-1 rounded-full bg-crwn-gold text-crwn-bg font-semibold disabled:opacity-50">
                      {next === 'running' ? 'Start' : next === 'paused' ? 'Pause' : next === 'completed' ? 'Complete' : next === 'archived' ? 'Archive' : next}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-crwn-text-secondary mt-2">{x.hypothesis}</p>
              <div className="text-xs text-crwn-text-secondary mt-2">
                Variants: {x.variants.map((v) => `${v.title}${v.isControl ? ' (control)' : ''}`).join(', ')} · Primary metric: <span className="text-crwn-gold">{x.primaryMetric}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-crwn-surface border border-crwn-elevated p-4">
      <h3 className="text-sm font-semibold text-crwn-text mb-3">{title}</h3>
      {children}
    </div>
  );
}
function Empty() {
  return <p className="text-center text-crwn-text-secondary py-8 text-sm">No data for this period.</p>;
}
function DimTable({ title, rows }: { title: string; rows: Dim[] }) {
  return (
    <div className="mb-4">
      <div className="text-xs font-semibold text-crwn-text-secondary mb-1">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-crwn-text-secondary text-xs text-left"><th className="py-1 pr-4">Source</th><th className="pr-4">Visits</th><th className="pr-4">Completions</th><th className="pr-4">Signups</th><th className="pr-4">Published</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-crwn-elevated text-crwn-text"><td className="py-1 pr-4 truncate max-w-[180px]" title={r.key}>{r.key}</td><td className="pr-4">{r.visits}</td><td className="pr-4">{r.completions}</td><td className="pr-4">{r.signups}</td><td className="pr-4">{r.published}</td></tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="py-4 text-center text-crwn-text-secondary">No data.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
