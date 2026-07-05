'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { buildReferralUrl } from '@/lib/referrals';
import { CLIPPER_RAMP_PRESETS } from '@/lib/clipperRate';
import {
  Loader2, DollarSign, Wallet, Users, Clock, TrendingUp,
  Link2, Check, Gift, Scissors, ArrowRight,
} from 'lucide-react';

interface EarnData {
  lifetimeEarnedCents: number;
  heldCents: number;
  availableCents: number;
  paidCents: number;
  activeSubscribers: number;
  holdDays: number;
  stripeConnected: boolean;
  referralCode: string;
  perArtist: {
    artistId: string;
    artistName: string;
    slug: string | null;
    subscriberCount: number;
    earnedCents: number;
  }[];
  payouts: {
    id: string;
    amount: number;
    status: string;
    created_at: string;
  }[];
}

const MIN_CASHOUT_CENTS = 2500;

const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function PayoutStatusBadge({ status }: { status: string }) {
  const styles =
    status === 'completed'
      ? 'bg-green-500/15 text-green-400'
      : status === 'pending'
      ? 'bg-crwn-gold/15 text-crwn-gold'
      : 'bg-red-500/15 text-red-400';
  return (
    <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-semibold ${styles}`}>
      {status}
    </span>
  );
}

export default function EarnPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const [data, setData] = useState<EarnData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCashingOut, setIsCashingOut] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [copiedArtistId, setCopiedArtistId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    fetch('/api/earn')
      .then(res => res.json())
      .then(result => {
        if (!result.error) setData(result);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [user, authLoading, router]);

  // Same connect + cash-out rails as ReferralDashboard — no new payout path.
  const handleConnectStripe = async () => {
    setIsConnecting(true);
    try {
      const res = await fetch('/api/stripe/fan-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const result = await res.json();
      if (result.url) {
        window.location.href = result.url;
      } else {
        showToast(result.error || 'Failed to connect Stripe', 'error');
      }
    } catch {
      showToast('Failed to connect Stripe', 'error');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleCashout = async () => {
    if (!data) return;
    if (!data.stripeConnected) {
      handleConnectStripe();
      return;
    }
    setIsCashingOut(true);
    try {
      const res = await fetch('/api/stripe/fan-cashout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const result = await res.json();
      if (result.success) {
        showToast(`$${(result.amount / 100).toFixed(2)} cashed out successfully!`, 'success');
        setData(prev => prev ? {
          ...prev,
          availableCents: 0,
          paidCents: prev.paidCents + result.amount,
        } : prev);
      } else {
        showToast(result.error || 'Cashout failed', 'error');
      }
    } catch {
      showToast('Cashout failed', 'error');
    } finally {
      setIsCashingOut(false);
    }
  };

  const handleCopyLink = async (artistId: string, slug: string) => {
    if (!data) return;
    const url = buildReferralUrl(slug, data.referralCode);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopiedArtistId(artistId);
    setTimeout(() => setCopiedArtistId(null), 2000);
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const hasEarnings = !!data && (data.lifetimeEarnedCents > 0 || data.perArtist.length > 0);

  return (
    <div className="max-w-2xl mx-auto page-fade-in">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-crwn-text">Earn Center</h1>
        <div className="shrink-0 mt-1 flex items-center gap-3">
          <button
            onClick={() => router.push('/command')}
            className="text-xs font-semibold text-crwn-gold hover:text-crwn-gold/80 transition-colors flex items-center gap-1"
          >
            Command Center
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => router.push('/impact')}
            className="text-xs font-semibold text-crwn-gold hover:text-crwn-gold/80 transition-colors flex items-center gap-1"
          >
            View your impact
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <p className="text-sm text-crwn-text-secondary mb-6">
        Everything you&apos;ve earned sharing artists on CRWN, in one place.
      </p>

      {!data || !hasEarnings ? (
        /* Empty state */
        <div className="neu-raised rounded-xl p-8 text-center">
          <Gift className="w-12 h-12 text-crwn-gold/30 mx-auto mb-3" />
          <p className="text-crwn-text font-medium">Nothing earned yet — let&apos;s change that</p>
          <p className="text-sm text-crwn-text-secondary mt-2 max-w-sm mx-auto">
            Hit <span className="text-green-400 font-medium">Share &amp; Earn</span> on any artist&apos;s
            page to grab your link. When a friend subscribes through it, you earn a recurring
            commission — and it all shows up here.
          </p>
          <button
            onClick={() => router.push('/explore')}
            className="mt-5 px-5 py-2 rounded-full font-semibold text-sm neu-button-accent text-crwn-bg"
          >
            Find an artist to share
          </button>
        </div>
      ) : (
        <div className="space-y-6 stagger-fade-in">
          {/* 1. Earnings summary */}
          <div className="grid grid-cols-2 gap-4">
            <div className="neu-raised rounded-xl p-4">
              <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">Available</p>
              <p className="text-2xl font-bold text-green-400 mt-1">{formatCurrency(data.availableCents)}</p>
              <p className="text-[11px] text-crwn-text-secondary mt-1">Ready to cash out</p>
            </div>
            <div className="neu-raised rounded-xl p-4">
              <div className="flex items-center gap-1">
                <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">Pending</p>
                <Clock className="w-3 h-3 text-crwn-gold" />
              </div>
              <p className="text-2xl font-bold text-crwn-gold mt-1">{formatCurrency(data.heldCents)}</p>
              <p className="text-[11px] text-crwn-text-secondary mt-1">
                Clears after {data.holdDays} day{data.holdDays === 1 ? '' : 's'}
              </p>
            </div>
            <div className="neu-raised rounded-xl p-4">
              <div className="flex items-center gap-1">
                <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">Lifetime</p>
                <TrendingUp className="w-3 h-3 text-crwn-text-secondary" />
              </div>
              <p className="text-2xl font-bold text-crwn-text mt-1">{formatCurrency(data.lifetimeEarnedCents)}</p>
              <p className="text-[11px] text-crwn-text-secondary mt-1">Earned all-time</p>
            </div>
            <div className="neu-raised rounded-xl p-4">
              <div className="flex items-center gap-1">
                <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">Subscribers</p>
                <Users className="w-3 h-3 text-crwn-text-secondary" />
              </div>
              <p className="text-2xl font-bold text-crwn-text mt-1">{data.activeSubscribers}</p>
              <p className="text-[11px] text-crwn-text-secondary mt-1">Active, attributed to you</p>
            </div>
          </div>

          {/* 2. Cash out */}
          <div className="neu-raised rounded-xl p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">Cash Out</p>
                <p className="text-sm text-crwn-text mt-1">
                  {data.stripeConnected
                    ? 'Send your available balance to your bank.'
                    : 'Set up payouts once to start cashing out.'}
                </p>
                {data.paidCents > 0 && (
                  <p className="text-xs text-crwn-text-secondary mt-1">
                    Total paid out: {formatCurrency(data.paidCents)}
                  </p>
                )}
              </div>
              {!data.stripeConnected ? (
                <button
                  onClick={handleConnectStripe}
                  disabled={isConnecting}
                  className="shrink-0 neu-button-accent text-crwn-bg px-4 py-2 rounded-full font-semibold flex items-center gap-2 disabled:opacity-50"
                >
                  {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
                  Set Up Payouts
                </button>
              ) : (
                <button
                  onClick={handleCashout}
                  disabled={isCashingOut || data.availableCents < MIN_CASHOUT_CENTS}
                  className="shrink-0 neu-button-accent text-crwn-bg px-4 py-2 rounded-full font-semibold flex items-center gap-2 disabled:opacity-50"
                >
                  {isCashingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                  Cash Out
                </button>
              )}
            </div>
            {data.availableCents > 0 && data.availableCents < MIN_CASHOUT_CENTS && (
              <p className="text-xs text-crwn-text-secondary mt-2">Minimum cashout is $25.00</p>
            )}
          </div>

          {/* 3. Where your earnings come from */}
          {data.perArtist.length > 0 && (
            <div className="neu-raised rounded-xl p-4">
              <p className="text-sm text-crwn-text-secondary mb-3">Where your earnings come from</p>
              <div className="divide-y divide-crwn-elevated">
                {data.perArtist.map(artist => (
                  <div key={artist.artistId} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm text-crwn-text font-medium truncate">{artist.artistName}</p>
                      <p className="text-xs text-crwn-text-secondary mt-0.5">
                        {artist.subscriberCount} active subscriber{artist.subscriberCount === 1 ? '' : 's'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm text-green-400 font-semibold">
                        {formatCurrency(artist.earnedCents)}
                      </span>
                      {artist.slug && (
                        <button
                          onClick={() => handleCopyLink(artist.artistId, artist.slug!)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-crwn-gold/15 text-crwn-gold hover:bg-crwn-gold/25 transition-colors"
                          title="Copy your share link"
                        >
                          {copiedArtistId === artist.artistId
                            ? <Check className="w-3.5 h-3.5" />
                            : <Link2 className="w-3.5 h-3.5" />}
                          {copiedArtistId === artist.artistId ? 'Copied' : 'Copy link'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. Payout history */}
          {data.payouts.length > 0 && (
            <div className="neu-raised rounded-xl p-4">
              <p className="text-sm text-crwn-text-secondary mb-3">Payout history</p>
              <div className="divide-y divide-crwn-elevated">
                {data.payouts.map(payout => (
                  <div key={payout.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-crwn-text font-semibold">{formatCurrency(payout.amount)}</span>
                      <PayoutStatusBadge status={payout.status} />
                    </div>
                    <span className="text-xs text-crwn-text-secondary">
                      {new Date(payout.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 5. Commission ladder explainer */}
          <div className="neu-raised rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Scissors className="w-4 h-4 text-crwn-gold" />
              <p className="text-sm text-crwn-text font-medium">Clip &amp; Earn ramps</p>
            </div>
            <p className="text-xs text-crwn-text-secondary mb-3">
              Some artists pay clippers a boosted cut at launch that steps down over time.
              A typical ramp looks like this:
            </p>
            {(() => {
              const ramp = CLIPPER_RAMP_PRESETS.find(p => p.steps.length > 0) || CLIPPER_RAMP_PRESETS[0];
              return (
                <div>
                  <p className="text-xs text-crwn-gold font-semibold uppercase tracking-wide mb-2">{ramp.label}</p>
                  <div className="space-y-1.5">
                    {ramp.steps.map((step, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-crwn-text-secondary">
                          {i === 0 ? 'First' : 'Next'} {step.days} days
                        </span>
                        <span className="text-crwn-text font-semibold">{step.percent}% cut</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-crwn-text-secondary">After that</span>
                      <span className="text-crwn-text font-semibold">Artist&apos;s standard rate</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-crwn-text-secondary mt-3">
                    Each artist sets their own rates — the exact cut is shown when you grab a clip link.
                  </p>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
