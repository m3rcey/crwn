'use client';

// Lead Magnet Performance dashboard.
//
// An admin-only view (rendered only after the /admin page confirms role === 'admin', and its data
// route re-checks admin server-side). It reads the analytics built previously — funnel_events and
// opportunity_ledger — via GET /api/admin/lead-magnet-dashboard, and renders the headline metrics,
// the revenue opportunity, and the "highest converting" rankings. Responsive: cards reflow, charts
// use ResponsiveContainer, the per-calculator table scrolls on narrow screens.

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2,
  Eye,
  CheckCircle2,
  Mail,
  UserPlus,
  Zap,
  Hammer,
  TrendingUp,
  DollarSign,
  Trophy,
  Link as LinkIcon,
} from 'lucide-react';
import {
  ACQUISITION_CHANNELS,
  SOURCE_PLATFORMS,
  buildCampaignUrl,
} from '@/lib/analytics/campaignAttribution';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface ConversionRank {
  key: string;
  views: number;
  completions: number;
  rate: number;
}
interface CalcPerf {
  calculator: string;
  views: number;
  completions: number;
  emails: number;
  accounts: number;
}
interface DashboardData {
  options: { campaigns: string[]; artists: { id: string; label: string }[] };
  metrics: {
    views: number;
    completions: number;
    emails: number;
    accounts: number;
    builderOpened: number;
    builderPublished: number;
    missions: number;
    activationRate: number;
    builderCompletion: number;
  };
  revenue: {
    revealedCents: number;
    capturedCents: number;
    remainingCents: number;
    captureRate: number;
    byFeature: Record<string, { revealedCents: number; capturedCents: number; remainingCents: number }>;
  };
  topCalculator: CalcPerf | null;
  highestConvertingSource: ConversionRank | null;
  highestConvertingVideo: ConversionRank | null;
  highestConvertingCampaign: ConversionRank | null;
  byCalculator: CalcPerf[];
  bySource: ConversionRank[];
  byVideo: ConversionRank[];
  byCampaign: ConversionRank[];
  scorecard?: {
    dimension: string;
    stages: string[];
    rows: ScorecardRow[];
  };
}

interface ScorecardRow {
  key: string;
  stages: Record<string, number>;
  salesPriority: number;
  callsRequested: number;
  topSubAvatar: string | null;
  completionRate: number;
  paidRate: number;
  biggestDrop: { from: string; to: string; lost: number; lossRate: number } | null;
}

const PERIODS = [
  { id: '7', label: '7d' },
  { id: '30', label: '30d' },
  { id: '90', label: '90d' },
  { id: '365', label: '1y' },
];

// The five calculators the funnel tracks (must match FEATURE_BY_CALCULATOR / the funnel).
const CALCULATORS = [
  { id: '', label: 'All calculators' },
  { id: 'worth', label: 'Streaming Loss' },
  { id: 'vault-revenue-planner', label: 'Vault' },
  { id: 'share-to-earn-planner', label: 'Share-to-Earn' },
  { id: 'live-experience-calculator', label: 'Live Experience' },
  { id: 'executive-producer-session', label: 'Executive Producer' },
];

const GOLD = '#D4AF37';

// Which tag the content scorecard groups by. Mirrors the route's own allowlist; a value not on it
// is ignored server-side and falls back to campaign.
const SCORECARD_DIMENSIONS = [
  { id: 'campaign', label: 'Campaign' },
  { id: 'video', label: 'Video / creative' },
  { id: 'angle', label: 'Content angle' },
  { id: 'platform', label: 'Platform' },
  { id: 'keyword', label: 'ManyChat keyword' },
  { id: 'variant', label: 'Creative variant' },
  { id: 'calculator', label: 'Calculator' },
];

// Short column headers for the scorecard's stage spine. Keyed by the canonical stage name.
const STAGE_LABELS: Record<string, string> = {
  page_viewed: 'Views',
  calculator_started: 'Starts',
  calculator_completed: 'Results',
  email_submitted: 'Leads',
  account_created: 'Accounts',
  setup_completed: 'Launched',
  stripe_connected: 'Stripe',
  fans_imported: 'Fans',
  first_paid_conversion: 'Paid',
};

function sinceFromPeriod(days: string): string {
  return new Date(Date.now() - Number(days) * 86_400_000).toISOString().slice(0, 10);
}
const money = (cents: number) => `$${Math.round((cents || 0) / 100).toLocaleString('en-US')}`;
const pct = (r: number) => `${((r || 0) * 100).toFixed(1)}%`;
const num = (n: number) => (n || 0).toLocaleString('en-US');

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-crwn-surface-solid rounded-xl p-4 border border-crwn-elevated">
      <div className="flex items-center gap-2 text-crwn-text-secondary mb-1">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-xl font-bold text-crwn-text">{value}</p>
      {sub && <p className="text-xs text-crwn-text-secondary mt-0.5">{sub}</p>}
    </div>
  );
}

function BestTile({ label, name, detail }: { label: string; name: string; detail: string }) {
  return (
    <div className="bg-crwn-surface-solid rounded-xl p-4 border border-crwn-gold/30">
      <div className="flex items-center gap-2 text-crwn-gold mb-1">
        <Trophy className="w-4 h-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-base font-bold text-crwn-text truncate" title={name}>{name}</p>
      <p className="text-xs text-crwn-text-secondary mt-0.5">{detail}</p>
    </div>
  );
}

function ConversionChart({ title, data }: { title: string; data: ConversionRank[] }) {
  const chart = data.slice(0, 6).map((d) => ({ name: d.key.length > 16 ? d.key.slice(0, 15) + '…' : d.key, value: Math.round(d.rate * 1000) / 10, completions: d.completions, views: d.views }));
  return (
    <div className="bg-crwn-surface-solid rounded-xl p-4 border border-crwn-elevated">
      <h4 className="text-sm font-semibold text-crwn-text mb-3">{title}</h4>
      {chart.length === 0 ? (
        <p className="text-xs text-crwn-text-secondary py-6 text-center">No data yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(120, chart.length * 34)}>
          <BarChart data={chart} layout="vertical" margin={{ left: 0, right: 8 }}>
            <XAxis type="number" hide domain={[0, 100]} />
            <YAxis type="category" dataKey="name" width={100} tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 8, color: '#fff', fontSize: 12 }}
              formatter={(value) => [`${value}% completion`, '']}
            />
            <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={20}>
              {chart.map((_, i) => (
                <Cell key={i} fill={GOLD} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// The tools a video can point at. Same public routes the registry declares; kept as a short list
// because these are the ones the founder actually links from content.
const LINK_DESTINATIONS = [
  { id: '/tools/opportunity-calculator', label: 'Opportunity Calculator (all-in-one)' },
  { id: '/tools/worth', label: 'Streaming Loss' },
  { id: '/tools/vault-revenue-planner', label: 'Vault Revenue Planner' },
  { id: '/tools/share-to-earn-planner', label: 'Share-to-Earn Planner' },
  { id: '/tools/live-experience-calculator', label: 'Live Experience Calculator' },
  { id: '/tools/between-tour-calculator', label: 'Between-Tour Revenue Calculator' },
  { id: '/tools/proof-of-demand-test-builder', label: 'Proof of Demand Test Builder' },
  { id: '/tools/royalty-readiness-check', label: 'Royalty Readiness Check' },
  { id: '/tools/fan-stack-calculator', label: 'Fan Stack Calculator' },
  { id: '/', label: 'Homepage funnel' },
];

/**
 * The campaign link builder. It exists for one reason: a hand-typed link is the single easiest way
 * to lose a whole video's attribution, and it fails silently (the visit still works, it just lands
 * in 'unknown' forever). Everything it emits goes through buildCampaignUrl, the same normalizer the
 * server parses with, so a link built here can never produce a tag the reports drop.
 */
function CampaignLinkBuilder() {
  const [destination, setDestination] = useState(LINK_DESTINATIONS[0].id);
  const [platform, setPlatform] = useState<string>('instagram');
  const [channel, setChannel] = useState<string>('organic');
  const [campaignName, setCampaignName] = useState('');
  const [creative, setCreative] = useState('');
  const [angle, setAngle] = useState('');
  const [keyword, setKeyword] = useState('');
  const [variant, setVariant] = useState('');
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://thecrwn.app';
  const url = buildCampaignUrl(`${origin}${destination}`, {
    platform: platform as never,
    channel: channel as never,
    campaign: campaignName,
    creative,
    angle,
    keyword,
    variant,
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the link is on screen and selectable */
    }
  };

  const field = (label: string, value: string, onChange: (v: string) => void, placeholder: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-crwn-text-secondary">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-crwn-surface border border-crwn-elevated rounded-lg px-3 py-1.5 text-xs text-crwn-text focus:outline-none focus:border-crwn-gold"
      />
    </label>
  );

  const select = (label: string, value: string, onChange: (v: string) => void, options: readonly string[]) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-crwn-text-secondary">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-crwn-surface border border-crwn-elevated rounded-lg px-3 py-1.5 text-xs text-crwn-text focus:outline-none focus:border-crwn-gold"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="bg-crwn-surface-solid rounded-xl p-4 border border-crwn-elevated">
      <div className="flex items-center gap-2 mb-1">
        <LinkIcon className="w-4 h-4 text-crwn-gold" />
        <h4 className="text-sm font-semibold text-crwn-text">Campaign link builder</h4>
      </div>
      <p className="text-xs text-crwn-text-secondary mb-3">
        Build one link per video, then paste it into ManyChat. An untagged link still works: it just
        lands in &quot;unknown&quot; and that video can never be compared to any other.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs text-crwn-text-secondary">Destination</span>
          <select
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="bg-crwn-surface border border-crwn-elevated rounded-lg px-3 py-1.5 text-xs text-crwn-text focus:outline-none focus:border-crwn-gold"
          >
            {LINK_DESTINATIONS.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        </label>
        {select('Platform', platform, setPlatform, SOURCE_PLATFORMS)}
        {select('Channel', channel, setChannel, ACQUISITION_CHANNELS)}
        {field('Campaign', campaignName, setCampaignName, 'kcamp_streaming_loss')}
        {field('Creative (video id)', creative, setCreative, 'kcamp_v1')}
        {field('Angle', angle, setAngle, 'streaming_loss')}
        {field('ManyChat keyword', keyword, setKeyword, 'vault')}
        {field('Variant', variant, setVariant, 'b')}
      </div>

      <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
        <code className="flex-1 block overflow-x-auto whitespace-nowrap bg-crwn-surface rounded-lg px-3 py-2 text-xs text-crwn-gold border border-crwn-elevated">
          {url}
        </code>
        <button
          onClick={copy}
          className="shrink-0 px-4 py-2 rounded-full bg-crwn-gold text-black text-xs font-semibold hover:opacity-90 transition-opacity"
        >
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </div>
  );
}

export default function LeadMagnetsView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState('30');
  const [calculator, setCalculator] = useState('');
  const [campaign, setCampaign] = useState('');
  const [artistId, setArtistId] = useState('');
  const [dimension, setDimension] = useState('campaign');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const qs = new URLSearchParams({ since: sinceFromPeriod(period), dimension });
      if (calculator) qs.set('calculator', calculator);
      if (campaign) qs.set('campaign', campaign);
      if (artistId) qs.set('artistId', artistId);
      const res = await fetch(`/api/admin/lead-magnet-dashboard?${qs.toString()}`);
      const json = await res.json();
      if (res.ok) setData(json);
    } catch {
      /* silent — the spinner-then-empty state covers it */
    } finally {
      setIsLoading(false);
    }
  }, [period, calculator, campaign, artistId, dimension]);

  useEffect(() => {
    load();
  }, [load]);

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-crwn-gold" />
      </div>
    );
  }
  if (!data) {
    return <p className="text-center text-crwn-text-secondary py-16">No data.</p>;
  }

  const m = data.metrics;
  const rev = data.revenue;

  return (
    <div className="space-y-6">
      {/* Header + filters */}
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-crwn-text">Lead Magnet Performance</h2>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-crwn-surface rounded-full p-1 w-fit">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  period === p.id ? 'bg-crwn-elevated text-crwn-text' : 'text-crwn-text-secondary hover:text-crwn-text'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <select
            value={calculator}
            onChange={(e) => setCalculator(e.target.value)}
            className="bg-crwn-surface-solid border border-crwn-elevated rounded-full px-3 py-1.5 text-xs text-crwn-text focus:outline-none focus:border-crwn-gold"
          >
            {CALCULATORS.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <select
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
            className="bg-crwn-surface-solid border border-crwn-elevated rounded-full px-3 py-1.5 text-xs text-crwn-text focus:outline-none focus:border-crwn-gold"
          >
            <option value="">All campaigns</option>
            {data.options.campaigns.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={artistId}
            onChange={(e) => setArtistId(e.target.value)}
            className="bg-crwn-surface-solid border border-crwn-elevated rounded-full px-3 py-1.5 text-xs text-crwn-text focus:outline-none focus:border-crwn-gold"
          >
            <option value="">All artists</option>
            {data.options.artists.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Funnel metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={<Eye className="w-4 h-4" />} label="Views" value={num(m.views)} />
        <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="Completions" value={num(m.completions)} />
        <StatCard icon={<Mail className="w-4 h-4" />} label="Emails" value={num(m.emails)} />
        <StatCard icon={<UserPlus className="w-4 h-4" />} label="Accounts" value={num(m.accounts)} />
        <StatCard icon={<Zap className="w-4 h-4" />} label="Activation Rate" value={pct(m.activationRate)} sub="accounts / completions" />
        <StatCard icon={<Hammer className="w-4 h-4" />} label="Builder Completion" value={pct(m.builderCompletion)} sub="published / opened" />
      </div>

      {/* Revenue opportunity */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Opportunity Revealed" value={money(rev.revealedCents)} sub="this month, all features" />
        <StatCard icon={<DollarSign className="w-4 h-4" />} label="Opportunity Captured" value={money(rev.capturedCents)} sub={`${pct(rev.captureRate)} of revealed`} />
        <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Remaining" value={money(rev.remainingCents)} sub="still on the table" />
        <StatCard icon={<Hammer className="w-4 h-4" />} label="Missions Completed" value={num(m.missions)} />
      </div>

      {/* Headline "best of" tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <BestTile
          label="Top Calculator"
          name={data.topCalculator?.calculator ?? '—'}
          detail={data.topCalculator ? `${num(data.topCalculator.completions)} completions` : 'no data'}
        />
        <BestTile
          label="Best Source"
          name={data.highestConvertingSource?.key ?? '—'}
          detail={data.highestConvertingSource ? `${pct(data.highestConvertingSource.rate)} completion` : 'no data'}
        />
        <BestTile
          label="Best Video"
          name={data.highestConvertingVideo?.key ?? '—'}
          detail={data.highestConvertingVideo ? `${pct(data.highestConvertingVideo.rate)} completion` : 'no data'}
        />
        <BestTile
          label="Best Campaign"
          name={data.highestConvertingCampaign?.key ?? '—'}
          detail={data.highestConvertingCampaign ? `${pct(data.highestConvertingCampaign.rate)} completion` : 'no data'}
        />
      </div>

      {/* Conversion rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <ConversionChart title="Converting by Source" data={data.bySource} />
        <ConversionChart title="Converting by Video" data={data.byVideo} />
        <ConversionChart title="Converting by Campaign" data={data.byCampaign} />
      </div>

      {/* Content scorecard: one tag, all the way down to money. */}
      <div className="bg-crwn-surface-solid rounded-xl p-4 border border-crwn-elevated">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-1">
          <h4 className="text-sm font-semibold text-crwn-text">Content scorecard</h4>
          <select
            value={dimension}
            onChange={(e) => setDimension(e.target.value)}
            className="bg-crwn-surface border border-crwn-elevated rounded-full px-3 py-1.5 text-xs text-crwn-text focus:outline-none focus:border-crwn-gold w-fit"
          >
            {SCORECARD_DIMENSIONS.map((d) => (
              <option key={d.id} value={d.id}>Group by {d.label.toLowerCase()}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-crwn-text-secondary mb-3">
          Sorted by artists who actually got paid, not by views. &quot;ICP&quot; is the count the
          server-side lead scorer put in the sales-priority band, so lead quality reads next to lead
          volume.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-crwn-text-secondary text-xs">
                <th className="py-2 pr-4 font-medium sticky left-0 bg-crwn-surface-solid">
                  {SCORECARD_DIMENSIONS.find((d) => d.id === (data.scorecard?.dimension ?? dimension))?.label ?? 'Campaign'}
                </th>
                {(data.scorecard?.stages ?? []).map((s) => (
                  <th key={s} className="py-2 px-3 font-medium text-right whitespace-nowrap">{STAGE_LABELS[s] ?? s}</th>
                ))}
                <th className="py-2 px-3 font-medium text-right whitespace-nowrap">ICP</th>
                <th className="py-2 px-3 font-medium text-right whitespace-nowrap">Calls</th>
                <th className="py-2 pl-3 font-medium text-left whitespace-nowrap">Biggest drop</th>
              </tr>
            </thead>
            <tbody>
              {!data.scorecard?.rows.length ? (
                <tr>
                  <td colSpan={13} className="py-6 text-center text-crwn-text-secondary text-xs">
                    No tagged traffic yet. Build a link above and put it in ManyChat.
                  </td>
                </tr>
              ) : (
                data.scorecard.rows.map((r) => (
                  <tr key={r.key} className="border-t border-crwn-elevated">
                    <td className="py-2 pr-4 text-crwn-text sticky left-0 bg-crwn-surface-solid max-w-[180px] truncate" title={r.key}>
                      {r.key}
                    </td>
                    {(data.scorecard?.stages ?? []).map((s) => (
                      <td
                        key={s}
                        className={`py-2 px-3 text-right ${s === 'first_paid_conversion' ? 'text-crwn-gold font-semibold' : 'text-crwn-text-secondary'}`}
                      >
                        {num(r.stages[s] || 0)}
                      </td>
                    ))}
                    <td className="py-2 px-3 text-right text-crwn-text">{num(r.salesPriority)}</td>
                    <td className="py-2 px-3 text-right text-crwn-text-secondary">{num(r.callsRequested)}</td>
                    <td className="py-2 pl-3 text-crwn-text-secondary text-xs whitespace-nowrap">
                      {r.biggestDrop
                        ? `${STAGE_LABELS[r.biggestDrop.from] ?? r.biggestDrop.from} to ${STAGE_LABELS[r.biggestDrop.to] ?? r.biggestDrop.to} (${num(r.biggestDrop.lost)} lost, ${pct(r.biggestDrop.lossRate)})`
                        : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Campaign link builder */}
      <CampaignLinkBuilder />

      {/* Per-calculator table */}
      <div className="bg-crwn-surface-solid rounded-xl p-4 border border-crwn-elevated">
        <h4 className="text-sm font-semibold text-crwn-text mb-3">By calculator</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-crwn-text-secondary text-xs">
                <th className="py-2 pr-4 font-medium">Calculator</th>
                <th className="py-2 px-4 font-medium text-right">Views</th>
                <th className="py-2 px-4 font-medium text-right">Completions</th>
                <th className="py-2 px-4 font-medium text-right">Emails</th>
                <th className="py-2 pl-4 font-medium text-right">Accounts</th>
              </tr>
            </thead>
            <tbody>
              {data.byCalculator.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-crwn-text-secondary text-xs">No data yet.</td>
                </tr>
              ) : (
                data.byCalculator.map((c) => (
                  <tr key={c.calculator} className="border-t border-crwn-elevated">
                    <td className="py-2 pr-4 text-crwn-text">{c.calculator}</td>
                    <td className="py-2 px-4 text-right text-crwn-text-secondary">{num(c.views)}</td>
                    <td className="py-2 px-4 text-right text-crwn-text">{num(c.completions)}</td>
                    <td className="py-2 px-4 text-right text-crwn-text-secondary">{num(c.emails)}</td>
                    <td className="py-2 pl-4 text-right text-crwn-text-secondary">{num(c.accounts)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
