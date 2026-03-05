'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { TierConfig } from '@/types';
import { Check, Loader2, X } from 'lucide-react';

interface SubscribeButtonProps {
  tiers: TierConfig[];
  artistSlug: string;
  artistId: string;
}

export function SubscribeButton({ tiers, artistSlug, artistId }: SubscribeButtonProps) {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subscribedTierId, setSubscribedTierId] = useState<string | null>(null);
  const [subscribedTierName, setSubscribedTierName] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    // Check for success param in URL
    const params = new URLSearchParams(window.location.search);
    if (params.get('subscription') === 'success') {
      setShowSuccess(true);
      // Clear the param
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    // Check if user is already subscribed - get the specific tier
    async function checkSubscription() {
      if (!user || !artistId) return;
      
      const { data } = await supabase
        .from('subscriptions')
        .select('id, tier_id')
        .eq('fan_id', user.id)
        .eq('artist_id', artistId)
        .eq('status', 'active')
        .maybeSingle();
      
      if (data) {
        setSubscribedTierId(data.tier_id);
        // Get tier name from tiers array
        const currentTier = tiers.find(t => t.id === data.tier_id);
        setSubscribedTierName(currentTier?.name || 'Current Tier');
      }
    }
    
    checkSubscription();
  }, [user, artistId, supabase, tiers]);

  const handleSubscribe = async (tier: TierConfig) => {
    if (!user) {
      alert('Please sign in to subscribe');
      return;
    }

    if (subscribedTierId === tier.id) {
      setError('You are already subscribed to this tier.');
      return;
    }

    setError(null);
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tierId: tier.id,
          fanId: user.id,
          artistSlug,
        }),
      });
      
      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        setError(data.error);
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setError('Failed to start checkout. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (tiers.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {showSuccess && (
        <div className="flex items-center gap-2 bg-crwn-gold/20 text-crwn-gold px-4 py-2 rounded-lg text-sm">
          <Check className="w-4 h-4" />
          Successfully subscribed!
          <button onClick={() => setShowSuccess(false)} className="ml-2 hover:text-crwn-gold/70">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {error && (
        <p className="text-sm text-crwn-error bg-crwn-error/10 px-3 py-1 rounded">{error}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {tiers.map((tier) => {
          const isThisTierSubscribed = subscribedTierId === tier.id;
          return (
            <button
              key={tier.id}
              onClick={() => handleSubscribe(tier)}
              disabled={isLoading}
              className={`neu-button px-4 py-2 font-semibold disabled:opacity-50 flex items-center gap-2 ${
                isThisTierSubscribed
                  ? 'text-crwn-gold'
                  : 'neu-button-accent text-crwn-bg'
              }`}
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isThisTierSubscribed ? (
                <>Subscribed <Check className="w-4 h-4" /></>
              ) : tier.price > 0 ? (
                `Subscribe $${(tier.price / 100).toFixed(2)}/mo`
              ) : (
                'Free'
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface TierCardsProps {
  tiers: TierConfig[];
  artistSlug: string;
  artistId: string;
}

export function TierCards({ tiers, artistSlug, artistId }: TierCardsProps) {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subscribedTierId, setSubscribedTierId] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    // Check for success param in URL
    const params = new URLSearchParams(window.location.search);
    if (params.get('subscription') === 'success') {
      setShowSuccess(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    // Check if user is already subscribed - get the specific tier
    async function checkSubscription() {
      if (!user || !artistId) return;
      
      const { data } = await supabase
        .from('subscriptions')
        .select('id, tier_id')
        .eq('fan_id', user.id)
        .eq('artist_id', artistId)
        .eq('status', 'active')
        .maybeSingle();
      
      if (data) {
        setSubscribedTierId(data.tier_id);
      }
    }
    
    checkSubscription();
  }, [user, artistId, supabase]);

  const handleSubscribe = async (tier: TierConfig) => {
    if (!user) {
      window.location.href = '/login';
      return;
    }

    setError(null);
    setIsLoading(tier.id);
    
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tierId: tier.id,
          fanId: user.id,
          artistSlug,
        }),
      });
      
      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        setError(data.error);
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setError('Failed to start checkout. Please try again.');
    } finally {
      setIsLoading(null);
    }
  };

  const handleUpgradeOrDowngrade = async (tier: TierConfig) => {
    if (!user) {
      window.location.href = '/login';
      return;
    }

    setError(null);
    setIsLoading(tier.id);
    
    try {
      const response = await fetch('/api/stripe/subscription-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newTierId: tier.id,
          artistId,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Refresh subscription state
        window.location.reload();
      } else if (data.error) {
        setError(data.error);
      }
    } catch (err) {
      console.error('Update error:', err);
      setError('Failed to update subscription. Please try again.');
    } finally {
      setIsLoading(null);
    }
  };

  const handleTierAction = (tier: TierConfig) => {
    if (subscribedTierId === tier.id) {
      return; // Already subscribed - no action
    }
    
    if (subscribedTierId) {
      // Has existing subscription - upgrade or downgrade
      handleUpgradeOrDowngrade(tier);
    } else {
      // No subscription - new subscribe
      handleSubscribe(tier);
    }
  };

  const getButtonText = (tier: TierConfig): string => {
    if (isLoading === tier.id) {
      return 'Loading...';
    }
    if (subscribedTierId === tier.id) {
      return 'Subscribed ✓';
    }
    if (subscribedTierId) {
      const currentTier = tiers.find(t => t.id === subscribedTierId);
      const currentPrice = currentTier?.price || 0;
      if (tier.price > currentPrice) {
        return 'Upgrade';
      } else {
        return 'Downgrade';
      }
    }
    return tier.price > 0 ? 'Subscribe' : 'Join Free';
  };

  const getButtonClass = (tier: TierConfig): string => {
    const isCurrentTier = subscribedTierId === tier.id;
    const isSubbed = subscribedTierId !== null;
    
    if (isCurrentTier) {
      return 'neu-button text-crwn-gold cursor-default';
    }
    
    if (isSubbed) {
      const currentTier = tiers.find(t => t.id === subscribedTierId);
      const currentPrice = currentTier?.price || 0;
      if (tier.price > currentPrice) {
        // Upgrade - gold button
        return 'neu-button-accent text-crwn-bg';
      } else {
        // Downgrade - subtle gray
        return 'neu-button text-crwn-text-secondary border border-crwn-surface';
      }
    }
    
    // Not subscribed - gold subscribe button
    return 'neu-button-accent text-crwn-bg';
  };

  if (tiers.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {showSuccess && (
        <div className="flex items-center gap-2 bg-crwn-gold/20 text-crwn-gold px-4 py-3 rounded-lg">
          <Check className="w-5 h-5" />
          Successfully subscribed!
          <button onClick={() => setShowSuccess(false)} className="ml-auto hover:text-crwn-gold/70">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {error && (
        <p className="text-sm text-crwn-error bg-crwn-error/10 px-4 py-2 rounded-lg">{error}</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiers.map((tier) => {
          const isThisTierSubscribed = subscribedTierId === tier.id;
          const isAnySubscribed = subscribedTierId !== null;
          
          return (
            <div
              key={tier.id}
              className={`neu-raised neu-card-hover p-6 flex flex-col ${
                isThisTierSubscribed ? 'ring-2 ring-crwn-gold' : ''
              }`}
            >
              {isThisTierSubscribed && (
                <div className="flex items-center gap-1 text-crwn-gold text-sm font-medium mb-2">
                  <Check className="w-4 h-4" /> Subscribed
                </div>
              )}
              <h3 className="text-lg font-semibold text-crwn-gold">{tier.name}</h3>
              <p className="text-3xl font-bold text-crwn-text mt-2">
                ${(tier.price / 100).toFixed(2)}
                <span className="text-sm font-normal text-crwn-text-secondary">/mo</span>
              </p>
              {tier.description && (
                <p className="text-crwn-text-secondary text-sm mt-2">{tier.description}</p>
              )}
              
              {tier.benefits && tier.benefits.length > 0 && (
                <ul className="mt-4 space-y-2 flex-1">
                  {tier.benefits.map((benefit, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-crwn-text">
                      <Check className="w-4 h-4 text-crwn-gold flex-shrink-0 mt-0.5" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              )}
              
              <button
                onClick={() => handleTierAction(tier)}
                disabled={isLoading === tier.id || subscribedTierId === tier.id}
                className={`mt-4 w-full py-2 rounded-lg font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${getButtonClass(tier)}`}
              >
                {isLoading === tier.id && <Loader2 className="w-4 h-4 animate-spin" />}
                {getButtonText(tier)}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
