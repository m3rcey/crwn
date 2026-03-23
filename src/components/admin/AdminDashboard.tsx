'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend, Area, AreaChart,
} from 'recharts';
import {
  RefreshCw, TrendingUp, TrendingDown, DollarSign, Users, Activity,
  AlertTriangle, Clock, Target, Settings, ChevronDown, ChevronUp,
  Crown, Info, Heart, ArrowUpDown, ShieldCheck,
} from 'lucide-react';
import SettingsPanel from './SettingsPanel';
import AgentInsights from './AgentInsights';

// Metric tooltips — what it is and why it matters
const TOOLTIPS: Record<string, string> = {
  // Hero
  'LGP:CAC': 'Lifetime Gross Profit ÷ Customer Acquisition Cost. THE fundamental ratio — how much profit you make per customer vs. what it costs to get them. Below 3:1 means you can\'t scale. Above 10:1 means print money.',
  'LGP per Artist': 'Total gross profit a single artist generates over their entire lifetime on the platform. Factors in their tier fee minus Stripe fees, recruiter cuts, and allocated fixed costs, multiplied by average lifespan.',
  'CAC': 'Customer Acquisition Cost. Total recruiter spend ÷ number of artists acquired. The all-in cost to get one new artist on the platform.',

  // Financial
  'MRR': 'Monthly Recurring Revenue. Platform tier subscriptions + estimated monthly transaction fees. This is your predictable income baseline.',
  'ARR': 'Annual Recurring Revenue. MRR × 12. What the business would make in a year at the current run rate.',
  'Gross Margin': 'Revenue minus direct costs (Stripe fees, recruiter payouts, fixed costs) as a percentage. Target 80%+. Below 80% means scaling will be painful because there\'s not enough left to reinvest.',
  '30-Day Cash': 'Total cash collected in the last 30 days. Must exceed CAC + fulfillment cost for "client financed acquisition" — meaning customers pay for their own acquisition.',
  'Payback Period': 'How many months until a new artist\'s revenue covers their acquisition cost. Under 1 month = you can scale with credit cards. Under 3 months = healthy. Over 6 = problem.',
  'Period Revenue': 'Total revenue collected during the selected trailing period from platform fees and transaction fees.',
  'Period Costs': 'Total costs during the period: Stripe processing fees + recruiter payouts + allocated fixed infrastructure costs.',
  'Period Gross Profit': 'Period Revenue minus Period Costs. The actual profit generated during this window.',

  // Revenue Per Visitor
  'Revenue Per Visitor': 'Total revenue ÷ unique site visitors. Tells you how much each eyeball is worth. If this number is high, you can afford to spend more on marketing. Key signal for whether to raise prices.',
  'Unique Visitors': 'Number of unique visitors (by hashed IP+UA) during the trailing period.',

  // Retention
  'Artist Churn Rate': 'Percentage of paid artists who cancel per month. 1/churn = average lifespan. Under 2% = excellent, 2-5% = okay, over 5% = leaky bucket that needs fixing before scaling.',
  'Avg Lifespan': 'Average number of months a paid artist stays on the platform. Calculated as 1 ÷ monthly churn rate. Directly multiplies your LGP.',
  'Total Artists': 'All artists on the platform, both free (Starter) and paid tiers.',
  'Paid Conversion': 'Percentage of total artists on a paid tier (Pro/Label/Empire). Shows how well the free-to-paid funnel works.',

  // Acquisition
  'Artists Acquired': 'Number of new artist signups during the trailing period.',
  'Total Recruiter Spend': 'Sum of all recruiter flat fees + recurring payouts paid during the period. This IS your CAC budget.',
  'Qualification Rate': 'Percentage of referred artists who survive 30 days on a paid plan and trigger a recruiter payout. Low rate = recruiters bringing bad leads.',

  // Projections
  'Sales Velocity': 'Average number of new paid artists acquired per month. Combined with churn, this predicts where the business stabilizes.',
  'Hypothetical Max Revenue': 'Where monthly revenue will plateau if sales velocity and churn stay the same. Formula: (velocity ÷ churn) × avg revenue per artist.',
  'Hypothetical Max Customers': 'Where total customer count will plateau if sales velocity and churn stay the same. Formula: velocity ÷ churn rate.',

  // Fan metrics
  'Total Active Fans': 'Unique fans with at least one active subscription. Fans are the demand side — without fans, artists have no revenue.',
  'New Fans': 'Fans who made their first-ever subscription during this period. Tracks demand-side growth.',
  'Churned Fans': 'Fans who canceled ALL subscriptions during this period with none remaining. Platform-level fan loss.',
  'Fan Churn Rate': 'Percentage of fans who fully churned during the period. Fan churn leads to artist revenue decline, which leads to artist churn.',
  'Fan LTV': 'Lifetime Value per fan. Total fan earnings divided by all unique fans who ever subscribed.',
  'Revenue Per Fan': 'Period revenue divided by active fans. How much each fan contributes to platform revenue.',

  // Scoreboard
  'Artist Net Growth': 'Artist referrals minus artist churn. Positive = supply side growing. Negative = leaking artists faster than acquiring.',
  'Fan Net Growth': 'Fan referrals minus fan churn. Positive = demand side growing. Fan referral tracking coming soon.',

  // Health Check
  '30-Day Health': 'Hormozi rule: 30-day profit must be ≥ 2× (CAC + COGs). Below 2× means you cannot self-fund acquisition and growth stalls.',

  // Organic vs Recruited
  'Organic Artists': 'Artists who signed up without a recruiter referral. Organic CAC is $0 — the best kind of growth.',
  'Recruited Artists': 'Artists brought in through the recruiter program. Paid acquisition — track ROI to ensure it\'s worth the spend.',
};

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

  // Fan metrics
  totalActiveFans: number;
  newFans: number;
  churnedFans: number;
  fanChurnRate: number;
  fanLTV: number;
  revenuePerFan: number;

  // Referral vs Churn Scoreboard
  scoreboard: {
    artistReferrals: number;
    artistChurned: number;
    artistNetGrowth: number;
    fanReferrals: number;
    fanChurned: number;
    fanNetGrowth: number;
    fanReferralTracked: boolean;
  };

  // Hormozi 30-Day Health Check
  thirtyDayProfit: number;
  cogsPerArtist: number;
  healthCheckRatio: number;
  healthCheckPassing: boolean;
  healthCheckThreshold: number;

  // Organic vs Recruited
  organicArtists: number;
  recruitedArtists: number;

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

// Info tooltip that shows on hover
function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex ml-1">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={(e) => { e.stopPropagation(); setShow(!show); }}
        className="text-[#555] hover:text-[#999] transition"
      >
        <Info className="w-3 h-3" />
      </button>
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-[#222] border border-[#444] rounded-lg px-3 py-2 shadow-2xl animate-[fadeInUp_0.15s_ease-out]">
          <p className="text-[#ccc] text-xs leading-relaxed">{text}</p>
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-[#444]" />
        </div>
      )}
    </span>
  );
}

// Collapsible section
function Section({ title, icon: Icon, children, defaultOpen = true, tooltip }: {
  title: string; icon: any; children: React.ReactNode; defaultOpen?: boolean; tooltip?: string;
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
        {tooltip && <InfoTooltip text={tooltip} />}
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
  const tooltip = TOOLTIPS[label];
  return (
    <div className="bg-[#1A1A1A] rounded-xl border border-[#2a2a2a] p-4">
      <div className="flex items-center mb-1">
        <p className="text-[#999] text-xs">{label}</p>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
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
      {/* AGENT INSIGHTS */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <AgentInsights userId={userId} />

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* HERO — LGP:CAC Ratio */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="mb-8 bg-[#1A1A1A] rounded-2xl border border-[#2a2a2a] p-6 md:p-8">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-1 mb-2">
            <p className="text-[#999] text-sm">The Number That Matters</p>
            <InfoTooltip text={TOOLTIPS['LGP:CAC']} />
          </div>
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
            <div className="flex items-center justify-center gap-1 mb-1">
              <p className="text-[#999] text-xs">LGP per Artist</p>
              <InfoTooltip text={TOOLTIPS['LGP per Artist']} />
            </div>
            <p className="text-2xl font-bold text-white">{fmt(metrics.lgp)}</p>
            <p className="text-[#666] text-xs mt-1">{metrics.avgLifespanMonths}mo avg lifespan</p>
          </div>
          <div className="text-center bg-[#141414] rounded-xl p-4">
            <div className="flex items-center justify-center gap-1 mb-1">
              <p className="text-[#999] text-xs">CAC</p>
              <InfoTooltip text={TOOLTIPS['CAC']} />
            </div>
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
      <Section title="Financial Health" icon={DollarSign} tooltip="Core financial metrics that determine if the business model works. MRR is your baseline, gross margin tells you how much of each dollar you keep, and 30-day cash determines if you can self-fund growth.">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <MetricCard label="MRR" value={fmt(metrics.totalMRR)} subValue={`Platform: ${fmt(metrics.platformMRR)} + Fees: ${fmt(metrics.transactionFeeMRR)}`} color={GOLD} />
          <MetricCard label="ARR" value={fmtShort(metrics.totalARR)} />
          <MetricCard label="Gross Margin" value={`${metrics.grossMarginPct}%`} color={marginColor(metrics.grossMarginPct)} subValue={`Target: ≥80%`} />
          <MetricCard label="30-Day Health" value={`${metrics.healthCheckRatio}x`} subValue={`Target: ≥2x | Profit: ${fmt(metrics.thirtyDayProfit)} vs ${fmt(metrics.healthCheckThreshold)}`} color={metrics.healthCheckPassing ? GREEN : RED} />
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
      <Section title="Revenue Per Visitor" icon={Target} tooltip="How much revenue each site visitor generates. If this number is high, your pricing is justified and you can spend more on marketing. If it's dropping, consider raising prices or improving conversion.">
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
      {/* FAN METRICS */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Section title="Fan Metrics" icon={Heart} tooltip="Fans are the demand side of the marketplace. Without fans subscribing and purchasing, artists have no revenue — and without revenue, artists churn. Fan health is a leading indicator of artist health.">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <MetricCard label="Total Active Fans" value={metrics.totalActiveFans.toLocaleString()} color={GOLD} />
          <MetricCard label="New Fans" value={metrics.newFans.toLocaleString()} subValue={`${period} trailing`} color={GREEN} />
          <MetricCard label="Churned Fans" value={metrics.churnedFans.toLocaleString()} subValue={`${period} trailing`} color={metrics.churnedFans > 0 ? RED : GREEN} />
          <MetricCard label="Fan Churn Rate" value={`${metrics.fanChurnRate}%`} subValue="platform-level" color={churnColor(metrics.fanChurnRate)} />
          <MetricCard label="Fan LTV" value={fmt(metrics.fanLTV)} subValue="all-time avg" />
          <MetricCard label="Revenue Per Fan" value={fmt(metrics.revenuePerFan)} subValue={`${period} trailing`} color={GOLD} />
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* REFERRAL VS CHURN SCOREBOARD */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Section title="Referral vs Churn Scoreboard" icon={ArrowUpDown} tooltip="Hormozi rule: you need more referrals than people who churn. If net growth is negative on either side, you're shrinking — fix the leak before scaling acquisition.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Artist Side */}
          <div className="bg-[#141414] rounded-xl border border-[#2a2a2a] p-5">
            <p className="text-white text-sm font-medium mb-4">Artist Side (Supply)</p>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[#999] text-sm">Referrals</span>
                <span className="text-green-400 font-bold text-lg">{metrics.scoreboard.artistReferrals}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#999] text-sm">Churned</span>
                <span className="text-red-400 font-bold text-lg">{metrics.scoreboard.artistChurned}</span>
              </div>
              <div className="border-t border-[#2a2a2a] pt-3 flex justify-between items-center">
                <div className="flex items-center gap-1">
                  <span className="text-white text-sm font-medium">Net Growth</span>
                  <InfoTooltip text={TOOLTIPS['Artist Net Growth']} />
                </div>
                <span className={`font-black text-2xl ${metrics.scoreboard.artistNetGrowth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {metrics.scoreboard.artistNetGrowth >= 0 ? '+' : ''}{metrics.scoreboard.artistNetGrowth}
                </span>
              </div>
            </div>
          </div>

          {/* Fan Side */}
          <div className="bg-[#141414] rounded-xl border border-[#2a2a2a] p-5">
            <p className="text-white text-sm font-medium mb-4">Fan Side (Demand)</p>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[#999] text-sm">Referrals</span>
                {metrics.scoreboard.fanReferralTracked ? (
                  <span className="text-green-400 font-bold text-lg">{metrics.scoreboard.fanReferrals}</span>
                ) : (
                  <span className="text-[#555] text-xs bg-[#1A1A1A] px-2 py-1 rounded-full">Not yet tracked</span>
                )}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#999] text-sm">Churned</span>
                <span className="text-red-400 font-bold text-lg">{metrics.scoreboard.fanChurned}</span>
              </div>
              <div className="border-t border-[#2a2a2a] pt-3 flex justify-between items-center">
                <div className="flex items-center gap-1">
                  <span className="text-white text-sm font-medium">Net Growth</span>
                  <InfoTooltip text={TOOLTIPS['Fan Net Growth']} />
                </div>
                {metrics.scoreboard.fanReferralTracked ? (
                  <span className={`font-black text-2xl ${metrics.scoreboard.fanNetGrowth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {metrics.scoreboard.fanNetGrowth >= 0 ? '+' : ''}{metrics.scoreboard.fanNetGrowth}
                  </span>
                ) : (
                  <span className="text-red-400 font-black text-2xl">-{metrics.scoreboard.fanChurned}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* RETENTION */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Section title="Retention & Churn" icon={Activity} tooltip="Retention is 5-25x cheaper than acquisition. Churn rate directly determines average lifespan, which directly multiplies LGP. Reducing churn from 10% to 5% doubles the lifetime value of every artist.">
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
      <Section title="Acquisition & Recruiters" icon={Users} tooltip="How much it costs to bring artists onto the platform through your influencer/recruiter program. This is the CAC side of the LGP:CAC ratio. Track which recruiters bring in artists that stick vs. churn before qualifying.">
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

        {/* Organic vs Recruited */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <MetricCard label="Organic Artists" value={metrics.organicArtists.toString()} subValue={`${metrics.totalArtists > 0 ? Math.round((metrics.organicArtists / metrics.totalArtists) * 100) : 0}% of total — $0 CAC`} color={GREEN} />
          <MetricCard label="Recruited Artists" value={metrics.recruitedArtists.toString()} subValue={`${metrics.totalArtists > 0 ? Math.round((metrics.recruitedArtists / metrics.totalArtists) * 100) : 0}% of total — paid acquisition`} color={GOLD} />
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
      <Section title="Projections" icon={TrendingUp} tooltip="Where the business is heading if nothing changes. Sales velocity × LGP = future revenue ceiling. Velocity ÷ churn = max customer count. If current revenue is below the max, the business is still growing. If above, it's shrinking.">
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
