'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, BarChart, Bar 
} from 'recharts';

interface AnalyticsData {
  revenue: {
    total: number;
    thisMonth: number;
    lastMonth: number;
    subscriptions: number;
    shop: number;
    monthlyTrend: { month: string; revenue: number }[];
  };
  subscribers: {
    total: number;
    thisMonth: number;
    churn: number;
    byTier: { tierName: string; count: number }[];
  };
  shop: {
    totalSold: number;
    thisMonth: number;
    bestSellers: { title: string; quantity: number }[];
    recent: { fanName: string; product: string; amount: number; date: string }[];
  };
  music: {
    totalPlays: number;
    thisMonth: number;
    lastMonth: number;
    topTracks: { title: string; plays: number }[];
  };
  fans: {
    total: number;
    recent: { fanName: string; action: string; date: string }[];
  };
}

const COLORS = ['#D4AF37', '#3B82F6', '#8B5CF6', '#10B981'];

export function AnalyticsDashboard() {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);

  const loadAnalytics = useCallback(async () => {
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
      const now = new Date();
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();

      // Revenue queries
      // Subscriptions revenue
      const { data: subscriptions } = await supabase
        .from('subscriptions')
        .select('tier:subscription_tiers(price), created_at')
        .eq('artist_id', artistId)
        .eq('status', 'active');

      const totalSubRevenue = (subscriptions || []).reduce((sum, s: any) => sum + (s.tier?.price || 0), 0);

      // Shop purchases revenue
      const { data: purchases } = await supabase
        .from('purchases')
        .select('amount, purchased_at')
        .eq('artist_id', artistId)
        .eq('status', 'completed');

      const totalShopRevenue = (purchases || []).reduce((sum, p) => sum + (p.amount || 0), 0);

      // This month revenue
      const thisMonthPurchases = (purchases || []).filter((p: any) => p.purchased_at >= thisMonthStart);
      const thisMonthShopRevenue = thisMonthPurchases.reduce((sum, p: any) => sum + (p.amount || 0), 0);
      const thisMonthSubRevenue = (subscriptions || []).filter((s: any) => s.created_at >= thisMonthStart).reduce((sum, s: any) => sum + (s.tier?.price || 0), 0);

      // Last month revenue
      const lastMonthPurchases = (purchases || []).filter((p: any) => p.purchased_at >= lastMonthStart && p.purchased_at <= lastMonthEnd);
      const lastMonthShopRevenue = lastMonthPurchases.reduce((sum, p: any) => sum + (p.amount || 0), 0);
      const lastMonthSubRevenue = (subscriptions || []).filter((s: any) => s.created_at >= lastMonthStart && s.created_at <= lastMonthEnd).reduce((sum, s: any) => sum + (s.tier?.price || 0), 0);

      // Monthly trend (last 6 months)
      const monthlyTrend: { month: string; revenue: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
        const monthLabel = monthStart.toLocaleDateString('en-US', { month: 'short' });
        
        const monthPurchases = (purchases || []).filter((p: any) => 
          p.purchased_at >= monthStart.toISOString() && p.purchased_at <= monthEnd.toISOString()
        );
        const monthShopRev = monthPurchases.reduce((sum, p: any) => sum + (p.amount || 0), 0);
        const monthSubRev = (subscriptions || []).filter((s: any) => 
          s.created_at >= monthStart.toISOString() && s.created_at <= monthEnd.toISOString()
        ).reduce((sum, s: any) => sum + (s.tier?.price || 0), 0);

        monthlyTrend.push({ month: monthLabel, revenue: monthShopRev + monthSubRev });
      }

      // Subscribers
      const { data: allSubs } = await supabase
        .from('subscriptions')
        .select('tier:subscription_tiers(name), created_at, status, canceled_at')
        .eq('artist_id', artistId);

      const activeSubs = (allSubs || []).filter((s: any) => s.status === 'active');
      const newSubsThisMonth = activeSubs.filter((s: any) => s.created_at >= thisMonthStart).length;
      const churnThisMonth = (allSubs || []).filter((s: any) => 
        s.status === 'canceled' && s.canceled_at >= thisMonthStart
      ).length;

      // Subs by tier
      const tierCounts: Record<string, number> = {};
      activeSubs.forEach((s: any) => {
        const tierName = s.tier?.name || 'Unknown';
        tierCounts[tierName] = (tierCounts[tierName] || 0) + 1;
      });
      const byTier = Object.entries(tierCounts).map(([tierName, count]) => ({ tierName, count }));

      // Shop metrics
      const totalSold = (purchases || []).length;
      const thisMonthSold = thisMonthPurchases.length;

      const { data: products } = await supabase
        .from('products')
        .select('title, quantity_sold')
        .eq('artist_id', artistId)
        .eq('is_active', true)
        .order('quantity_sold', { ascending: false })
        .limit(5);

      const bestSellers = (products || []).map(p => ({ title: p.title, quantity: p.quantity_sold || 0 }));

      // Recent purchases
      const { data: recentPurchases } = await supabase
        .from('purchases')
        .select('amount, purchased_at, fan:profiles!fan_id(display_name), product:products(title)')
        .eq('artist_id', artistId)
        .eq('status', 'completed')
        .order('purchased_at', { ascending: false })
        .limit(10);

      const recentShop = (recentPurchases || []).map((p: any) => ({
        fanName: p.fan?.display_name || 'Fan',
        product: p.product?.title || 'Product',
        amount: p.amount || 0,
        date: new Date(p.purchased_at).toLocaleDateString()
      }));

      // Music plays (if play_history exists)
      let totalPlays = 0;
      let thisMonthPlays = 0;
      let lastMonthPlays = 0;
      let topTracks: { title: string; plays: number }[] = [];

      // Try to get from tracks play_count if available, otherwise use placeholder
      const { data: tracks } = await supabase
        .from('tracks')
        .select('title, play_count')
        .eq('artist_id', artistId)
        .order('play_count', { ascending: false })
        .limit(10);

      totalPlays = (tracks || []).reduce((sum, t) => sum + (t.play_count || 0), 0);
      topTracks = (tracks || []).map(t => ({ title: t.title, plays: t.play_count || 0 }));

      // Fans
      const uniqueFans = new Set([
        ...activeSubs.map((s: any) => s.fan_id),
        ...(purchases || []).map((p: any) => p.fan_id)
      ]).size;

      // Recent fan activity
      const recentActivity: { fanName: string; action: string; date: string }[] = [];
      
      // Recent subscriptions
      const { data: recentSubs } = await supabase
        .from('subscriptions')
        .select('fan:profiles!fan_id(display_name), created_at')
        .eq('artist_id', artistId)
        .order('created_at', { ascending: false })
        .limit(5);

      (recentSubs || []).forEach((s: any) => {
        recentActivity.push({
          fanName: s.fan?.display_name || 'Fan',
          action: 'Subscribed',
          date: new Date(s.created_at).toLocaleDateString()
        });
      });

      // Recent purchases
      (recentPurchases || []).forEach((p: any) => {
        recentActivity.push({
          fanName: p.fan?.display_name || 'Fan',
          action: 'Purchased',
          date: new Date(p.purchased_at).toLocaleDateString()
        });
      });

      // Sort by date and take last 10
      recentActivity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setData({
        revenue: {
          total: totalSubRevenue + totalShopRevenue,
          thisMonth: thisMonthShopRevenue + thisMonthSubRevenue,
          lastMonth: lastMonthShopRevenue + lastMonthSubRevenue,
          subscriptions: totalSubRevenue,
          shop: totalShopRevenue,
          monthlyTrend
        },
        subscribers: {
          total: activeSubs.length,
          thisMonth: newSubsThisMonth,
          churn: churnThisMonth,
          byTier
        },
        shop: {
          totalSold,
          thisMonth: thisMonthSold,
          bestSellers,
          recent: recentShop
        },
        music: {
          totalPlays,
          thisMonth: thisMonthPlays,
          lastMonth: lastMonthPlays,
          topTracks
        },
        fans: {
          total: uniqueFans,
          recent: recentActivity.slice(0, 10)
        }
      });
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, supabase]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }

  if (!data) {
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

  const revenuePieData = [
    { name: 'Subscriptions', value: data.revenue.subscriptions },
    { name: 'Shop', value: data.revenue.shop }
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-8">
      {/* Revenue Section */}
      <section>
        <h3 className="text-lg font-semibold text-crwn-text mb-4">Revenue</h3>
        
        {/* Top Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-sm text-crwn-text-secondary">Total Revenue</p>
            <p className="text-2xl font-bold text-crwn-text">{formatCurrency(data.revenue.total)}</p>
          </div>
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-sm text-crwn-text-secondary">This Month</p>
            <p className="text-2xl font-bold text-crwn-text">{formatCurrency(data.revenue.thisMonth)}</p>
            <p className={`text-sm ${data.revenue.thisMonth >= data.revenue.lastMonth ? 'text-green-500' : 'text-crwn-error'}`}>
              {data.revenue.thisMonth >= data.revenue.lastMonth ? '↑' : '↓'} {Math.abs(Number(getPercentChange(data.revenue.thisMonth, data.revenue.lastMonth)))}%
            </p>
          </div>
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-sm text-crwn-text-secondary">Revenue Split</p>
            <div className="h-20">
              {revenuePieData.length > 0 && (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={revenuePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={20} outerRadius={35}>
                      {revenuePieData.map((_, index) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Revenue Trend Chart */}
        <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
          <p className="text-sm text-crwn-text-secondary mb-2">Monthly Revenue Trend</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.revenue.monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="month" stroke="#666" fontSize={12} />
                <YAxis stroke="#666" fontSize={12} tickFormatter={(v) => `$${v/100}`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Line type="monotone" dataKey="revenue" stroke="#D4AF37" strokeWidth={2} dot={{ fill: '#D4AF37' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Subscribers Section */}
      <section>
        <h3 className="text-lg font-semibold text-crwn-text mb-4">Subscribers</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-sm text-crwn-text-secondary">Total Active</p>
            <p className="text-2xl font-bold text-crwn-text">{data.subscribers.total}</p>
          </div>
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-sm text-crwn-text-secondary">New This Month</p>
            <p className="text-2xl font-bold text-crwn-text">+{data.subscribers.thisMonth}</p>
          </div>
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-sm text-crwn-text-secondary">Churn This Month</p>
            <p className="text-2xl font-bold text-crwn-error">-{data.subscribers.churn}</p>
          </div>
        </div>

        {/* Subs by Tier */}
        {data.subscribers.byTier.length > 0 && (
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-sm text-crwn-text-secondary mb-2">By Tier</p>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.subscribers.byTier} layout="vertical">
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
      </section>

      {/* Shop Section */}
      <section>
        <h3 className="text-lg font-semibold text-crwn-text mb-4">Shop</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-sm text-crwn-text-secondary">Total Sold</p>
            <p className="text-2xl font-bold text-crwn-text">{data.shop.totalSold}</p>
          </div>
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-sm text-crwn-text-secondary">This Month</p>
            <p className="text-2xl font-bold text-crwn-text">{data.shop.thisMonth}</p>
          </div>
        </div>

        {/* Best Sellers */}
        {data.shop.bestSellers.length > 0 && (
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated mb-4">
            <p className="text-sm text-crwn-text-secondary mb-2">Best Sellers</p>
            <div className="space-y-2">
              {data.shop.bestSellers.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-crwn-text">{item.title}</span>
                  <span className="text-crwn-gold">{item.quantity} sold</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Purchases */}
        {data.shop.recent.length > 0 && (
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-sm text-crwn-text-secondary mb-2">Recent Purchases</p>
            <div className="space-y-2">
              {data.shop.recent.slice(0, 5).map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-crwn-text">{item.fanName}</span>
                  <span className="text-crwn-text-secondary">{item.product}</span>
                  <span className="text-crwn-gold">{formatCurrency(item.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Music Section */}
      <section>
        <h3 className="text-lg font-semibold text-crwn-text mb-4">Music</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-sm text-crwn-text-secondary">Total Plays</p>
            <p className="text-2xl font-bold text-crwn-text">{data.music.totalPlays.toLocaleString()}</p>
          </div>
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-sm text-crwn-text-secondary">This Month</p>
            <p className="text-2xl font-bold text-crwn-text">{data.music.thisMonth}</p>
          </div>
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-sm text-crwn-text-secondary">Last Month</p>
            <p className="text-2xl font-bold text-crwn-text">{data.music.lastMonth}</p>
          </div>
        </div>

        {data.music.topTracks.length > 0 && (
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-sm text-crwn-text-secondary mb-2">Top Tracks</p>
            <div className="space-y-2">
              {data.music.topTracks.slice(0, 5).map((track, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-crwn-text truncate flex-1">{i + 1}. {track.title}</span>
                  <span className="text-crwn-gold ml-2">{track.plays} plays</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Fans Section */}
      <section>
        <h3 className="text-lg font-semibold text-crwn-text mb-4">Fans</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-sm text-crwn-text-secondary">Unique Fans</p>
            <p className="text-2xl font-bold text-crwn-text">{data.fans.total}</p>
          </div>
          
          {data.fans.recent.length > 0 && (
            <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
              <p className="text-sm text-crwn-text-secondary mb-2">Recent Activity</p>
              <div className="space-y-2">
                {data.fans.recent.slice(0, 5).map((activity, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-crwn-text">{activity.fanName}</span>
                    <span className={`${activity.action === 'Subscribed' ? 'text-crwn-gold' : 'text-blue-400'}`}>
                      {activity.action}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
