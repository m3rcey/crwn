'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { getTierLimits, formatTierName, TierLimits } from '@/lib/platformTier';
import { PlatformTierModal } from './PlatformTierModal';
import { Loader2, Crown, CreditCard } from 'lucide-react';
import CancelModal from '@/components/shared/CancelModal';
import { formatTierName as fmtTier } from '@/lib/platformTier';

interface ArtistProfile {
  id: string;
  platform_tier: string | null;
  platform_subscription_status: string | null;
}

export function PlatformBilling() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const supabase = createBrowserSupabaseClient();
  const [artist, setArtist] = useState<ArtistProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showTierModal, setShowTierModal] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  useEffect(() => {
    async function loadArtist() {
      if (!user) return;

      // Must NOT name platform_stripe_subscription_id: SELECT on it is revoked
      // from `authenticated`, and one revoked name 42501s the whole query, so this
      // returned null and the billing screen rendered empty for every artist.
      // "Do they have a subscription" is answered by platform_subscription_status,
      // which is readable; the id itself is only needed server-side, and
      // /api/stripe/platform-portal looks it up there.
      const { data } = await supabase
        .from('artist_profiles')
        .select('id, platform_tier, platform_subscription_status')
        .eq('user_id', user.id)
        .single();

      setArtist(data);
      setIsLoading(false);

      // The row can CLAIM a paid plan with nothing billing behind it (a
      // subscription deleted in Stripe never downgrades the row, because every
      // platform webhook matches on the subscription id and returns early on a
      // miss). Ask the server, which asks Stripe and corrects the row, then
      // re-render with the truth. Never blocks the first paint.
      try {
        const res = await fetch('/api/stripe/platform-status');
        if (res.ok) {
          const state = await res.json();
          if (state?.reconciled) {
            setArtist((prev) =>
              prev ? { ...prev, platform_tier: state.tier, platform_subscription_status: state.status } : prev,
            );
          }
        }
      } catch {
        // Billing still renders from the stored row if this fails.
      }
    }

    loadArtist();
  }, [user]);

  const handleManageSubscription = async () => {
    // The subscription id lives server-side now (revoked column). Status is the
    // readable proxy for "there is something to manage".
    if (!artist?.platform_subscription_status) return;

    setIsPortalLoading(true);
    try {
      const response = await fetch('/api/stripe/platform-portal', {
        method: 'POST',
      });
      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        showToast(data.error || 'Failed to open portal', 'error');
      }
    } catch (error) {
      console.error('Portal error:', error);
      showToast('Failed to open billing portal', 'error');
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
              tier === 'starter' ? 'bg-crwn-surface' : 'bg-crwn-gold/20'
            }`}>
              {tier === 'starter' ? (
                <span className="text-2xl">🎵</span>
              ) : (
                <Crown className="w-6 h-6 text-crwn-gold" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-crwn-text">{formatTierName(tier)}</h3>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  tier === 'starter' ? 'bg-crwn-surface text-crwn-text-secondary' :
                  'bg-crwn-gold/20 text-crwn-gold'
                }`}>
                  {tier === 'starter' ? 'Free' : formatTierName(tier)}
                </span>
              </div>
              <p className="text-sm text-crwn-text-secondary">
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
              Fan Tiers: {limits.maxFanTiers === -1 ? 'Unlimited' : limits.maxFanTiers}
            </div>
            <div className="text-crwn-text">
              Bundles: {limits.allowsBundles ? '✓ Yes' : '✗ No'}
            </div>
            <div className="text-crwn-text">
              Scheduling: {limits.allowsScheduling ? '✓ Yes' : '✗ No'}
            </div>
            <div className="text-crwn-text">
              Manager: {tier !== 'starter' ? '✓ Yes' : '✗ No'}
            </div>
            <div className="text-crwn-text">
              Email Campaigns: ✓ Yes
            </div>
            <div className="text-crwn-text">
              Platform Fee: {limits.platformFeePercent}%
            </div>
          </div>
        </div>

        {/* Manage Subscription */}
        {tier !== 'starter' && (
          <div className="space-y-2">
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
            {isActive && (
              <button
                onClick={() => setShowCancelModal(true)}
                className="w-full py-2 text-sm text-[#666] hover:text-red-400 transition-colors"
              >
                Cancel Plan
              </button>
            )}
          </div>
        )}
      </div>

      <PlatformTierModal
        isOpen={showTierModal}
        currentTier={tier}
        onComplete={() => setShowTierModal(false)}
      />

      {showCancelModal && artist && (
        <CancelModal
          context="platform"
          subscriptionId={artist.id}
          itemName={`CRWN ${fmtTier(tier)}`}
          onClose={() => setShowCancelModal(false)}
          onCanceled={() => {
            setShowCancelModal(false);
            showToast('Your plan will be canceled at the end of the billing period', 'success');
            // Reload to reflect status
            window.location.reload();
          }}
        />
      )}
    </>
  );
}
