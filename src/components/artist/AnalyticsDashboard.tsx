'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, BarChart, Bar, Legend 
} from 'recharts';

interface AnalyticsResponse {
  revenue: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    lastMonth: number;
    allTime: number;
    byType: Record<string, number>;
    monthlyTrend: { month: string; revenue: number; earnings_count: number }[];
  };
  subscribers: {
    active: number;
    newThisMonth: number;
    churnedThisMonth: number;
    churnRate: number;
    mrr: number;
    arpu: number;
    ltv: number;
    byTier: { tierName: string; count: number }[];
    growth: { month: string; total: number; new: number; churned: number }[];
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

export function AnalyticsDashboard() {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [isLoading, setIsLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [musicData, setMusicData] = useState<MusicData | null>(null);
  const [milestones, setMilestones] = useState<MilestoneData[]>([]);

  const loadData = useCallback(async () => {
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

      // Fetch analytics from API
      const res = await fetch(`/api/analytics?artistId=${artistId}`);
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
        thisMonth: 0, // Not tracked in current schema
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
  }, [user, supabase]);

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
    <div className="space-y-8">
      {/* ========== MILESTONES SECTION ========== */}
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

      {/* ========== REVENUE SECTION ========== */}
      <section>
        <h3 className="text-lg font-semibold text-crwn-text mb-4">Revenue</h3>
        
        {/* Top Stats - MRR, This Month, All Time, Revenue Split */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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

        {/* Revenue Trend Chart */}
        <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
          <p className="text-sm text-crwn-text-secondary mb-2">Monthly Revenue Trend</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.revenue.monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="month" stroke="#666" fontSize={12} />
                <YAxis stroke="#666" fontSize={12} tickFormatter={(v) => `$${v/100}`} />
                <Tooltip formatter={(value: number | undefined) => formatCurrency(value || 0)} />
                <Line type="monotone" dataKey="revenue" stroke="#D4AF37" strokeWidth={2} dot={{ fill: '#D4AF37' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* ========== SUBSCRIBERS SECTION ========== */}
      <section>
        <h3 className="text-lg font-semibold text-crwn-text mb-4">Subscribers</h3>
        
        {/* Top Stats - Active, ARPU, Churn Rate, LTV */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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

        {/* Subscriber Growth Chart */}
        {analytics.subscribers.growth.length > 0 && (
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-sm text-crwn-text-secondary mb-2">Subscriber Growth (6 months)</p>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.subscribers.growth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="month" stroke="#666" fontSize={12} />
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
      </section>

      {/* ========== TOP FANS SECTION ========== */}
      <section>
        <h3 className="text-lg font-semibold text-crwn-text mb-4">Top Fans</h3>
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
      <section>
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
    </div>
  );
}
