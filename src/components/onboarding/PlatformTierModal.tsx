'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Loader2, Check, Crown } from 'lucide-react';

interface PlatformTier {
  id: string;
  name: string;
  price: number;
  description: string;
  features: string[];
  popular?: boolean;
}

const PLATFORM_TIERS: PlatformTier[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 0,
    description: 'Perfect for getting started',
    features: [
      'Up to 100 fans',
      'Basic analytics',
      'Standard support',
      'CRWN branding',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 4900,
    description: 'Most popular choice',
    features: [
      'Unlimited fans',
      'Advanced analytics',
      'Priority support',
      'Custom branding',
      'Booking sessions',
      ' merch store',
    ],
    popular: true,
  },
  {
    id: 'label',
    name: 'Label',
    price: 14900,
    description: 'For serious artists',
    features: [
      'Everything in Pro',
      'White-label option',
      'API access',
      'Dedicated support',
      'Custom domain',
      'Team collaboration',
    ],
  },
];

interface PlatformTierModalProps {
  isOpen: boolean;
  onComplete?: () => void;
}

export function PlatformTierModal({ isOpen, onComplete }: PlatformTierModalProps) {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [isLoading, setIsLoading] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelectTier = async (tier: PlatformTier) => {
    if (!user) return;
    
    // Starter is free - just set it
    if (tier.price === 0) {
      setIsLoading(tier.id);
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ platform_tier: tier.id })
          .eq('id', user.id);

        if (error) throw error;
        onComplete?.();
      } catch (error) {
        console.error('Error setting platform tier:', error);
      } finally {
        setIsLoading(null);
      }
    } else {
      // Pro and Label - call checkout API
      setIsLoading(tier.id);
      try {
        const response = await fetch('/api/stripe/platform-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tierId: tier.id }),
        });

        const data = await response.json();
        
        if (data.url) {
          window.location.href = data.url;
        } else {
          alert(data.error || 'Checkout failed. Please try again.');
        }
      } catch (error) {
        console.error('Checkout error:', error);
        alert('Failed to start checkout. Please try again.');
      } finally {
        setIsLoading(null);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4">
      <div className="neu-raised rounded-2xl p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Crown className="w-8 h-8 text-crwn-gold" />
            <h2 className="text-2xl font-bold text-crwn-text">Choose Your Plan</h2>
          </div>
          <p className="text-crwn-text-secondary">
            Select a platform tier to unlock more features
          </p>
        </div>

        {/* Tier Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLATFORM_TIERS.map((tier) => (
            <div
              key={tier.id}
              className={`neu-raised rounded-2xl p-6 flex flex-col ${
                tier.popular ? 'ring-2 ring-crwn-gold' : ''
              }`}
            >
              {/* Popular Badge */}
              {tier.popular && (
                <div className="neu-button-accent text-crwn-bg text-xs font-bold py-1 px-3 rounded-full self-start mb-2">
                  Most Popular
                </div>
              )}

              {/* Tier Name */}
              <h3 className="text-xl font-bold text-crwn-text">{tier.name}</h3>
              
              {/* Price */}
              <div className="mt-2">
                <span className="text-3xl font-bold text-crwn-gold">
                  ${tier.price / 100}
                </span>
                {tier.price > 0 && (
                  <span className="text-crwn-text-secondary">/mo</span>
                )}
              </div>

              {/* Description */}
              <p className="text-crwn-text-dim text-sm mt-1">{tier.description}</p>

              {/* Features */}
              <ul className="mt-4 space-y-2 flex-1">
                {tier.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-crwn-text">
                    <Check className="w-4 h-4 text-crwn-gold flex-shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              {/* Button */}
              <button
                onClick={() => handleSelectTier(tier)}
                disabled={isLoading === tier.id}
                className={`mt-6 w-full py-3 rounded-xl font-semibold transition-colors disabled:opacity-50 ${
                  tier.popular
                    ? 'neu-button-accent text-crwn-bg'
                    : 'neu-button text-crwn-text'
                }`}
              >
                {isLoading === tier.id ? (
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                ) : tier.price === 0 ? (
                  'Start Free'
                ) : tier.id === 'pro' ? (
                  'Go Pro'
                ) : (
                  'Go Label'
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
