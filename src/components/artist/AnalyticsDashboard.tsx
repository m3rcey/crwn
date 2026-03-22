'use client';

import { useState, useEffect, useCallback } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, BarChart, Bar, Legend 
} from 'recharts';

interface Analytics {
  revenue: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    lastMonth: number;
    allTime: number;
    byType: Record<string, number>;
    trend: { daily: { label: string; revenue: number; earnings_count: number }[]; weekly: { label: string; revenue: number; earnings_count: number }[]; monthly: { label: string; revenue: number; earnings_count: number }[] };
    revenuePerPlay: number;
  };
  subscribers: {
    active: number;
    newThisMonth: number;
    churnedThisMonth: number;
    churnRate: number;
    mrr: number;
    arpu: number;
    ltv: number;
    avgLifespanMonths: number;
    byTier: { tierName: string; count: number }[];
    trend: { daily: { label: string; total: number; new: number; churned: number }[]; weekly: { label: string; total: number; new: number; churned: number }[]; monthly: { label: string; total: number; new: number; churned: number }[] };
    billingMix: { monthly: number; annual: number };
    fanActivity: { active: number; atRisk: number; churning: number };
  };
  projections: {
    salesVelocity: number;
    hypotheticalMaxMRR: number;
    hypotheticalMaxSubscribers: number;
  };
  referrals: {
    totalReferrals: number;
    activeReferrals: number;
    totalCommissionPaid: number;
    topReferrers: { fanId: string; name: string; referralCount: number; totalEarned: number }[];
  };
  plays: {
    total: number;
    trend: { daily: { label: string; plays: number }[]; weekly: { label: string; plays: number }[]; monthly: { label: string; plays: number }[] };
  };
  topFans: { fanId: string; name: string; totalSpent: number }[];
  geography: {
    topCities: { name: string; count: number }[];
    topStates: { name: string; count: number }[];
    topCountries: { name: string; count: number }[];
    topCitiesByRevenue: { name: string; revenue: number }[];
    topStatesByRevenue: { name: string; revenue: number }[];
  };
}

interface MusicData {
  totalPlays: number;
  thisMonth: number;
  lastMonth: number;
  topTracks: { title: string; plays: number }[];
}

interface MilestoneData {
  key: string;
  name: string;
  emoji: string;
  unlocked: boolean;
  unlockedAt: string | null;
  progress: number;
  current: number;
  target: number;
}

const COLORS = ['#D4AF37', '#3B82F6', '#8B5CF6', '#10B981'];

// Period Toggle Component
function PeriodToggle({ value, onChange }: { value: string; onChange: (v: 'daily' | 'weekly' | 'monthly') => void }) {
  return (
    <div className="flex gap-1 bg-crwn-elevated rounded-full p-0.5">
      {(['daily', 'weekly', 'monthly'] as const).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
            value === p
              ? 'bg-crwn-gold text-black'
              : 'text-crwn-text-secondary hover:text-crwn-text'
          }`}
        >
          {p.charAt(0).toUpperCase() + p.slice(1)}
        </button>
      ))}
    </div>
  );
}

export function AnalyticsDashboard({ platformTier = 'starter' }: { platformTier?: string }) {
  const isAdvanced = platformTier !== 'starter';
  const supabase = createBrowserSupabaseClient();
  const [isLoading, setIsLoading] = useState(true);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [musicData, setMusicData] = useState<MusicData | null>(null);
  const [milestones, setMilestones] = useState<MilestoneData[]>([]);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('monthly');

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setIsLoading(true);

    try {
      // Get artist profile
      const { data: artistProfile } = await supabase
        .from('artist_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!artistProfile) {
        setIsLoading(false);
        return;
      }

      const artistId = artistProfile.id;

      // Fetch analytics from API with period
      const res = await fetch(`/api/analytics?artistId=${artistId}&period=all`);
      const analyticsData = await res.json();
      setAnalytics(analyticsData);

      // Keep music section - query tracks directly (API doesn't cover play data)
      const { data: tracks } = await supabase
        .from('tracks')
        .select('title, play_count')
        .eq('artist_id', artistId)
        .order('play_count', { ascending: false })
        .limit(10);

      const trackList = tracks || [];
      const totalPlays = trackList.reduce((sum, t) => sum + (t.play_count || 0), 0);
      const topTracks = trackList.map(t => ({ title: t.title, plays: t.play_count || 0 }));

      setMusicData({
        totalPlays,
        thisMonth: 0,
        lastMonth: 0,
        topTracks
      });

      // Fetch milestones
      const msRes = await fetch(`/api/milestones?artistId=${artistId}`);
      const msData = await msRes.json();
      if (msData.milestones) setMilestones(msData.milestones);

    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-12 text-crwn-text-secondary">
        No analytics data available
      </div>
    );
  }

  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const getPercentChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous * 100).toFixed(1);
  };

  // Revenue pie data from API
  const revenuePieData = Object.entries(analytics.revenue.byType)
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({ 
      name: name.charAt(0).toUpperCase() + name.slice(1), 
      value 
    }));

  return (
    <div className="stagger-fade-in space-y-8">
      {/* ========== MILESTONES SECTION ========== */}


      {/* ========== REVENUE SECTION ========== */}
      <section>
        <h3 className="text-lg font-semibold text-crwn-text mb-4" data-tour="analytics-revenue">Revenue</h3>
        
        {/* Top Stats - MRR, This Month, All Time, Rev/Play, Revenue Split */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">MRR</p>
            <p className="text-2xl font-bold text-crwn-gold mt-1">{formatCurrency(analytics.subscribers.mrr)}</p>
          </div>
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">This Month</p>
            <p className="text-2xl font-bold text-crwn-text mt-1">{formatCurrency(analytics.revenue.thisMonth)}</p>
            <p className={`text-xs ${analytics.revenue.thisMonth >= analytics.revenue.lastMonth ? 'text-green-500' : 'text-crwn-error'}`}>
              {analytics.revenue.thisMonth >= analytics.revenue.lastMonth ? '↑' : '↓'} {Math.abs(Number(getPercentChange(analytics.revenue.thisMonth, analytics.revenue.lastMonth)))}%
            </p>
          </div>
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">All Time</p>
            <p className="text-2xl font-bold text-crwn-text mt-1">{formatCurrency(analytics.revenue.allTime)}</p>
          </div>
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated col-span-2 lg:col-span-1">
            <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">Revenue Per Play</p>
            <p className="text-2xl font-bold text-crwn-gold mt-1">{formatCurrency(analytics.revenue.revenuePerPlay)}</p>
            <p className="text-xs text-crwn-text-secondary mt-0.5">vs Spotify ~$0.003</p>
          </div>
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-xs text-crwn-text-secondary uppercase tracking-wide mb-2">Revenue Split</p>
            <div className="h-16">
              {revenuePieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie 
                      data={revenuePieData} 
                      dataKey="value" 
                      nameKey="name" 
                      cx="50%" 
                      cy="50%" 
                      innerRadius={18} 
                      outerRadius={30}
                    >
                      {revenuePieData.map((_, index) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number | undefined) => formatCurrency(value || 0)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-crwn-text-secondary">No data</p>
              )}
            </div>
          </div>
        </div>

        {/* Revenue Trend Chart with Period Toggle */}
        <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-crwn-text-secondary">Revenue Trend</p>
            <PeriodToggle value={period} onChange={setPeriod} />
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.revenue.trend[period]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="label" stroke="#666" fontSize={12} />
                <YAxis stroke="#666" fontSize={12} tickFormatter={(v) => `$${v/100}`} />
                <Tooltip formatter={(value: number | undefined) => formatCurrency(value || 0)} />
                <Line type="monotone" dataKey="revenue" stroke="#D4AF37" strokeWidth={2} dot={{ fill: '#D4AF37' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* ========== SUBSCRIBERS SECTION ========== */}
      <section style={!isAdvanced ? { display: "none" } : undefined}>
        <h3 className="text-lg font-semibold text-crwn-text mb-4" data-tour="analytics-subscribers">Subscribers</h3>
        
        {/* Top Stats - Active, ARPU, Churn Rate, Avg Lifespan, LTV */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">Active</p>
            <p className="text-2xl font-bold text-crwn-text mt-1">{analytics.subscribers.active}</p>
          </div>
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">ARPU</p>
            <p className="text-2xl font-bold text-crwn-text mt-1">{formatCurrency(analytics.subscribers.arpu)}</p>
          </div>
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">Churn Rate</p>
            <p className={`text-2xl font-bold mt-1 ${analytics.subscribers.churnRate > 5 ? 'text-crwn-error' : analytics.subscribers.churnRate < 3 ? 'text-green-500' : 'text-crwn-text'}`}>
              {analytics.subscribers.churnRate}%
            </p>
          </div>
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">Avg Lifespan</p>
            <p className="text-2xl font-bold text-crwn-text mt-1">{analytics.subscribers.avgLifespanMonths}mo</p>
            <p className="text-xs text-crwn-text-secondary mt-0.5">how long fans stay</p>
          </div>
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">LTV</p>
            <p className="text-2xl font-bold text-crwn-text mt-1">{formatCurrency(analytics.subscribers.ltv)}</p>
          </div>
        </div>

        {/* By Tier Chart */}
        {analytics.subscribers.byTier.length > 0 && (
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated mb-6">
            <p className="text-sm text-crwn-text-secondary mb-2">By Tier</p>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.subscribers.byTier} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis type="number" stroke="#666" fontSize={12} />
                  <YAxis dataKey="tierName" type="category" stroke="#666" fontSize={12} width={80} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#D4AF37" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Subscriber Growth Chart with Period Toggle */}
        {analytics.subscribers.trend[period].length > 0 && (
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-crwn-text-secondary">Subscriber Growth</p>
              <PeriodToggle value={period} onChange={setPeriod} />
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.subscribers.trend[period]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="label" stroke="#666" fontSize={12} />
                  <YAxis stroke="#666" fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="new" fill="#D4AF37" name="New" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="churned" fill="#EF4444" name="Churned" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="total" stroke="#3B82F6" fill="none" strokeWidth={2} name="Total" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Fan Activity Health & Billing Mix */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          {/* Fan Activity Health */}
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-sm text-crwn-text-secondary mb-3">Fan Activity Health</p>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-xs text-crwn-text-secondary">Active (7d)</span>
                  <span className="text-xs text-green-400 font-medium">{analytics.subscribers.fanActivity.active}</span>
                </div>
                <div className="h-2 bg-crwn-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all duration-700"
                    style={{ width: `${analytics.subscribers.active > 0 ? (analytics.subscribers.fanActivity.active / analytics.subscribers.active) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-xs text-crwn-text-secondary">At Risk (7-21d inactive)</span>
                  <span className="text-xs text-yellow-400 font-medium">{analytics.subscribers.fanActivity.atRisk}</span>
                </div>
                <div className="h-2 bg-crwn-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-500 rounded-full transition-all duration-700"
                    style={{ width: `${analytics.subscribers.active > 0 ? (analytics.subscribers.fanActivity.atRisk / analytics.subscribers.active) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-xs text-crwn-text-secondary">Going Cold (21d+ inactive)</span>
                  <span className="text-xs text-red-400 font-medium">{analytics.subscribers.fanActivity.churning}</span>
                </div>
                <div className="h-2 bg-crwn-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500 rounded-full transition-all duration-700"
                    style={{ width: `${analytics.subscribers.active > 0 ? (analytics.subscribers.fanActivity.churning / analytics.subscribers.active) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
            {analytics.subscribers.fanActivity.atRisk > 0 && (
              <p className="text-xs text-yellow-400/80 mt-3">
                {analytics.subscribers.fanActivity.atRisk} fan{analytics.subscribers.fanActivity.atRisk > 1 ? 's' : ''} haven&apos;t engaged in over a week — consider posting new content or reaching out.
              </p>
            )}
          </div>

          {/* Billing Mix */}
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-sm text-crwn-text-secondary mb-3">Monthly vs Annual</p>
            {(analytics.subscribers.billingMix.monthly + analytics.subscribers.billingMix.annual) > 0 ? (
              <>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Monthly', value: analytics.subscribers.billingMix.monthly },
                          { name: 'Annual', value: analytics.subscribers.billingMix.annual },
                        ].filter(d => d.value > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={55}
                        dataKey="value"
                      >
                        <Cell fill="#D4AF37" />
                        <Cell fill="#10B981" />
                      </Pie>
                      <Tooltip />
                      <Legend formatter={(value) => <span className="text-crwn-text-secondary text-xs">{value}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-crwn-text-secondary text-center mt-1">
                  Annual subscribers are less likely to churn
                </p>
              </>
            ) : (
              <p className="text-crwn-text-secondary text-sm py-4 text-center">No subscriber data yet</p>
            )}
          </div>
        </div>
      </section>

      {!isAdvanced && (
        <section className="bg-crwn-gold/10 border border-crwn-gold/20 rounded-xl p-6 text-center">
          <p className="text-lg font-bold text-crwn-text mb-1">Upgrade for Advanced Analytics</p>
          <p className="text-sm text-crwn-text-secondary mb-4">Get ARPU, churn rate, LTV, top fans, geography, and subscriber trends with Pro.</p>
          <a href="/profile/artist?tab=billing" className="inline-flex items-center gap-2 px-6 py-2.5 bg-crwn-gold text-black font-semibold rounded-full hover:brightness-110 transition-all press-scale">Upgrade to Pro</a>
        </section>
      )}

      {/* ========== REFERRAL PERFORMANCE ========== */}
      <section style={!isAdvanced ? { display: "none" } : undefined}>
        <h3 className="text-lg font-semibold text-crwn-text mb-4">Referral Program</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">Total Referrals</p>
            <p className="text-2xl font-bold text-crwn-text mt-1">{analytics.referrals.totalReferrals}</p>
          </div>
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">Active</p>
            <p className="text-2xl font-bold text-green-400 mt-1">{analytics.referrals.activeReferrals}</p>
          </div>
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">Commission Paid</p>
            <p className="text-2xl font-bold text-crwn-gold mt-1">{formatCurrency(analytics.referrals.totalCommissionPaid)}</p>
          </div>
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">Conversion Rate</p>
            <p className="text-2xl font-bold text-crwn-text mt-1">
              {analytics.subscribers.active > 0 && analytics.referrals.totalReferrals > 0
                ? `${Math.round((analytics.referrals.activeReferrals / analytics.subscribers.active) * 100)}%`
                : '—'}
            </p>
            <p className="text-xs text-crwn-text-secondary mt-0.5">of subs via referral</p>
          </div>
        </div>

        {analytics.referrals.topReferrers.length > 0 && (
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-sm text-crwn-text-secondary mb-3">Top Referrers</p>
            <div className="space-y-2">
              {analytics.referrals.topReferrers.map((ref, i) => (
                <div key={ref.fanId} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0 ? 'bg-crwn-gold text-crwn-bg' :
                      i === 1 ? 'bg-gray-400 text-crwn-bg' :
                      i === 2 ? 'bg-amber-700 text-white' :
                      'bg-crwn-elevated text-crwn-text-secondary'
                    }`}>
                      {i + 1}
                    </span>
                    <span className="text-crwn-text text-sm">{ref.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-crwn-text-secondary">{ref.referralCount} referred</span>
                    <span className="text-crwn-gold font-semibold">{formatCurrency(ref.totalEarned)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ========== PROJECTIONS ========== */}
      <section style={!isAdvanced ? { display: "none" } : undefined}>
        <h3 className="text-lg font-semibold text-crwn-text mb-4">
          Projections
          <span className="text-xs text-crwn-text-secondary font-normal ml-2">where you&apos;re heading</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">New Subs / Month</p>
            <p className="text-2xl font-bold text-crwn-text mt-1">{analytics.projections.salesVelocity}</p>
            <p className="text-xs text-crwn-text-secondary mt-0.5">trailing 3mo average</p>
          </div>
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">Projected Max MRR</p>
            <p className="text-2xl font-bold text-purple-400 mt-1">{formatCurrency(analytics.projections.hypotheticalMaxMRR)}</p>
            <p className="text-xs text-crwn-text-secondary mt-0.5">if nothing changes</p>
          </div>
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">Projected Max Subs</p>
            <p className="text-2xl font-bold text-blue-400 mt-1">{analytics.projections.hypotheticalMaxSubscribers}</p>
            <p className="text-xs text-crwn-text-secondary mt-0.5">velocity ÷ churn</p>
          </div>
        </div>
        {analytics.subscribers.mrr > 0 && analytics.projections.hypotheticalMaxMRR > analytics.subscribers.mrr && (
          <p className="text-xs text-green-400/80 mt-3 bg-green-400/5 rounded-lg px-3 py-2">
            Your MRR is heading toward {formatCurrency(analytics.projections.hypotheticalMaxMRR)}/mo — you&apos;re still growing toward your ceiling.
          </p>
        )}
      </section>

      {/* ========== PLAYS SECTION ========== */}
      <section>
        <h3 className="text-lg font-semibold text-crwn-text mb-4" data-tour="analytics-plays">Song Plays</h3>
        <div className="grid grid-cols-1 gap-4 mb-4">
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-sm text-crwn-text-secondary">Total Plays</p>
            <p className="text-2xl font-bold text-crwn-text mt-1">{analytics.plays.total.toLocaleString()}</p>
          </div>
        </div>
        {analytics.plays.trend[period].length > 0 && (
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-crwn-text-secondary">Plays Trend</p>
              <PeriodToggle value={period} onChange={setPeriod} />
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics.plays.trend[period]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="label" stroke="#666" fontSize={12} />
                  <YAxis stroke="#666" fontSize={12} />
                  <Tooltip />
                  <Line type="monotone" dataKey="plays" stroke="#3B82F6" strokeWidth={2} dot={{ fill: '#3B82F6' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </section>

      {/* ========== TOP FANS SECTION ========== */}
      <section style={!isAdvanced ? { display: "none" } : undefined}>
        <h3 className="text-lg font-semibold text-crwn-text mb-4" data-tour="analytics-top-fans">Top Fans</h3>
        <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
          {analytics.topFans.length > 0 ? (
            <div className="space-y-3">
              {analytics.topFans.map((fan, i) => (
                <div key={fan.fanId} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0 ? 'bg-crwn-gold text-crwn-bg' :
                      i === 1 ? 'bg-gray-400 text-crwn-bg' :
                      i === 2 ? 'bg-amber-700 text-white' :
                      'bg-crwn-elevated text-crwn-text-secondary'
                    }`}>
                      {i + 1}
                    </span>
                    <span className="text-crwn-text text-sm">{fan.name}</span>
                  </div>
                  <span className="text-crwn-gold font-semibold text-sm">
                    {formatCurrency(fan.totalSpent)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-crwn-text-secondary text-sm">No fan data yet</p>
          )}
        </div>
      </section>

      {/* ========== FAN GEOGRAPHY SECTION ========== */}
      <section style={!isAdvanced ? { display: "none" } : undefined}>
        <h3 className="text-lg font-semibold text-crwn-text mb-4">
          Fan Geography
          <span className="text-xs text-crwn-text-secondary font-normal ml-2">Tour Planning</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Top Cities by Fan Count */}
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-sm text-crwn-text-secondary mb-3">Top Cities (by fans)</p>
            {analytics.geography.topCities.length > 0 ? (
              <div className="space-y-2">
                {analytics.geography.topCities.slice(0, 8).map((city, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-crwn-text">{city.name}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-crwn-elevated rounded-full overflow-hidden">
                        <div
                          className="h-full bg-crwn-gold rounded-full"
                          style={{ width: `${(city.count / analytics.geography.topCities[0].count) * 100}%` }}
                        />
                      </div>
                      <span className="text-crwn-text-secondary w-8 text-right">{city.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-crwn-text-secondary text-sm">No location data yet</p>
            )}
          </div>

          {/* Top Cities by Revenue */}
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-sm text-crwn-text-secondary mb-3">Top Cities (by revenue)</p>
            {analytics.geography.topCitiesByRevenue.length > 0 ? (
              <div className="space-y-2">
                {analytics.geography.topCitiesByRevenue.slice(0, 8).map((city, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-crwn-text">{city.name}</span>
                    <span className="text-crwn-gold">{formatCurrency(city.revenue)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-crwn-text-secondary text-sm">No location data yet</p>
            )}
          </div>

          {/* Top States */}
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-sm text-crwn-text-secondary mb-3">Top States</p>
            {analytics.geography.topStates.length > 0 ? (
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.geography.topStates.slice(0, 8)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis type="number" stroke="#666" fontSize={12} />
                    <YAxis dataKey="name" type="category" stroke="#666" fontSize={11} width={60} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#D4AF37" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-crwn-text-secondary text-sm">No location data yet</p>
            )}
          </div>

          {/* Top Countries */}
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-sm text-crwn-text-secondary mb-3">Top Countries</p>
            {analytics.geography.topCountries.length > 0 ? (
              <div className="space-y-2">
                {analytics.geography.topCountries.slice(0, 8).map((country, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-crwn-text">{country.name}</span>
                    <span className="text-crwn-text-secondary">{country.count} fans</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-crwn-text-secondary text-sm">No location data yet</p>
            )}
          </div>
        </div>
      </section>

      {/* ========== MUSIC SECTION ========== */}
      {musicData && (
        <section>
          <h3 className="text-lg font-semibold text-crwn-text mb-4">Music</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
              <p className="text-sm text-crwn-text-secondary">Total Plays</p>
              <p className="text-2xl font-bold text-crwn-text">{musicData.totalPlays.toLocaleString()}</p>
            </div>
            <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
              <p className="text-sm text-crwn-text-secondary">This Month</p>
              <p className="text-2xl font-bold text-crwn-text">{musicData.thisMonth}</p>
            </div>
            <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
              <p className="text-sm text-crwn-text-secondary">Last Month</p>
              <p className="text-2xl font-bold text-crwn-text">{musicData.lastMonth}</p>
            </div>
          </div>

          {musicData.topTracks.length > 0 && (
            <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
              <p className="text-sm text-crwn-text-secondary mb-2">Top Tracks</p>
              <div className="space-y-2">
                {musicData.topTracks.slice(0, 5).map((track, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-crwn-text truncate flex-1">{i + 1}. {track.title}</span>
                    <span className="text-crwn-gold ml-2">{track.plays} plays</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {milestones.length > 0 && (
        <section>
          <h3 className="text-lg font-semibold text-crwn-text mb-4">Milestones</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {milestones.map(m => (
              <div
                key={m.key}
                className={`rounded-xl p-4 text-center transition-all ${
                  m.unlocked
                    ? 'neu-raised border border-crwn-gold/40 bg-crwn-gold/5'
                    : 'bg-crwn-surface border border-crwn-elevated opacity-60'
                }`}
              >
                <div className={`text-3xl mb-2 ${m.unlocked ? '' : 'grayscale'}`}>
                  {m.emoji}
                </div>
                <p className={`text-xs font-semibold ${
                  m.unlocked ? 'text-crwn-gold' : 'text-crwn-text-secondary'
                }`}>
                  {m.name}
                </p>
                {m.unlocked ? (
                  <p className="text-[10px] text-crwn-text-secondary mt-1">
                    {new Date(m.unlockedAt!).toLocaleDateString()}
                  </p>
                ) : (
                  <div className="mt-2">
                    <div className="w-full h-1.5 bg-crwn-elevated rounded-full overflow-hidden">
                      <div
                        className="h-full bg-crwn-gold/50 rounded-full transition-all"
                        style={{ width: `${m.progress}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-crwn-text-secondary mt-1">
                      {m.progress}%
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
