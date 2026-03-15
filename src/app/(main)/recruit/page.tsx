'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/shared/Toast';
import { DollarSign, Users, TrendingUp, Gift } from 'lucide-react';

export default function RecruitPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleBecomeRecruiter = async () => {
    if (!user) {
      router.push('/login');
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch('/api/recruit/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json();
      if (data.error) {
        showToast(data.error, 'error');
      } else {
        showToast('Welcome to the CRWN Recruiter Program!', 'success');
        router.push('/recruit/dashboard');
      }
    } catch {
      showToast('Something went wrong', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const tiers = [
    { name: 'First Referral', threshold: '1st artist', flat: '$50', recurring: '--', window: '--' },
    { name: 'Starter', threshold: '2-5 artists', flat: '$25', recurring: '--', window: '--' },
    { name: 'Connector', threshold: '6-15 artists', flat: '$50', recurring: '5% of SaaS', window: '12 months' },
    { name: 'Ambassador', threshold: '16+ artists', flat: '$75', recurring: '10% of SaaS', window: '12 months' },
  ];

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 stagger-fade-in">
      <div className="text-center mb-12">
        <h1 className="text-3xl md:text-4xl font-bold text-crwn-text mb-4">
          Get Paid to Bring Artists to CRWN
        </h1>
        <p className="text-lg text-crwn-text-secondary max-w-xl mx-auto">
          Know talented artists? Refer them to CRWN and earn cash for every artist who joins a paid plan.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
        {[
          { icon: Gift, label: 'Share Your Link', desc: 'Get a unique referral URL' },
          { icon: Users, label: 'Artists Sign Up', desc: 'They join through your link' },
          { icon: DollarSign, label: 'Get Paid', desc: 'Earn per qualified artist' },
          { icon: TrendingUp, label: 'Level Up', desc: 'More referrals = higher payouts' },
        ].map((step, i) => (
          <div key={i} className="text-center">
            <div className="w-12 h-12 rounded-full bg-crwn-gold/10 flex items-center justify-center mx-auto mb-2">
              <step.icon className="w-6 h-6 text-crwn-gold" />
            </div>
            <p className="text-sm font-medium text-crwn-text">{step.label}</p>
            <p className="text-xs text-crwn-text-secondary mt-1">{step.desc}</p>
          </div>
        ))}
      </div>

      <div className="mb-12">
        <h2 className="text-xl font-semibold text-crwn-text mb-4 text-center">Payout Structure</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-crwn-elevated">
                <th className="text-left py-3 text-crwn-text-secondary font-medium">Tier</th>
                <th className="text-left py-3 text-crwn-text-secondary font-medium">Threshold</th>
                <th className="text-left py-3 text-crwn-text-secondary font-medium">Flat Fee</th>
                <th className="text-left py-3 text-crwn-text-secondary font-medium">Recurring</th>
                <th className="text-left py-3 text-crwn-text-secondary font-medium">Window</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier, i) => (
                <tr key={i} className="border-b border-crwn-elevated/50">
                  <td className="py-3 text-crwn-gold font-medium">{tier.name}</td>
                  <td className="py-3 text-crwn-text">{tier.threshold}</td>
                  <td className="py-3 text-crwn-text">{tier.flat}</td>
                  <td className="py-3 text-crwn-text">{tier.recurring}</td>
                  <td className="py-3 text-crwn-text">{tier.window}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-crwn-text-dim mt-3 text-center">
          Artists must stay on a paid plan for 30 days to qualify. Recurring is based on the artist's monthly subscription fee.
        </p>
      </div>

      <div className="text-center">
        <button
          onClick={handleBecomeRecruiter}
          disabled={isLoading}
          className="neu-button-accent px-8 py-4 text-lg disabled:opacity-50"
        >
          {isLoading ? 'Setting up...' : 'Become a Recruiter'}
        </button>
        <p className="text-xs text-crwn-text-dim mt-3">
          Free to join. You just need a CRWN account and a Stripe account to receive payouts.
        </p>
      </div>
    </div>
  );
}
