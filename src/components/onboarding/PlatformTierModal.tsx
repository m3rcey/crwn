'use client';
import { createPortal } from 'react-dom';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Loader2, Check, Crown, X } from 'lucide-react';

interface PlatformTier {
  id: string;
  name: string;
  monthlyPrice: number;
  annualMonthlyPrice: number;
  annualTotal: number;
  savings: number;
  description: string;
  features: string[];
  popular?: boolean;
  badge?: string;
}

const PLATFORM_TIERS: PlatformTier[] = [
  {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: 0,
    annualMonthlyPrice: 0,
    annualTotal: 0,
    savings: 0,
    description: 'Get started for free',
    features: [
      '10 track uploads',
      'Up to 100 fans',
      '1 subscription tier',
      'Basic analytics',
      'View sync opportunities (limited)',
      '8% platform fee',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: 49,
    annualMonthlyPrice: 37,
    annualTotal: 441,
    savings: 147,
    description: 'For growing artists',
    features: [
      'Unlimited uploads',
      'Unlimited fans',
      'Up to 5 subscription tiers',
      'Bundles & experiences',
      '1-on-1 scheduling',
      'Full sync opportunities',
      'Advanced analytics',
      '8% platform fee',
    ],
    popular: true,
  },
  {
    id: 'label',
    name: 'Label',
    monthlyPrice: 149,
    annualMonthlyPrice: 112,
    annualTotal: 1341,
    savings: 447,
    description: 'For labels & managers',
    features: [
      'Everything in Pro',
      'Up to 10 subscription tiers',
      'Up to 10 artist profiles',
      'Recommended sync opportunities',
      'API access',
      '6% platform fee',
    ],
  },
  {
    id: 'empire',
    name: 'Empire',
    monthlyPrice: 349,
    annualMonthlyPrice: 262,
    annualTotal: 3141,
    savings: 1047,
    description: 'For serious operations',
    features: [
      'Everything in Label',
      'Unlimited subscription tiers',
      'Unlimited artist profiles',
      'Priority support',
      'Early access to new features',
      'Analytics export',
      '4% platform fee',
    ],
    badge: 'Best Value',
  },
];

interface PlatformTierModalProps {
  isOpen: boolean;
  onComplete?: () => void;
}

export function PlatformTierModal({ isOpen, onComplete }: PlatformTierModalProps) {
  const { user } = useAuth();
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<'annual' | 'monthly'>('annual');

  if (!isOpen) return null;

  const handleSelectTier = async (tier: PlatformTier) => {
    if (!user) return;

    if (tier.monthlyPrice === 0) {
      setIsLoading(tier.id);
      try {
        const { error } = await supabase
          .from('artist_profiles')
          .update({ platform_tier: tier.id })
          .eq('user_id', user.id);
        if (error) throw error;
        await supabase
          .from('profiles')
          .update({ platform_tier: tier.id })
          .eq('id', user.id);
        router.push('/profile/artist?tab=billing');
      } catch (error) {
        console.error('Error setting platform tier:', error);
      } finally {
        setIsLoading(null);
      }
    } else {
      setIsLoading(tier.id);
      try {
        const response = await fetch('/api/stripe/platform-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tierId: tier.id, billingCycle }),
        });
        const data = await response.json();
        if (data.url) {
          window.location.href = data.url;
        } else {
          showToast(data.error || 'Checkout failed. Please try again.', 'error');
        }
      } catch (error) {
        console.error('Checkout error:', error);
        showToast('Failed to start checkout. Please try again.', 'error');
      } finally {
        setIsLoading(null);
      }
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4">
      <div className="neu-raised rounded-2xl p-6 md:p-8 max-w-5xl w-full max-h-[90vh] overflow-y-auto relative">
        <button
          onClick={onComplete}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-crwn-elevated hover:bg-crwn-elevated/80 text-crwn-text-secondary hover:text-white transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Crown className="w-8 h-8 text-crwn-gold" />
            <h2 className="text-2xl font-bold text-crwn-text">Choose Your Plan</h2>
          </div>
          <p className="text-crwn-text-secondary mb-4">
            Select a platform tier to unlock more features
          </p>

          {/* Billing Toggle */}
          <div className="inline-flex items-center gap-1 bg-crwn-bg rounded-xl p-1">
            <button
              onClick={() => setBillingCycle('annual')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                billingCycle === 'annual'
                  ? 'bg-crwn-gold text-crwn-bg'
                  : 'text-crwn-text-secondary hover:text-crwn-text'
              }`}
            >
              Annual
              <span className={`ml-1.5 text-xs ${billingCycle === 'annual' ? 'text-crwn-bg/80' : 'text-green-400'}`}>
                Save 25%
              </span>
            </button>
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                billingCycle === 'monthly'
                  ? 'bg-crwn-gold text-crwn-bg'
                  : 'text-crwn-text-secondary hover:text-crwn-text'
              }`}
            >
              Monthly
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLATFORM_TIERS.map((tier) => {
            const displayPrice = tier.monthlyPrice === 0
              ? 0
              : billingCycle === 'annual'
                ? tier.annualMonthlyPrice
                : tier.monthlyPrice;

            return (
              <div
                key={tier.id}
                className={`neu-raised rounded-2xl p-5 flex flex-col ${
                  tier.popular ? 'ring-2 ring-crwn-gold' : ''
                }`}
              >
                {tier.popular && (
                  <div className="neu-button-accent text-crwn-bg text-xs font-bold py-1 px-3 rounded-full self-start mb-2">
                    Most Popular
                  </div>
                )}
                {tier.badge && !tier.popular && (
                  <div className="bg-green-500/20 text-green-400 text-xs font-bold py-1 px-3 rounded-full self-start mb-2">
                    {tier.badge}
                  </div>
                )}

                <h3 className="text-xl font-bold text-crwn-text">{tier.name}</h3>

                <div className="mt-2">
                  {tier.monthlyPrice === 0 ? (
                    <span className="text-3xl font-bold text-crwn-gold">Free</span>
                  ) : (
                    <>
                      <span className="text-3xl font-bold text-crwn-gold">
                        ${displayPrice}
                      </span>
                      <span className="text-crwn-text-secondary">/mo</span>
                      {billingCycle === 'annual' && (
                        <div className="mt-1">
                          <span className="text-xs text-crwn-text-secondary line-through">${tier.monthlyPrice}/mo</span>
                          <span className="text-xs text-green-400 ml-2">Save ${tier.savings}/yr</span>
                        </div>
                      )}
                      {billingCycle === 'annual' && (
                        <p className="text-xs text-crwn-text-secondary mt-0.5">
                          Billed ${tier.annualTotal}/yr
                        </p>
                      )}
                    </>
                  )}
                </div>

                <p className="text-crwn-text-secondary text-sm mt-1">{tier.description}</p>

                <ul className="mt-4 space-y-2 flex-1">
                  {tier.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-crwn-text">
                      <Check className="w-4 h-4 text-crwn-gold flex-shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSelectTier(tier)}
                  disabled={isLoading === tier.id}
                  className={`mt-5 w-full py-3 rounded-xl font-semibold transition-colors disabled:opacity-50 ${
                    tier.popular
                      ? 'neu-button-accent text-crwn-bg'
                      : 'neu-button text-crwn-text'
                  }`}
                >
                  {isLoading === tier.id ? (
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  ) : tier.monthlyPrice === 0 ? (
                    'Start Free'
                  ) : (
                    `Go ${tier.name}`
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
