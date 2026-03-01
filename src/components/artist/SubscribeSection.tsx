'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { TierConfig } from '@/types';
import { Check, Loader2 } from 'lucide-react';

interface SubscribeButtonProps {
  tiers: TierConfig[];
  artistSlug: string;
}

export function SubscribeButton({ tiers, artistSlug }: SubscribeButtonProps) {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubscribe = async (tier: TierConfig) => {
    if (!user) {
      alert('Please sign in to subscribe');
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
      {error && (
        <p className="text-sm text-crwn-error bg-crwn-error/10 px-3 py-1 rounded">{error}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {tiers.map((tier) => (
          <button
            key={tier.id}
            onClick={() => handleSubscribe(tier)}
            disabled={isLoading}
            className="px-4 py-2 bg-crwn-gold text-crwn-bg rounded-full font-semibold hover:bg-crwn-gold-hover transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {tier.price > 0 
              ? `Subscribe $${(tier.price / 100).toFixed(2)}/mo` 
              : 'Free'}
          </button>
        ))}
      </div>
    </div>
  );
}

interface TierCardsProps {
  tiers: TierConfig[];
  artistSlug: string;
}

export function TierCards({ tiers, artistSlug }: TierCardsProps) {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubscribe = async (tier: TierConfig) => {
    if (!user) {
      alert('Please sign in to subscribe');
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

  if (tiers.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-crwn-error bg-crwn-error/10 px-4 py-2 rounded-lg">{error}</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiers.map((tier) => (
          <div
            key={tier.id}
            className="bg-crwn-surface border border-crwn-elevated rounded-xl p-6 flex flex-col"
          >
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
              onClick={() => handleSubscribe(tier)}
              disabled={isLoading === tier.id}
              className="mt-4 w-full py-2 bg-crwn-gold text-crwn-bg rounded-lg font-semibold hover:bg-crwn-gold-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading === tier.id ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </>
              ) : tier.price > 0 ? 'Subscribe' : 'Join Free'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
