'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { getTierLimits, formatTierName, TierLimits } from '@/lib/platformTier';
import { PlatformTierModal } from './PlatformTierModal';
import { Loader2, Crown, CreditCard, Calendar } from 'lucide-react';

interface ArtistProfile {
  id: string;
  platform_tier: string | null;
  platform_subscription_status: string | null;
  platform_stripe_subscription_id: string | null;
  is_founding_artist: boolean | null;
  founding_artist_number: number | null;
  founding_artist_expires_at: string | null;
}

export function PlatformBilling() {
  const { user } = useAuth();
  const { showToast } = useToast();
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
        .select('id, platform_tier, platform_subscription_status, platform_stripe_subscription_id, is_founding_artist, founding_artist_number, founding_artist_expires_at')
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
      {artist?.is_founding_artist && artist.founding_artist_number && (
        <div className="neu-raised rounded-xl p-4 border border-crwn-gold/30 bg-crwn-gold/5 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">👑</span>
            <span className="text-crwn-gold font-semibold">Founding Artist #{artist.founding_artist_number}</span>
          </div>
          <p className="text-crwn-text-secondary text-sm">
            You have free Pro features and a reduced 5% platform fee until {new Date(artist.founding_artist_expires_at || Date.now()).toLocaleDateString()}.
          </p>
        </div>
      )}

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
                  tier === 'starter' ? 'bg-crwn-surface text-crwn-text-dim' :
                  'bg-crwn-gold/20 text-crwn-gold'
                }`}>
                  {tier === 'starter' ? 'Free' : formatTierName(tier)}
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
              Fan Tiers: {limits.maxFanTiers === -1 ? 'Unlimited' : limits.maxFanTiers}
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
