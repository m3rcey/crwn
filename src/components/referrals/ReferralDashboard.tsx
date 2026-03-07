'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { DollarSign, Users, TrendingUp, Loader2 } from 'lucide-react';

interface ReferralData {
  totalReferrals: number;
  activeReferrals: number;
  totalEarnings: number;
  thisMonthEarnings: number;
  referrals: {
    id: string;
    referredName: string;
    commission_rate: number;
    status: string;
    created_at: string;
  }[];
  recentEarnings: {
    id: string;
    commission_amount: number;
    gross_amount: number;
    created_at: string;
  }[];
}

export function ReferralDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<ReferralData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    fetch(`/api/referrals?fanId=${user.id}`)
      .then(res => res.json())
      .then(result => {
        if (!result.error) setData(result);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [user]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }

  if (!data || data.totalReferrals === 0) {
    return (
      <div className="neu-raised rounded-xl p-8 text-center">
        <Users className="w-12 h-12 text-crwn-gold/30 mx-auto mb-3" />
        <p className="text-crwn-text font-medium">No referrals yet</p>
        <p className="text-sm text-crwn-text-secondary mt-1">
          Share your referral link on any artist's page to start earning commissions when friends subscribe.
        </p>
      </div>
    );
  }

  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="neu-raised rounded-xl p-4">
          <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">Total Referrals</p>
          <p className="text-2xl font-bold text-crwn-text mt-1">{data.totalReferrals}</p>
        </div>
        <div className="neu-raised rounded-xl p-4">
          <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">Active</p>
          <p className="text-2xl font-bold text-green-400 mt-1">{data.activeReferrals}</p>
        </div>
        <div className="neu-raised rounded-xl p-4">
          <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">This Month</p>
          <p className="text-2xl font-bold text-crwn-gold mt-1">{formatCurrency(data.thisMonthEarnings)}</p>
        </div>
        <div className="neu-raised rounded-xl p-4">
          <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">All Time</p>
          <p className="text-2xl font-bold text-crwn-gold mt-1">{formatCurrency(data.totalEarnings)}</p>
        </div>
      </div>

      {/* Referred Fans */}
      <div className="neu-raised rounded-xl p-4">
        <p className="text-sm text-crwn-text-secondary mb-3">Your Referrals</p>
        <div className="space-y-2">
          {data.referrals.map(ref => (
            <div key={ref.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${ref.status === 'active' ? 'bg-green-400' : 'bg-crwn-text-secondary'}`} />
                <span className="text-crwn-text">{ref.referredName}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-crwn-text-secondary">{ref.commission_rate}%</span>
                <span className="text-crwn-text-secondary text-xs">
                  {new Date(ref.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Earnings */}
      {data.recentEarnings.length > 0 && (
        <div className="neu-raised rounded-xl p-4">
          <p className="text-sm text-crwn-text-secondary mb-3">Recent Commissions</p>
          <div className="space-y-2">
            {data.recentEarnings.map(earning => (
              <div key={earning.id} className="flex items-center justify-between text-sm">
                <span className="text-crwn-text-secondary">
                  {new Date(earning.created_at).toLocaleDateString()}
                </span>
                <span className="text-green-400 font-semibold">
                  +{formatCurrency(earning.commission_amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
