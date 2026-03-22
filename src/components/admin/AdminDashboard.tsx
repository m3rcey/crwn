'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend, Area, AreaChart,
} from 'recharts';
import {
  RefreshCw, TrendingUp, TrendingDown, DollarSign, Users, Activity,
  AlertTriangle, Clock, Target, Settings, ChevronDown, ChevronUp,
  Crown,
} from 'lucide-react';
import SettingsPanel from './SettingsPanel';

interface AdminDashboardProps {
  userId: string;
}

interface Metrics {
  lgpCacRatio: number;
  lgp: number;
  cac: number;
  totalMRR: number;
  totalARR: number;
  platformMRR: number;
  transactionFeeMRR: number;
  grossMarginPct: number;
  grossProfit: number;
  thirtyDayCash: number;
  totalFixedCostsCents: number;
  paybackMonths: number;
  revenuePerVisitor: number;
  uniqueVisitorsInPeriod: number;
  visitorTrend: { label: string; visitors: number; revenue: number; revenuePerVisitor: number }[];
  revenueTrend: { label: string; platformFees: number; totalGross: number }[];
  periodRevenue: number;
  periodCosts: number;
  artistChurnRate: number;
  avgLifespanMonths: number;
  billingMix: { name: string; count: number; color: string }[];
  churnRisk: { active: number; atRisk: number; churning: number };
  totalArtists: number;
  paidArtists: number;
  starterArtists: number;
  tierDistribution: { name: string; count: number; color: string }[];
  totalArtistsAcquired: number;
  totalRecruiterCost: number;
  recruiterPerformance: {
    id: string; code: string; tier: string; isPartner: boolean;
    totalReferred: number; qualified: number; churned: number; pending: number;
    qualificationRate: number; totalPaid: number; referredMRR: number; roi: number;
  }[];
  recruiterCostByTier: { name: string; cost: number }[];
  salesVelocity: number;
  hypotheticalMaxMonthlyRevenue: number;
  hypotheticalMaxCustomers: number;
  period: string;
  computedAt: string;
}

const PERIODS = [
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: '90d', value: '90d' },
  { label: '365d', value: '365d' },
];

const GOLD = '#D4AF37';
const BLUE = '#3B82F6';
const PURPLE = '#8B5CF6';
const GREEN = '#10B981';
const RED = '#E53935';
const GRAY = '#666';

function fmt(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtShort(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1000000) return `$${(dollars / 1000000).toFixed(1)}M`;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}K`;
  return `$${dollars.toFixed(0)}`;
}

function fmtRatio(ratio: number): string {
  if (ratio === Infinity) return '∞';
  return `${ratio}:1`;
}

function ratioColor(ratio: number): string {
  if (ratio === Infinity || ratio >= 10) return GREEN;
  if (ratio >= 5) return GOLD;
  if (ratio >= 3) return '#F59E0B';
  return RED;
}

function churnColor(rate: number): string {
  if (rate <= 2) return GREEN;
  if (rate <= 5) return GOLD;
  return RED;
}

function marginColor(pct: number): string {
  if (pct >= 80) return GREEN;
  if (pct >= 60) return GOLD;
  return RED;
}

// Custom tooltip for charts
function CustomTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1A1A1A] border border-[#333] rounded-lg px-3 py-2 shadow-xl">
      <p className="text-[#999] text-xs mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-sm font-medium" style={{ color: entry.color }}>
          {entry.name}: {formatter ? formatter(entry.value) : entry.value}
        </p>
      ))}
    </div>
  );
}

// Collapsible section
function Section({ title, icon: Icon, children, defaultOpen = true }: {
  title: string; icon: any; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-6">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left mb-4 group"
      >
        <Icon className="w-5 h-5 text-crwn-gold" />
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {open ? (
          <ChevronUp className="w-4 h-4 text-[#666] ml-auto group-hover:text-white transition" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[#666] ml-auto group-hover:text-white transition" />
        )}
      </button>
      {open && <div className="animate-[fadeInUp_0.3s_ease-out]">{children}</div>}
    </div>
  );
}

// Metric card
function MetricCard({ label, value, subValue, color, trend }: {
  label: string; value: string; subValue?: string; color?: string; trend?: 'up' | 'down' | null;
}) {
  return (
    <div className="bg-[#1A1A1A] rounded-xl border border-[#2a2a2a] p-4">
      <p className="text-[#999] text-xs mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <p className="text-xl font-bold" style={{ color: color || '#f0f0f0' }}>{value}</p>
        {trend === 'up' && <TrendingUp className="w-4 h-4 text-green-400" />}
        {trend === 'down' && <TrendingDown className="w-4 h-4 text-red-400" />}
      </div>
      {subValue && <p className="text-[#666] text-xs mt-1">{subValue}</p>}
    </div>
  );
}

export default function AdminDashboard({ userId }: AdminDashboardProps) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [period, setPeriod] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const fetchMetrics = useCallback(async (p: string, force = false) => {
    const isRefresh = force;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetch(`/api/admin/metrics?userId=${userId}&period=${p}${force ? '&refresh=true' : ''}`);
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchMetrics(period);
  }, [period, fetchMetrics]);

  if (loading || !metrics) {
    return (
      <div className="min-h-screen bg-[#0D0D0D] flex items-center justify-center">
        <div className="text-center">
          <Crown className="w-12 h-12 text-crwn-gold mx-auto mb-4 animate-pulse" />
          <p className="text-[#999] text-sm">Loading metrics...</p>
        </div>
      </div>
    );
  }

  const cacheAge = Math.round((Date.now() - new Date(metrics.computedAt).getTime()) / 60000);

  return (
    <div className="min-h-screen bg-[#0D0D0D] p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Crown className="w-6 h-6 text-crwn-gold" />
            CRWN Command Center
          </h1>
          <p className="text-[#666] text-sm mt-1">
            Cached {cacheAge}m ago
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Period Toggle */}
          <div className="flex gap-1 bg-[#1A1A1A] rounded-full p-1 border border-[#2a2a2a]">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                  period === p.value
                    ? 'bg-crwn-gold text-black'
                    : 'text-[#999] hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            onClick={() => fetchMetrics(period, true)}
            disabled={refreshing}
            className="p-2 rounded-lg bg-[#1A1A1A] border border-[#2a2a2a] text-[#999] hover:text-white transition"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* Settings */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-lg border transition ${
              showSettings
                ? 'bg-crwn-gold text-black border-crwn-gold'
                : 'bg-[#1A1A1A] border-[#2a2a2a] text-[#999] hover:text-white'
            }`}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="mb-8 animate-[fadeInUp_0.3s_ease-out]">
          <SettingsPanel userId={userId} onSaved={() => fetchMetrics(period, true)} />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* HERO — LGP:CAC Ratio */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="mb-8 bg-[#1A1A1A] rounded-2xl border border-[#2a2a2a] p-6 md:p-8">
        <div className="text-center mb-6">
          <p className="text-[#999] text-sm mb-2">The Number That Matters</p>
          <p
            className="text-6xl md:text-7xl font-black tracking-tight"
            style={{ color: ratioColor(metrics.lgpCacRatio) }}
          >
            {fmtRatio(metrics.lgpCacRatio)}
          </p>
          <p className="text-[#999] text-sm mt-2">Lifetime Gross Profit : Customer Acquisition Cost</p>
        </div>

        <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
          <div className="text-center bg-[#141414] rounded-xl p-4">
            <p className="text-[#999] text-xs mb-1">LGP per Artist</p>
            <p className="text-2xl font-bold text-white">{fmt(metrics.lgp)}</p>
            <p className="text-[#666] text-xs mt-1">{metrics.avgLifespanMonths}mo avg lifespan</p>
          </div>
          <div className="text-center bg-[#141414] rounded-xl p-4">
            <p className="text-[#999] text-xs mb-1">CAC</p>
            <p className="text-2xl font-bold text-white">{metrics.cac > 0 ? fmt(metrics.cac) : '$0'}</p>
            <p className="text-[#666] text-xs mt-1">{metrics.totalArtistsAcquired} acquired ({period})</p>
          </div>
        </div>

        {/* Benchmark bar */}
        <div className="mt-6 max-w-lg mx-auto">
          <div className="flex justify-between text-[10px] text-[#666] mb-1">
            <span>Danger {'<'}3:1</span>
            <span>OK 3-5:1</span>
            <span>Good 5-10:1</span>
            <span>Great 10+:1</span>
          </div>
          <div className="h-2 bg-[#141414] rounded-full overflow-hidden flex">
            <div className="h-full bg-red-500" style={{ width: '20%' }} />
            <div className="h-full bg-yellow-500" style={{ width: '15%' }} />
            <div className="h-full bg-crwn-gold" style={{ width: '30%' }} />
            <div className="h-full bg-green-500" style={{ width: '35%' }} />
          </div>
          {metrics.lgpCacRatio !== Infinity && metrics.lgpCacRatio > 0 && (
            <div
              className="relative -mt-4"
              style={{ left: `${Math.min(Math.max((metrics.lgpCacRatio / 15) * 100, 2), 98)}%` }}
            >
              <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[6px] border-b-white" />
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* FINANCIAL HEALTH */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Section title="Financial Health" icon={DollarSign}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <MetricCard label="MRR" value={fmt(metrics.totalMRR)} subValue={`Platform: ${fmt(metrics.platformMRR)} + Fees: ${fmt(metrics.transactionFeeMRR)}`} color={GOLD} />
          <MetricCard label="ARR" value={fmtShort(metrics.totalARR)} />
          <MetricCard label="Gross Margin" value={`${metrics.grossMarginPct}%`} color={marginColor(metrics.grossMarginPct)} subValue={`Target: ≥80%`} />
          <MetricCard label="30-Day Cash" value={fmt(metrics.thirtyDayCash)} subValue={`vs CAC+COGS: ${fmt(metrics.cac + metrics.totalFixedCostsCents)}`} color={GREEN} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <MetricCard label="Payback Period" value={metrics.paybackMonths > 0 ? `${metrics.paybackMonths}mo` : 'N/A'} subValue="Target: <1mo" color={metrics.paybackMonths <= 1 ? GREEN : metrics.paybackMonths <= 3 ? GOLD : RED} />
          <MetricCard label="Period Revenue" value={fmt(metrics.periodRevenue)} subValue={`${period} trailing`} />
          <MetricCard label="Period Costs" value={fmt(metrics.periodCosts)} subValue="Stripe + Recruiters + Fixed" />
          <MetricCard label="Period Gross Profit" value={fmt(metrics.grossProfit)} color={metrics.grossProfit > 0 ? GREEN : RED} />
        </div>

        {/* Revenue Trend Chart */}
        <div className="bg-[#141414] rounded-xl border border-[#2a2a2a] p-4">
          <p className="text-white text-sm font-medium mb-4">Revenue Trend</p>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={metrics.revenueTrend}>
              <defs>
                <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={GOLD} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#222" />
              <XAxis dataKey="label" tick={{ fill: '#666', fontSize: 10 }} />
              <YAxis tick={{ fill: '#666', fontSize: 10 }} tickFormatter={(v) => fmtShort(v)} />
              <Tooltip content={<CustomTooltip formatter={(v: number) => fmt(v)} />} />
              <Area type="monotone" dataKey="platformFees" name="Platform Fees" stroke={GOLD} fill="url(#goldGrad)" strokeWidth={2} animationDuration={1000} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* REVENUE PER VISITOR */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Section title="Revenue Per Visitor" icon={Target}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <MetricCard label="Revenue Per Visitor" value={fmt(metrics.revenuePerVisitor)} color={GOLD} />
          <MetricCard label="Unique Visitors" value={metrics.uniqueVisitorsInPeriod.toLocaleString()} subValue={`${period} trailing`} />
          <MetricCard label="Period Revenue" value={fmt(metrics.periodRevenue)} />
        </div>

        <div className="bg-[#141414] rounded-xl border border-[#2a2a2a] p-4">
          <p className="text-white text-sm font-medium mb-4">Visitors & Revenue Per Visitor</p>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={metrics.visitorTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#222" />
              <XAxis dataKey="label" tick={{ fill: '#666', fontSize: 10 }} />
              <YAxis yAxisId="left" tick={{ fill: '#666', fontSize: 10 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: '#666', fontSize: 10 }} tickFormatter={(v) => fmtShort(v)} />
              <Tooltip content={<CustomTooltip formatter={(v: number) => typeof v === 'number' && v > 100 ? fmt(v) : v} />} />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="visitors" name="Visitors" stroke={BLUE} strokeWidth={2} dot={false} animationDuration={1000} />
              <Line yAxisId="right" type="monotone" dataKey="revenuePerVisitor" name="Rev/Visitor" stroke={GOLD} strokeWidth={2} dot={false} animationDuration={1000} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* RETENTION */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Section title="Retention & Churn" icon={Activity}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <MetricCard label="Artist Churn Rate" value={`${metrics.artistChurnRate}%`} color={churnColor(metrics.artistChurnRate)} subValue="monthly" />
          <MetricCard label="Avg Lifespan" value={`${metrics.avgLifespanMonths}mo`} subValue="1 / churn rate" />
          <MetricCard label="Total Artists" value={metrics.totalArtists.toString()} subValue={`${metrics.paidArtists} paid / ${metrics.starterArtists} free`} />
          <MetricCard label="Paid Conversion" value={metrics.totalArtists > 0 ? `${Math.round((metrics.paidArtists / metrics.totalArtists) * 100)}%` : '0%'} subValue="Starter → Paid" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Tier Distribution Pie */}
          <div className="bg-[#141414] rounded-xl border border-[#2a2a2a] p-4">
            <p className="text-white text-sm font-medium mb-4">Tier Distribution</p>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={metrics.tierDistribution.filter(t => t.count > 0)}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="count"
                  animationDuration={800}
                >
                  {metrics.tierDistribution.filter(t => t.count > 0).map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend formatter={(value) => <span className="text-[#999] text-xs">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Billing Mix Pie */}
          <div className="bg-[#141414] rounded-xl border border-[#2a2a2a] p-4">
            <p className="text-white text-sm font-medium mb-4">Monthly vs Annual</p>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={metrics.billingMix.filter(b => b.count > 0)}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="count"
                  animationDuration={800}
                >
                  {metrics.billingMix.filter(b => b.count > 0).map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend formatter={(value) => <span className="text-[#999] text-xs">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Churn Risk Breakdown */}
          <div className="bg-[#141414] rounded-xl border border-[#2a2a2a] p-4">
            <p className="text-white text-sm font-medium mb-4">Activity Health</p>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-xs text-[#999]">Active (7d)</span>
                  <span className="text-xs text-green-400 font-medium">{metrics.churnRisk.active}</span>
                </div>
                <div className="h-2 bg-[#222] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all duration-1000"
                    style={{ width: `${metrics.totalArtists > 0 ? (metrics.churnRisk.active / metrics.totalArtists) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-xs text-[#999]">At Risk (7-21d)</span>
                  <span className="text-xs text-yellow-400 font-medium">{metrics.churnRisk.atRisk}</span>
                </div>
                <div className="h-2 bg-[#222] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-500 rounded-full transition-all duration-1000"
                    style={{ width: `${metrics.totalArtists > 0 ? (metrics.churnRisk.atRisk / metrics.totalArtists) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-xs text-[#999]">Churning (21d+)</span>
                  <span className="text-xs text-red-400 font-medium">{metrics.churnRisk.churning}</span>
                </div>
                <div className="h-2 bg-[#222] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500 rounded-full transition-all duration-1000"
                    style={{ width: `${metrics.totalArtists > 0 ? (metrics.churnRisk.churning / metrics.totalArtists) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* ACQUISITION & RECRUITERS */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Section title="Acquisition & Recruiters" icon={Users}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <MetricCard label="Artists Acquired" value={metrics.totalArtistsAcquired.toString()} subValue={`${period} trailing`} />
          <MetricCard label="Total Recruiter Spend" value={fmt(metrics.totalRecruiterCost)} subValue={`${period} trailing`} />
          <MetricCard label="CAC" value={metrics.cac > 0 ? fmt(metrics.cac) : '$0'} subValue="recruiter cost / artists" />
          <MetricCard label="Qualification Rate" value={
            metrics.recruiterPerformance.length > 0
              ? `${Math.round(metrics.recruiterPerformance.reduce((s, r) => s + r.qualificationRate, 0) / metrics.recruiterPerformance.length)}%`
              : 'N/A'
          } subValue="avg across recruiters" />
        </div>

        {/* Recruiter Cost by Tier */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-[#141414] rounded-xl border border-[#2a2a2a] p-4">
            <p className="text-white text-sm font-medium mb-4">CAC by Recruiter Tier</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={metrics.recruiterCostByTier.filter(t => t.cost > 0)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis dataKey="name" tick={{ fill: '#666', fontSize: 10 }} />
                <YAxis tick={{ fill: '#666', fontSize: 10 }} tickFormatter={(v) => fmtShort(v)} />
                <Tooltip content={<CustomTooltip formatter={(v: number) => fmt(v)} />} />
                <Bar dataKey="cost" name="Total Cost" fill={GOLD} radius={[4, 4, 0, 0]} animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Recruiter ROI Bar Chart */}
          <div className="bg-[#141414] rounded-xl border border-[#2a2a2a] p-4">
            <p className="text-white text-sm font-medium mb-4">Recruiter ROI</p>
            {metrics.recruiterPerformance.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={metrics.recruiterPerformance.slice(0, 8)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                  <XAxis type="number" tick={{ fill: '#666', fontSize: 10 }} />
                  <YAxis dataKey="code" type="category" tick={{ fill: '#999', fontSize: 10 }} width={80} />
                  <Tooltip content={<CustomTooltip formatter={(v: number) => `${v}x`} />} />
                  <Bar dataKey="roi" name="ROI" fill={GREEN} radius={[0, 4, 4, 0]} animationDuration={800} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-[#666] text-sm text-center py-8">No recruiter data yet</p>
            )}
          </div>
        </div>

        {/* Recruiter Table */}
        {metrics.recruiterPerformance.length > 0 && (
          <div className="bg-[#141414] rounded-xl border border-[#2a2a2a] p-4 overflow-x-auto">
            <p className="text-white text-sm font-medium mb-4">Recruiter Breakdown</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#666] border-b border-[#2a2a2a]">
                  <th className="text-left py-2 pr-4">Code</th>
                  <th className="text-left py-2 pr-4">Tier</th>
                  <th className="text-right py-2 pr-4">Referred</th>
                  <th className="text-right py-2 pr-4">Qualified</th>
                  <th className="text-right py-2 pr-4">Qual %</th>
                  <th className="text-right py-2 pr-4">Total Paid</th>
                  <th className="text-right py-2 pr-4">MRR Generated</th>
                  <th className="text-right py-2">ROI</th>
                </tr>
              </thead>
              <tbody>
                {metrics.recruiterPerformance.map((r) => (
                  <tr key={r.id} className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition">
                    <td className="py-2 pr-4 text-white font-medium">{r.code}</td>
                    <td className="py-2 pr-4 text-[#999]">{r.isPartner ? 'Partner' : r.tier}</td>
                    <td className="py-2 pr-4 text-right text-white">{r.totalReferred}</td>
                    <td className="py-2 pr-4 text-right text-green-400">{r.qualified}</td>
                    <td className="py-2 pr-4 text-right" style={{ color: r.qualificationRate >= 50 ? GREEN : r.qualificationRate >= 25 ? GOLD : RED }}>
                      {r.qualificationRate}%
                    </td>
                    <td className="py-2 pr-4 text-right text-[#999]">{fmt(r.totalPaid)}</td>
                    <td className="py-2 pr-4 text-right text-crwn-gold">{fmt(r.referredMRR)}/mo</td>
                    <td className="py-2 text-right font-medium" style={{ color: r.roi > 0 ? GREEN : RED }}>
                      {r.roi}x
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* PROJECTIONS */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Section title="Projections" icon={TrendingUp}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <MetricCard
            label="Sales Velocity"
            value={`${metrics.salesVelocity}/mo`}
            subValue="new paid artists per month"
          />
          <MetricCard
            label="Hypothetical Max Revenue"
            value={fmtShort(metrics.hypotheticalMaxMonthlyRevenue)}
            subValue="monthly, if nothing changes"
            color={PURPLE}
          />
          <MetricCard
            label="Hypothetical Max Customers"
            value={metrics.hypotheticalMaxCustomers.toString()}
            subValue="velocity / churn rate"
            color={BLUE}
          />
        </div>
      </Section>

      {/* Footer */}
      <div className="text-center py-8 border-t border-[#1a1a1a] mt-8">
        <p className="text-[#444] text-xs">
          CRWN Command Center — Metrics from Hormozi's playbook
        </p>
      </div>
    </div>
  );
}
