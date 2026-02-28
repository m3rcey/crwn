'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

interface PayoutStats {
  totalSubscribers: number;
  monthlyRevenue: number;
  totalRevenue: number;
  platformFees: number;
}

export function PayoutDashboard() {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [stats, setStats] = useState<PayoutStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [stripeLoginUrl, setStripeLoginUrl] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data: artistProfile } = await supabase
        .from('artist_profiles')
        .select('id, stripe_connect_id')
        .eq('user_id', user.id)
        .single();

      if (!artistProfile) {
        setIsLoading(false);
        return;
      }

      // Get subscriber count
      const { count: subscriberCount } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact' })
        .eq('artist_id', artistProfile.id)
        .eq('status', 'active');

      // Get tier prices for revenue calculation
      const { data: tiers } = await supabase
        .from('subscription_tiers')
        .select('price')
        .eq('artist_id', artistProfile.id);

      const monthlyRevenue = tiers?.reduce((sum, tier) => sum + (tier.price || 0), 0) || 0;
      const platformFees = Math.round(monthlyRevenue * 0.08);
      const netRevenue = monthlyRevenue - platformFees;

      setStats({
        totalSubscribers: subscriberCount || 0,
        monthlyRevenue: netRevenue,
        totalRevenue: netRevenue * 3,
        platformFees,
      });

      // Get Stripe login link if connected
      if (artistProfile.stripe_connect_id) {
        const response = await fetch('/api/stripe/login-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId: artistProfile.stripe_connect_id }),
        });
        
        if (response.ok) {
          const { url } = await response.json();
          setStripeLoginUrl(url);
        }
      }

      setIsLoading(false);
    }

    fetchStats();
  }, [user, supabase]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-crwn-gold" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-crwn-surface border border-crwn-elevated rounded-xl p-6">
        <p className="text-crwn-text-secondary">No payout data available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-crwn-surface border border-crwn-elevated rounded-xl p-6">
          <p className="text-sm text-crwn-text-secondary">Active Subscribers</p>
          <p className="text-3xl font-bold text-crwn-text mt-1">
            {stats.totalSubscribers}
          </p>
        </div>
        
        <div className="bg-crwn-surface border border-crwn-elevated rounded-xl p-6">
          <p className="text-sm text-crwn-text-secondary">Monthly Revenue</p>
          <p className="text-3xl font-bold text-crwn-gold mt-1">
            ${(stats.monthlyRevenue / 100).toFixed(2)}
          </p>
        </div>
        
        <div className="bg-crwn-surface border border-crwn-elevated rounded-xl p-6">
          <p className="text-sm text-crwn-text-secondary">Platform Fees (8%)</p>
          <p className="text-3xl font-bold text-crwn-text-secondary mt-1">
            ${(stats.platformFees / 100).toFixed(2)}
          </p>
        </div>
        
        <div className="bg-crwn-surface border border-crwn-elevated rounded-xl p-6">
          <p className="text-sm text-crwn-text-secondary">Your Earnings</p>
          <p className="text-3xl font-bold text-crwn-gold mt-1">
            ${(stats.monthlyRevenue / 100).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Stripe Dashboard Link */}
      {stripeLoginUrl && (
        <div className="bg-crwn-surface border border-crwn-elevated rounded-xl p-6">
          <h3 className="text-lg font-semibold text-crwn-text mb-2">
            Stripe Dashboard
          </h3>
          <p className="text-crwn-text-secondary mb-4">
            View detailed payout information, transaction history, and manage your Stripe account.
          </p>
          <a
            href={stripeLoginUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-crwn-gold text-crwn-bg px-6 py-3 rounded-lg font-semibold hover:bg-crwn-gold-hover transition-colors"
          >
            Open Stripe Dashboard
          </a>
        </div>
      )}

      {/* Fee Breakdown */}
      <div className="bg-crwn-surface border border-crwn-elevated rounded-xl p-6">
        <h3 className="text-lg font-semibold text-crwn-text mb-4">Fee Structure</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-crwn-text-secondary">Gross Revenue</span>
            <span className="text-crwn-text">
              ${((stats.monthlyRevenue + stats.platformFees) / 100).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-crwn-text-secondary">Platform Fee (8%)</span>
            <span className="text-crwn-text-secondary">
              -${(stats.platformFees / 100).toFixed(2)}
            </span>
          </div>
          <div className="border-t border-crwn-elevated pt-2 mt-2">
            <div className="flex justify-between">
              <span className="text-crwn-text font-medium">Net Payout</span>
              <span className="text-crwn-gold font-medium">
                ${(stats.monthlyRevenue / 100).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
        <p className="text-xs text-crwn-text-secondary mt-4">
          Label tier artists receive a reduced platform fee of 6%.
        </p>
      </div>
    </div>
  );
}
