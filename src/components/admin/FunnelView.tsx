'use client';

import { useState, useEffect } from 'react';
import { Loader2, ArrowDown, TrendingUp, Clock, Users, MousePointerClick } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts';

interface FunnelData {
  funnel: {
    clicks: number;
    signups: number;
    onboarded: number;
    first_track: number;
    tiers_created: number;
    stripe_connected: number;
    paid_tier: number;
    first_subscriber: number;
  };
  timeToMilestone: Record<string, number | null>;
  sourceBreakdown: Record<string, number>;
  weeklyTrend: { week: string; signups: number; activated: number }[];
  totalArtists: number;
  filteredArtists: number;
}

const SOURCES = [
  { id: 'all', label: 'All Sources' },
  { id: 'organic', label: 'Organic' },
  { id: 'recruiter', label: 'Recruiter' },
  { id: 'partner', label: 'Partner' },
  { id: 'founding', label: 'Founding' },
];

const PERIODS = [
  { id: '30', label: '30d' },
  { id: '90', label: '90d' },
  { id: 'all', label: 'All Time' },
];

const FUNNEL_STAGES = [
  { key: 'clicks', label: 'Link Clicks', color: '#6366f1' },
  { key: 'signups', label: 'Signups', color: '#8b5cf6' },
  { key: 'onboarded', label: 'Onboarded', color: '#a855f7' },
  { key: 'first_track', label: 'First Track', color: '#c084fc' },
  { key: 'tiers_created', label: 'Tiers Created', color: '#D4AF37' },
  { key: 'stripe_connected', label: 'Stripe Connected', color: '#d4af37' },
  { key: 'paid_tier', label: 'Paid Tier', color: '#22c55e' },
  { key: 'first_subscriber', label: 'First Subscriber', color: '#10b981' },
];

const MILESTONE_LABELS: Record<string, string> = {
  onboarding_completed: 'Onboarding',
  first_track_uploaded: 'First Track',
  tiers_created: 'Tiers Created',
  stripe_connected: 'Stripe Connected',
  first_subscriber: 'First Subscriber',
};

const SOURCE_COLORS: Record<string, string> = {
  organic: '#6366f1',
  recruiter: '#8b5cf6',
  partner: '#D4AF37',
  founding: '#22c55e',
};

function conversionRate(from: number, to: number): string {
  if (from === 0) return '—';
  return `${Math.round((to / from) * 100)}%`;
}

export default function FunnelView() {
  const [data, setData] = useState<FunnelData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [source, setSource] = useState('all');
  const [period, setPeriod] = useState('90');

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/admin/funnel?source=${source}&period=${period}`);
        const json = await res.json();
        setData(json);
      } catch { /* silent */ }
      finally { setIsLoading(false); }
    }
    load();
  }, [source, period]);

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-crwn-gold" />
      </div>
    );
  }

  const { funnel, timeToMilestone, sourceBreakdown, weeklyTrend } = data;

  // Build funnel bars — skip clicks for organic/founding (no referral links)
  const showClicks = source === 'all' || source === 'recruiter' || source === 'partner';
  const stages = showClicks ? FUNNEL_STAGES : FUNNEL_STAGES.filter(s => s.key !== 'clicks');
  const funnelBars = stages.map(s => ({
    ...s,
    value: funnel[s.key as keyof typeof funnel] || 0,
  }));

  // Top-of-funnel count for overall conversion
  const topOfFunnel = showClicks && funnel.clicks > 0 ? funnel.clicks : funnel.signups;

  // Source breakdown chart data
  const sourceChartData = Object.entries(sourceBreakdown).map(([key, val]) => ({
    name: key.charAt(0).toUpperCase() + key.slice(1),
    value: val,
    fill: SOURCE_COLORS[key] || '#6b7280',
  }));

  return (
    <div className="space-y-6">
      {/* Header + filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-crwn-text">Acquisition Funnel</h2>
          <p className="text-sm text-crwn-text-secondary mt-0.5">
            {data.filteredArtists} artists{source !== 'all' ? ` (${source})` : ''} — {data.totalArtists} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex items-center gap-1 bg-crwn-card rounded-full p-1">
            {PERIODS.map(p => (
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
        </div>
      </div>

      {/* Source filter pills */}
      <div className="flex items-center gap-1 bg-crwn-card rounded-full p-1 w-fit">
        {SOURCES.map(s => (
          <button
            key={s.id}
            onClick={() => setSource(s.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              source === s.id ? 'bg-crwn-elevated text-crwn-text' : 'text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            {s.label}
            {s.id !== 'all' && sourceBreakdown[s.id] ? (
              <span className="ml-1 text-crwn-text-dim">({sourceBreakdown[s.id]})</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-crwn-card rounded-xl p-4 border border-crwn-elevated">
          <div className="flex items-center gap-2 text-crwn-text-secondary mb-1">
            <MousePointerClick className="w-4 h-4" />
            <span className="text-xs font-medium">Click → Signup</span>
          </div>
          <p className="text-xl font-bold text-crwn-text">
            {showClicks ? conversionRate(funnel.clicks, funnel.signups) : 'N/A'}
          </p>
        </div>
        <div className="bg-crwn-card rounded-xl p-4 border border-crwn-elevated">
          <div className="flex items-center gap-2 text-crwn-text-secondary mb-1">
            <Users className="w-4 h-4" />
            <span className="text-xs font-medium">Signup → Activated</span>
          </div>
          <p className="text-xl font-bold text-crwn-text">
            {conversionRate(funnel.signups, funnel.first_subscriber)}
          </p>
        </div>
        <div className="bg-crwn-card rounded-xl p-4 border border-crwn-elevated">
          <div className="flex items-center gap-2 text-crwn-text-secondary mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-medium">Avg to First Track</span>
          </div>
          <p className="text-xl font-bold text-crwn-text">
            {timeToMilestone.first_track_uploaded != null ? `${timeToMilestone.first_track_uploaded}d` : '—'}
          </p>
        </div>
        <div className="bg-crwn-card rounded-xl p-4 border border-crwn-elevated">
          <div className="flex items-center gap-2 text-crwn-text-secondary mb-1">
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs font-medium">Overall Conversion</span>
          </div>
          <p className="text-xl font-bold text-crwn-text">
            {conversionRate(topOfFunnel, funnel.first_subscriber)}
          </p>
        </div>
      </div>

      {/* Funnel visualization */}
      <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-6">
        <h3 className="text-sm font-semibold text-crwn-text mb-4">Stage-by-Stage Funnel</h3>
        <div className="space-y-1">
          {funnelBars.map((stage, i) => {
            const maxVal = Math.max(...funnelBars.map(b => b.value), 1);
            const widthPct = Math.max((stage.value / maxVal) * 100, 2);
            const prev = i > 0 ? funnelBars[i - 1].value : 0;
            const dropoff = i > 0 ? conversionRate(prev, stage.value) : '';

            return (
              <div key={stage.key}>
                {i > 0 && (
                  <div className="flex items-center gap-2 py-1 pl-4">
                    <ArrowDown className="w-3 h-3 text-crwn-text-dim" />
                    <span className="text-xs text-crwn-text-dim">{dropoff}</span>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <div className="w-32 shrink-0 text-right">
                    <span className="text-xs text-crwn-text-secondary">{stage.label}</span>
                  </div>
                  <div className="flex-1 h-8 bg-crwn-elevated rounded-lg overflow-hidden">
                    <div
                      className="h-full rounded-lg flex items-center px-3 transition-all duration-500"
                      style={{ width: `${widthPct}%`, backgroundColor: stage.color }}
                    >
                      <span className="text-xs font-bold text-white whitespace-nowrap">
                        {stage.value}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom row: time-to-milestone + trend chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Time to milestone */}
        <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-6">
          <h3 className="text-sm font-semibold text-crwn-text mb-4">Avg Time to Milestone</h3>
          <div className="space-y-3">
            {Object.entries(MILESTONE_LABELS).map(([key, label]) => {
              const days = timeToMilestone[key];
              return (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm text-crwn-text-secondary">{label}</span>
                  <span className="text-sm font-medium text-crwn-text">
                    {days != null ? `${days} days` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Source breakdown */}
        {source === 'all' && sourceChartData.length > 0 && (
          <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-6">
            <h3 className="text-sm font-semibold text-crwn-text mb-4">Signups by Source</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={sourceChartData} layout="vertical" margin={{ left: 0, right: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={80} tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 8, color: '#fff', fontSize: 12 }}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={24}>
                  {sourceChartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Weekly trend */}
        {source !== 'all' || sourceChartData.length === 0 ? (
          <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-6">
            <h3 className="text-sm font-semibold text-crwn-text mb-4">Weekly Trend (12 weeks)</h3>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={weeklyTrend} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 8, color: '#fff', fontSize: 12 }}
                />
                <Area type="monotone" dataKey="signups" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} strokeWidth={2} name="Signups" />
                <Area type="monotone" dataKey="activated" stroke="#D4AF37" fill="#D4AF37" fillOpacity={0.2} strokeWidth={2} name="Activated" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </div>

      {/* Weekly trend (shown when source is "all" AND source breakdown is shown above) */}
      {source === 'all' && sourceChartData.length > 0 && (
        <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-6">
          <h3 className="text-sm font-semibold text-crwn-text mb-4">Weekly Trend (12 weeks)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={weeklyTrend} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
              <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 8, color: '#fff', fontSize: 12 }}
              />
              <Area type="monotone" dataKey="signups" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} strokeWidth={2} name="Signups" />
              <Area type="monotone" dataKey="activated" stroke="#D4AF37" fill="#D4AF37" fillOpacity={0.2} strokeWidth={2} name="Activated" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
