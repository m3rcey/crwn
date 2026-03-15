'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/shared/Toast';
import { Copy, Check, ExternalLink, DollarSign, Users, Clock, TrendingUp } from 'lucide-react';

export default function RecruiterDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [connectingStripe, setConnectingStripe] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetch(`/api/recruit/dashboard?userId=${user.id}`)
      .then(res => res.json())
      .then(d => {
        if (d.error) {
          router.push('/recruit');
        } else {
          setData(d);
        }
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [user, router]);

  const handleCopy = () => {
    const url = `https://thecrwn.app/join/${data?.recruiter?.referral_code}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    showToast('Link copied!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConnectStripe = async () => {
    setConnectingStripe(true);
    try {
      const res = await fetch('/api/recruit/connect-stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id }),
      });
      const d = await res.json();
      if (d.url) {
        window.location.href = d.url;
      } else {
        showToast(d.error || 'Failed to connect Stripe', 'error');
      }
    } catch {
      showToast('Something went wrong', 'error');
    } finally {
      setConnectingStripe(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-crwn-elevated rounded w-1/3" />
          <div className="h-32 bg-crwn-elevated rounded-xl" />
          <div className="h-48 bg-crwn-elevated rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { recruiter, referrals, payouts, stats } = data;
  const referralUrl = `thecrwn.app/join/${recruiter.referral_code}`;
  const hasStripe = !!recruiter.stripe_connect_id;

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 stagger-fade-in">
      <h1 className="text-2xl font-bold text-crwn-text mb-6">Recruiter Dashboard</h1>

      {!hasStripe && (
        <div className="bg-crwn-gold/10 border border-crwn-gold/30 rounded-xl p-4 mb-6">
          <p className="text-sm text-crwn-text mb-3">
            Connect your Stripe account to start receiving payouts.
          </p>
          <button
            onClick={handleConnectStripe}
            disabled={connectingStripe}
            className="neu-button-accent px-4 py-2 text-sm disabled:opacity-50"
          >
            {connectingStripe ? 'Connecting...' : 'Connect Stripe'}
          </button>
        </div>
      )}

      <div className="mb-6">
        <p className="text-sm text-crwn-text-secondary mb-2">Your referral link</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-[#0f0f0f] rounded-full px-4 py-3 text-crwn-text text-sm truncate">
            {referralUrl}
          </div>
          <button
            onClick={handleCopy}
            className="neu-button-accent px-4 py-3 flex items-center gap-2 text-sm"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {[
          { icon: Users, label: 'Qualified', value: stats.qualified, color: 'text-green-400' },
          { icon: Clock, label: 'Pending', value: stats.pending, color: 'text-crwn-gold' },
          { icon: DollarSign, label: 'Earned', value: `$${(stats.totalEarned / 100).toFixed(2)}`, color: 'text-green-400' },
          { icon: TrendingUp, label: 'Tier', value: recruiter.tier.charAt(0).toUpperCase() + recruiter.tier.slice(1), color: 'text-crwn-gold' },
        ].map((stat, i) => (
          <div key={i} className="bg-[#1a1a1a] rounded-xl p-4 text-center">
            <stat.icon className={`w-5 h-5 mx-auto mb-1 ${stat.color}`} />
            <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-crwn-text-secondary">{stat.label}</p>
          </div>
        ))}
      </div>

      {referrals.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-crwn-text mb-3">Referred Artists</h2>
          <div>
            {referrals.map((ref: any) => (
              <div key={ref.id} className="flex items-center justify-between py-3 border-b border-crwn-elevated/50">
                <div>
                  <p className="text-sm text-crwn-text">{ref.artist_user?.full_name || ref.artist_user?.email || 'Artist'}</p>
                  <p className="text-xs text-crwn-text-secondary">
                    {new Date(ref.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  ref.status === 'qualified' ? 'bg-green-500/20 text-green-400' :
                  ref.status === 'pending' ? 'bg-crwn-gold/20 text-crwn-gold' :
                  'bg-red-500/20 text-red-400'
                }`}>
                  {ref.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {payouts.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-crwn-text mb-3">Payout History</h2>
          <div>
            {payouts.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between py-3 border-b border-crwn-elevated/50">
                <div>
                  <p className="text-sm text-crwn-text">{p.description}</p>
                  <p className="text-xs text-crwn-text-secondary">
                    {new Date(p.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-green-400">${(p.amount / 100).toFixed(2)}</p>
                  <p className={`text-xs ${p.status === 'paid' ? 'text-green-400' : 'text-crwn-gold'}`}>{p.status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {referrals.length === 0 && (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-crwn-text-secondary mx-auto mb-3" />
          <p className="text-crwn-text-secondary">No referrals yet. Share your link to get started!</p>
        </div>
      )}

      {hasStripe && (
        <div className="mt-8 text-center">
          <button
            onClick={handleConnectStripe}
            className="text-sm text-crwn-text-secondary hover:text-crwn-gold transition-colors flex items-center gap-1 mx-auto"
          >
            <ExternalLink className="w-3 h-3" /> Stripe Dashboard
          </button>
        </div>
      )}
    </div>
  );
}
