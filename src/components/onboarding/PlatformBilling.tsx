'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { getTierLimits, formatTierName, TierLimits } from '@/lib/platformTier';
import { PlatformTierModal } from './PlatformTierModal';
import { Loader2, Crown, CreditCard, Calendar } from 'lucide-react';

interface ArtistProfile {
  id: string;
  platform_tier: string | null;
  platform_subscription_status: string | null;
  platform_stripe_subscription_id: string | null;
}

export function PlatformBilling() {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [artist, setArtist] = useState<ArtistProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showTierModal, setShowTierModal] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);

  useEffect(() => {
    async function loadArtist() {
      if (!user) return;

      const { data } = await supabase
        .from('artist_profiles')
        .select('id, platform_tier, platform_subscription_status, platform_stripe_subscription_id')
        .eq('user_id', user.id)
        .single();

      setArtist(data);
      setIsLoading(false);
    }

    loadArtist();
  }, [user]);

  const handleManageSubscription = async () => {
    if (!artist?.platform_stripe_subscription_id) return;

    setIsPortalLoading(true);
    try {
      const response = await fetch('/api/stripe/platform-portal', {
        method: 'POST',
      });
      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Failed to open portal');
      }
    } catch (error) {
      console.error('Portal error:', error);
      alert('Failed to open billing portal');
    } finally {
      setIsPortalLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }

  const tier = artist?.platform_tier || 'starter';
  const limits = getTierLimits(tier);
  const isActive = artist?.platform_subscription_status === 'active';

  return (
    <>
      <div className="neu-raised rounded-2xl p-6">
        <h2 className="text-xl font-bold text-crwn-text mb-6">Plan & Billing</h2>

        {/* Current Plan */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              tier === 'label' ? 'bg-crwn-gold/20' : tier === 'pro' ? 'bg-crwn-gold/20' : 'bg-crwn-surface'
            }`}>
              {tier === 'label' ? (
                <Crown className="w-6 h-6 text-crwn-gold" />
              ) : tier === 'pro' ? (
                <Crown className="w-6 h-6 text-crwn-gold" />
              ) : (
                <span className="text-2xl">🎵</span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-crwn-text">{formatTierName(tier)}</h3>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  tier === 'starter' ? 'bg-crwn-surface text-crwn-text-dim' :
                  'bg-crwn-gold/20 text-crwn-gold'
                }`}>
                  {tier === 'starter' ? 'Free' : tier === 'pro' ? 'Pro' : 'Label'}
                </span>
              </div>
              <p className="text-sm text-crwn-text-dim">
                {tier === 'starter' ? 'Limited features' : isActive ? 'Active subscription' : 'Subscription inactive'}
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowTierModal(true)}
            className="neu-button-accent px-4 py-2 rounded-lg text-crwn-bg font-semibold"
          >
            Change Plan
          </button>
        </div>

        {/* Features */}
        <div className="neu-inset p-4 rounded-xl mb-6">
          <h4 className="text-sm font-medium text-crwn-text mb-3">Your Plan Features</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-crwn-text">
              Tracks: {limits.maxTracks === -1 ? 'Unlimited' : limits.maxTracks}
            </div>
            <div className="text-crwn-text">
              Fan Tiers: {limits.maxFanTiers}
            </div>
            <div className="text-crwn-text">
              Bundles: {limits.allowsBundles ? '✓ Yes' : '✗ No'}
            </div>
            <div className="text-crwn-text">
              Scheduling: {limits.allowsScheduling ? '✓ Yes' : '✗ No'}
            </div>
            <div className="text-crwn-text col-span-2">
              Platform Fee: {limits.platformFeePercent}%
            </div>
          </div>
        </div>

        {/* Manage Subscription */}
        {tier !== 'starter' && (
          <button
            onClick={handleManageSubscription}
            disabled={isPortalLoading}
            className="neu-button w-full py-3 rounded-xl flex items-center justify-center gap-2"
          >
            {isPortalLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <CreditCard className="w-5 h-5" />
                Manage Subscription
              </>
            )}
          </button>
        )}
      </div>

      <PlatformTierModal
        isOpen={showTierModal}
        onComplete={() => setShowTierModal(false)}
      />
    </>
  );
}
