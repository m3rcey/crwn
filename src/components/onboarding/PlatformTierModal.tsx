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
    name: 'Free',
    monthlyPrice: 0,
    annualMonthlyPrice: 0,
    annualTotal: 0,
    savings: 0,
    description: 'Get started for free',
    features: [
      '20 track uploads',
      '1 subscription tier',
      '1 email blast / month',
      'Community posts',
      'Basic analytics',
      'Audience CRM & fan database',
      '12% platform fee',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: 9.99,
    annualMonthlyPrice: 9.99,
    annualTotal: 120,
    savings: 0,
    description: 'For growing artists',
    features: [
      'Unlimited uploads',
      'Up to 3 subscription tiers',
      '10 email blasts / month',
      'Livestreaming + VOD',
      'Direct messaging with fans',
      'Clipper rev-share',
      'Advanced analytics',
      '8% platform fee',
    ],
    popular: true,
  },
  // SPEC ONLY — Label ($99) slots in here as a third card when it ships.
  // Not billable in v1 (no Stripe price, excluded from platform-checkout).
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
  // Monthly-only at launch (Pro is a flat $9.99/mo; no annual plan yet).
  const [billingCycle] = useState<'annual' | 'monthly'>('monthly');
  const [partnerCode, setPartnerCode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('crwn_recruiter')?.toUpperCase() || '';
    }
    return '';
  });

  if (!isOpen) return null;

  const handleSelectTier = async (tier: PlatformTier) => {
    if (!user) return;

    if (tier.monthlyPrice === 0) {
      setIsLoading(tier.id);
      try {
        const response = await fetch('/api/account/set-starter-tier', {
          method: 'POST',
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to set tier');
        router.push('/profile/artist?tab=billing');
      } catch (error) {
        console.error('Error setting platform tier:', error);
        showToast('Failed to set tier. Please try again.', 'error');
      } finally {
        setIsLoading(null);
      }
    } else {
      setIsLoading(tier.id);
      try {
        const response = await fetch('/api/stripe/platform-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tierId: tier.id, billingCycle, ...(partnerCode.trim() && { partnerCode: partnerCode.trim() }) }),
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

          {/* Partner Code */}
          <div className="mt-3 flex flex-col items-center gap-1.5">
            <input
              type="text"
              placeholder="Have a partner code?"
              value={partnerCode}
              onChange={(e) => setPartnerCode(e.target.value.toUpperCase())}
              className="px-4 py-2 rounded-full bg-crwn-bg border border-crwn-text/30 text-crwn-text text-sm w-52 text-center placeholder:text-crwn-text/40 focus:outline-none focus:border-crwn-gold"
            />
            {partnerCode.trim() && (
              <span className="text-xs text-green-400">1 month free + reduced fees</span>
            )}
          </div>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
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

        {/* Competitor value comparison */}
        <div className="mt-8 rounded-2xl bg-crwn-bg/60 border border-crwn-text/10 p-5 md:p-6">
          <p className="text-sm font-semibold text-crwn-text text-center mb-4">
            What you&apos;d pay separately for the same tools
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {[
              { tool: 'Fan subscriptions', price: '$80+/mo', note: 'Patreon Pro takes 8-12%' },
              { tool: 'Email marketing', price: '$59+/mo', note: 'ConvertKit, Mailchimp' },
              { tool: 'SMS messaging', price: '$99+/mo', note: 'Community, Twilio' },
              { tool: 'AI insights + CRM', price: '$49+/mo', note: 'Chartmetric, Linkfire' },
            ].map((item) => (
              <div key={item.tool} className="text-center">
                <p className="text-lg font-bold text-crwn-text-secondary line-through decoration-crwn-text/30">
                  {item.price}
                </p>
                <p className="text-xs font-medium text-crwn-text mt-0.5">{item.tool}</p>
                <p className="text-[10px] text-crwn-text-secondary mt-0.5">{item.note}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-crwn-text/10 text-center">
            <p className="text-xs text-crwn-text-secondary">
              Elsewhere: <span className="text-crwn-text font-semibold line-through decoration-crwn-text/30">$287+/mo</span> across 4+ tools
            </p>
            <p className="text-sm text-crwn-gold font-semibold mt-1">
              CRWN Pro: everything in one place for $9.99/mo
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
