'use client';

import { useState, useEffect } from 'react';
import { ShoppingCart, TrendingUp, Loader2, CheckCircle, XCircle, Package, CreditCard, Calendar } from 'lucide-react';

interface AbandonedCheckout {
  id: string;
  fan_id: string;
  fan_name: string;
  fan_avatar: string | null;
  checkout_type: 'subscription' | 'product' | 'booking';
  item_name: string;
  recovered: boolean;
  created_at: string;
}

interface Stats {
  total: number;
  recovered: number;
  recoveryRate: number;
  recent: {
    total: number;
    recovered: number;
    recoveryRate: number;
  };
  byType: Record<string, { total: number; recovered: number }>;
}

interface AbandonedCartDashboardProps {
  artistId: string;
}

const typeIcons: Record<string, React.ReactNode> = {
  subscription: <CreditCard className="w-4 h-4" />,
  product: <Package className="w-4 h-4" />,
  booking: <Calendar className="w-4 h-4" />,
};

const typeLabels: Record<string, string> = {
  subscription: 'Subscription',
  product: 'Product',
  booking: 'Booking',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function AbandonedCartDashboard({ artistId }: AbandonedCartDashboardProps) {
  const [checkouts, setCheckouts] = useState<AbandonedCheckout[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'recovered'>('all');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/abandoned-checkouts');
        const json = await res.json();
        setCheckouts(json.checkouts || []);
        setStats(json.stats || null);
      } catch {
        // silent
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [artistId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-crwn-gold" />
      </div>
    );
  }

  const filtered = filter === 'all'
    ? checkouts
    : filter === 'recovered'
      ? checkouts.filter(c => c.recovered)
      : checkouts.filter(c => !c.recovered);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-crwn-text">Abandoned Carts</h2>
        <p className="text-sm text-crwn-text-secondary mt-0.5">Fans who started checkout but didn&apos;t finish</p>
      </div>

      {/* Stats cards */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-4">
            <div className="text-xs text-crwn-text-secondary mb-1">Total Abandoned</div>
            <div className="text-2xl font-bold text-crwn-text">{stats.total}</div>
          </div>
          <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-4">
            <div className="text-xs text-crwn-text-secondary mb-1">Recovered</div>
            <div className="text-2xl font-bold text-green-400">{stats.recovered}</div>
          </div>
          <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-4">
            <div className="text-xs text-crwn-text-secondary mb-1">Recovery Rate</div>
            <div className="text-2xl font-bold text-crwn-gold">{stats.recoveryRate}%</div>
          </div>
          <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-4">
            <div className="text-xs text-crwn-text-secondary mb-1">Last 30 Days</div>
            <div className="text-2xl font-bold text-crwn-text">
              {stats.recent.total > 0 ? (
                <span>{stats.recent.recoveryRate}%
                  <span className="text-xs font-normal text-crwn-text-secondary ml-1">
                    ({stats.recent.recovered}/{stats.recent.total})
                  </span>
                </span>
              ) : (
                <span className="text-crwn-text-secondary text-sm font-normal">No data</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Breakdown by type */}
      {stats && Object.keys(stats.byType).length > 1 && (
        <div className="flex gap-3">
          {Object.entries(stats.byType).map(([type, data]) => (
            <div key={type} className="flex items-center gap-2 px-3 py-2 bg-crwn-card rounded-lg border border-crwn-elevated text-xs">
              {typeIcons[type]}
              <span className="text-crwn-text-secondary">{typeLabels[type] || type}:</span>
              <span className="text-crwn-text font-medium">{data.total} abandoned</span>
              <span className="text-green-400">{data.recovered} recovered</span>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      {checkouts.length > 0 && (
        <div className="flex gap-1">
          {[
            { id: 'all' as const, label: `All (${checkouts.length})` },
            { id: 'pending' as const, label: `Pending (${checkouts.filter(c => !c.recovered).length})` },
            { id: 'recovered' as const, label: `Recovered (${checkouts.filter(c => c.recovered).length})` },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === tab.id
                  ? 'bg-crwn-elevated text-crwn-text'
                  : 'text-crwn-text-secondary hover:text-crwn-text'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Checkout list */}
      {checkouts.length === 0 ? (
        <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-12 text-center">
          <ShoppingCart className="w-10 h-10 text-crwn-text-secondary mx-auto mb-3" />
          <p className="text-crwn-text font-medium mb-1">No abandoned carts yet</p>
          <p className="text-sm text-crwn-text-secondary">
            When fans start checkout but don&apos;t finish, they&apos;ll show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(checkout => (
            <div
              key={checkout.id}
              className="flex items-center gap-3 px-4 py-3 bg-crwn-card rounded-xl border border-crwn-elevated"
            >
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-crwn-elevated flex items-center justify-center shrink-0 overflow-hidden">
                {checkout.fan_avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={checkout.fan_avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs font-medium text-crwn-text-secondary">
                    {checkout.fan_name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-crwn-text truncate">{checkout.fan_name}</span>
                  {checkout.recovered ? (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400">
                      <CheckCircle className="w-3 h-3" />
                      Recovered
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400">
                      <XCircle className="w-3 h-3" />
                      Lost
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-crwn-text-secondary mt-0.5">
                  <span className="flex items-center gap-1">
                    {typeIcons[checkout.checkout_type]}
                    {checkout.item_name}
                  </span>
                </div>
              </div>

              {/* Time */}
              <span className="text-xs text-crwn-text-secondary shrink-0">
                {timeAgo(checkout.created_at)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Tip */}
      {checkouts.length > 0 && stats && stats.recoveryRate < 20 && (
        <div className="bg-crwn-gold/5 border border-crwn-gold/20 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <TrendingUp className="w-5 h-5 text-crwn-gold shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-crwn-text">Boost your recovery rate</p>
              <p className="text-xs text-crwn-text-secondary mt-1">
                Create an &quot;Abandoned Cart&quot; sequence under Sequences to automatically email fans who don&apos;t complete checkout. Most platforms see 5-15% recovery rates with a 3-email sequence.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
