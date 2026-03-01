'use client';

import { useState } from 'react';
import { TierConfig } from '@/types';
import { Check } from 'lucide-react';

interface SubscribeButtonProps {
  tiers: TierConfig[];
  artistSlug: string;
}

export function SubscribeButton({ tiers, artistSlug }: SubscribeButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSubscribe = async (tier: TierConfig) => {
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tierId: tier.id,
          artistSlug,
        }),
      });
      
      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        alert(data.error);
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Failed to start checkout');
    } finally {
      setIsLoading(false);
    }
  };

  if (tiers.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tiers.map((tier) => (
        <button
          key={tier.id}
          onClick={() => handleSubscribe(tier)}
          disabled={isLoading}
          className="px-4 py-2 bg-crwn-gold text-crwn-bg rounded-full font-semibold hover:bg-crwn-gold-hover transition-colors disabled:opacity-50"
        >
          {tier.price > 0 
            ? `Subscribe $${(tier.price / 100).toFixed(2)}/mo` 
            : 'Free'}
        </button>
      ))}
    </div>
  );
}

interface TierCardsProps {
  tiers: TierConfig[];
  artistSlug: string;
}

export function TierCards({ tiers, artistSlug }: TierCardsProps) {
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const handleSubscribe = async (tier: TierConfig) => {
    setIsLoading(tier.id);
    
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tierId: tier.id,
          artistSlug,
        }),
      });
      
      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        alert(data.error);
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Failed to start checkout');
    } finally {
      setIsLoading(null);
    }
  };

  if (tiers.length === 0) {
    return null;
  }

  return (
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
            className="mt-4 w-full py-2 bg-crwn-gold text-crwn-bg rounded-lg font-semibold hover:bg-crwn-gold-hover transition-colors disabled:opacity-50"
          >
            {isLoading === tier.id ? 'Loading...' : tier.price > 0 ? 'Subscribe' : 'Join Free'}
          </button>
        </div>
      ))}
    </div>
  );
}
