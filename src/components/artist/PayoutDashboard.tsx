'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useSearchParams } from 'next/navigation';
import { DollarSign, TrendingUp, Users, Filter, ChevronDown, ChevronUp, ShoppingBag, Calendar } from 'lucide-react';

interface Earning {
  id: string;
  artist_id: string;
  fan_id: string | null;
  type: 'subscription' | 'purchase' | 'booking' | 'tip';
  description: string;
  gross_amount: number;
  platform_fee: number;
  net_amount: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface EarningStats {
  today: number;
  thisWeek: number;
  thisMonth: number;
  allTime: number;
  activeSubscribers: number;
}

export function PayoutDashboard() {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const searchParams = useSearchParams();
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [stats, setStats] = useState<EarningStats>({
    today: 0,
    thisWeek: 0,
    thisMonth: 0,
    allTime: 0,
    activeSubscribers: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stripeLoginUrl, setStripeLoginUrl] = useState<string | null>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  const highlightEarningId = searchParams.get('earning');

  useEffect(() => {
    async function fetchData() {
      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data: artistProfile } = await supabase
        .from('artist_profiles')
        .select('id, stripe_connect_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!artistProfile) {
        setIsLoading(false);
        return;
      }

      // Get earnings
      const { data: earningsData } = await supabase
        .from('earnings')
        .select('*')
        .eq('artist_id', artistProfile.id)
        .order('created_at', { ascending: false })
        .limit(100);

      // Get active subscriber count
      const { count: subscriberCount } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact' })
        .eq('artist_id', artistProfile.id)
        .eq('status', 'active');

      // Calculate stats from earnings
      const earningsArray = earningsData || [];
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const today = earningsArray
        .filter(e => e.created_at >= todayStart)
        .reduce((sum, e) => sum + e.net_amount, 0);
      const thisWeek = earningsArray
        .filter(e => e.created_at >= weekStart.toISOString())
        .reduce((sum, e) => sum + e.net_amount, 0);
      const thisMonth = earningsArray
        .filter(e => e.created_at >= monthStart)
        .reduce((sum, e) => sum + e.net_amount, 0);
      const allTime = earningsArray.reduce((sum, e) => sum + e.net_amount, 0);

      setEarnings(earningsArray);
      setStats({
        today,
        thisWeek,
        thisMonth,
        allTime,
        activeSubscribers: subscriberCount || 0,
      });

      // Get Stripe login link if connected
      if (artistProfile.stripe_connect_id) {
        try {
          const response = await fetch('/api/stripe/login-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId: artistProfile.stripe_connect_id }),
          });
          
          if (response.ok) {
            const { url } = await response.json();
            setStripeLoginUrl(url);
          }
        } catch (err) {
          console.error('Failed to get Stripe login link:', err);
        }
      }

      setIsLoading(false);
    }

    fetchData();
  }, [user, supabase]);

  // Subscribe to realtime earnings
  useEffect(() => {
    if (!user || earnings.length === 0) return;

    const channel = supabase
      .channel('earnings-feed')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'earnings',
      }, (payload) => {
        const newEarning = payload.new as Earning;
        // Only add if it belongs to this artist
        if (earnings.some(e => e.artist_id === newEarning.artist_id)) {
          setEarnings(prev => [newEarning, ...prev]);
          // Recalculate stats
          const today = new Date().toISOString().split('T')[0];
          const weekStart = new Date();
          weekStart.setDate(weekStart.getDate() - weekStart.getDay());
          const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
          
          setStats(prev => ({
            ...prev,
            today: prev.today + newEarning.net_amount,
            thisWeek: prev.thisWeek + newEarning.net_amount,
            thisMonth: prev.thisMonth + newEarning.net_amount,
            allTime: prev.allTime + newEarning.net_amount,
          }));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, supabase]);

  // Scroll to highlighted earning
  useEffect(() => {
    if (highlightEarningId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setExpandedId(highlightEarningId);
    }
  }, [highlightEarningId, earnings]);

  const filteredEarnings = typeFilter === 'all'
    ? earnings
    : earnings.filter(e => e.type === typeFilter);

  function getTypeIcon(type: string) {
    switch (type) {
      case 'subscription': return <Users className="w-4 h-4 text-green-400" />;
      case 'purchase': return <ShoppingBag className="w-4 h-4 text-crwn-gold" />;
      case 'booking': return <Calendar className="w-4 h-4 text-blue-400" />;
      case 'tip': return <DollarSign className="w-4 h-4 text-crwn-gold" />;
      default: return <DollarSign className="w-4 h-4 text-crwn-text-secondary" />;
    }
  }

  function getTypeBgColor(type: string) {
    switch (type) {
      case 'subscription': return 'bg-green-400/10';
      case 'purchase': return 'bg-crwn-gold/10';
      case 'booking': return 'bg-blue-400/10';
      case 'tip': return 'bg-crwn-gold/10';
      default: return 'bg-crwn-elevated';
    }
  }

  function timeAgo(date: string) {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString();
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-crwn-gold" />
      </div>
    );
  }

  return (
    <div className="page-fade-in space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="neu-raised rounded-xl p-4">
          <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">Today</p>
          <p className="text-2xl font-bold text-crwn-gold mt-1">
            ${(stats.today / 100).toFixed(2)}
          </p>
        </div>
        <div className="neu-raised rounded-xl p-4">
          <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">This Week</p>
          <p className="text-2xl font-bold text-crwn-text mt-1">
            ${(stats.thisWeek / 100).toFixed(2)}
          </p>
        </div>
        <div className="neu-raised rounded-xl p-4">
          <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">This Month</p>
          <p className="text-2xl font-bold text-crwn-text mt-1">
            ${(stats.thisMonth / 100).toFixed(2)}
          </p>
        </div>
        <div className="neu-raised rounded-xl p-4">
          <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">All Time</p>
          <p className="text-2xl font-bold text-crwn-text mt-1">
            ${(stats.allTime / 100).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Active Subscribers */}
      <div className="neu-raised rounded-xl p-4 flex items-center gap-3">
        <Users className="w-5 h-5 text-green-400" />
        <div>
          <p className="text-sm text-crwn-text-secondary">Active Subscribers</p>
          <p className="text-xl font-bold text-crwn-text">{stats.activeSubscribers}</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-crwn-text-secondary" />
        {['all', 'subscription', 'purchase', 'booking', 'tip'].map(type => (
          <button
            key={type}
            onClick={() => setTypeFilter(type)}
            className={`px-3 py-1 rounded-full text-sm transition-colors ${
              typeFilter === type
                ? 'bg-crwn-gold text-crwn-bg font-semibold'
                : 'bg-crwn-surface text-crwn-text-secondary border border-crwn-elevated hover:border-crwn-gold/50'
            }`}
          >
            {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1) + 's'}
          </button>
        ))}
      </div>

      {/* Earnings Feed */}
      {filteredEarnings.length === 0 ? (
        <div className="neu-raised rounded-xl p-8 text-center">
          <DollarSign className="w-12 h-12 text-crwn-gold/30 mx-auto mb-3" />
          <p className="text-crwn-text font-medium">No earnings yet</p>
          <p className="text-sm text-crwn-text-secondary mt-1">
            When fans subscribe, buy products, or book sessions, you'll see every transaction here in real time.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredEarnings.map(earning => (
            <div
              key={earning.id}
              ref={earning.id === highlightEarningId ? highlightRef : null}
              className={`neu-raised rounded-xl overflow-hidden transition-all ${
                earning.id === highlightEarningId ? 'ring-2 ring-crwn-gold' : ''
              }`}
            >
              {/* Collapsed row */}
              <button
                onClick={() => setExpandedId(expandedId === earning.id ? null : earning.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-crwn-elevated/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getTypeBgColor(earning.type)}`}>
                    {getTypeIcon(earning.type)}
                  </div>
                  <div className="text-left">
                    <p className="text-sm text-crwn-text font-medium">{earning.description}</p>
                    <p className="text-xs text-crwn-text-secondary">{timeAgo(earning.created_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-crwn-gold font-semibold">
                    +${(earning.net_amount / 100).toFixed(2)}
                  </span>
                  {expandedId === earning.id ? (
                    <ChevronUp className="w-4 h-4 text-crwn-text-secondary" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-crwn-text-secondary" />
                  )}
                </div>
              </button>

              {/* Expanded detail */}
              {expandedId === earning.id && (
                <div className="px-4 pb-4 border-t border-crwn-elevated">
                  <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                    <div>
                      <span className="text-crwn-text-secondary">Gross</span>
                      <span className="text-crwn-text ml-2">${(earning.gross_amount / 100).toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-crwn-text-secondary">Platform Fee</span>
                      <span className="text-crwn-text-secondary ml-2">-${(earning.platform_fee / 100).toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-crwn-text-secondary">Net</span>
                      <span className="text-crwn-gold ml-2 font-semibold">${(earning.net_amount / 100).toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-crwn-text-secondary">Type</span>
                      <span className="text-crwn-text ml-2 capitalize">{earning.type}</span>
                    </div>
                    {earning.metadata && typeof earning.metadata === 'object' && 'tierName' in earning.metadata && (
                      <div>
                        <span className="text-crwn-text-secondary">Tier</span>
                        <span className="text-crwn-text ml-2">{String((earning.metadata as Record<string, unknown>).tierName)}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-crwn-text-secondary">Date</span>
                      <span className="text-crwn-text ml-2">{new Date(earning.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Stripe Dashboard Link */}
      {stripeLoginUrl && (
        <a
          href={stripeLoginUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 neu-button w-full py-3"
        >
          <TrendingUp className="w-4 h-4" />
          Open Stripe Dashboard
        </a>
      )}
    </div>
  );
}
