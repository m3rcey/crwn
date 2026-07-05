'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import {
  Loader2, TrendingUp, Users, Heart, Sparkles, ArrowRight, Flag,
} from 'lucide-react';

interface ImpactData {
  revenueGeneratedCents: number;
  fansReferred: number;
  artistsSupported: number;
  lifetimeEarnedCents: number;
  perArtist: {
    artistId: string;
    artistName: string;
    slug: string | null;
    revenueCents: number;
    earnedCents: number;
    subscribersReferred: number;
  }[];
  timeline: {
    artistName: string;
    commissionCents: number;
    grossCents: number;
    createdAt: string;
  }[];
}

const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export default function ImpactPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<ImpactData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    fetch('/api/impact')
      .then(res => res.json())
      .then(result => {
        if (!result.error) setData(result);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [user, authLoading, router]);

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const hasImpact = !!data && (
    data.revenueGeneratedCents > 0 ||
    data.fansReferred > 0 ||
    data.artistsSupported > 0
  );

  return (
    <div className="max-w-2xl mx-auto page-fade-in">
      <h1 className="text-2xl font-bold text-crwn-text mb-1">Your Impact</h1>
      <p className="text-sm text-crwn-text-secondary mb-6">
        The difference you&apos;ve made for the artists you back.
      </p>

      {/* Fan missions entry point — the missions you've joined live at /my-missions. */}
      <button
        onClick={() => router.push('/my-missions')}
        className="w-full neu-raised rounded-xl p-4 mb-6 flex items-center justify-between gap-3 text-left hover:opacity-90 transition-opacity"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Flag className="w-5 h-5 text-crwn-gold flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-crwn-text">My Missions</p>
            <p className="text-xs text-crwn-text-secondary truncate">
              The artist missions you&apos;ve joined — pick them up here.
            </p>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-crwn-text-secondary flex-shrink-0" />
      </button>

      {!data || !hasImpact ? (
        /* Empty state */
        <div className="neu-raised rounded-xl p-8 text-center">
          <Heart className="w-12 h-12 text-crwn-gold/30 mx-auto mb-3" />
          <p className="text-crwn-text font-medium">Your impact starts with one share</p>
          <p className="text-sm text-crwn-text-secondary mt-2 max-w-sm mx-auto">
            Grab a <span className="text-green-400 font-medium">Share &amp; Earn</span> link on
            any artist&apos;s page. Every fan you bring in puts real money in that artist&apos;s
            pocket — and it all shows up here as proof.
          </p>
          <button
            onClick={() => router.push('/explore')}
            className="mt-5 px-5 py-2 rounded-full font-semibold text-sm neu-button-accent text-crwn-bg"
          >
            Find an artist to back
          </button>
        </div>
      ) : (
        <div className="space-y-6 stagger-fade-in">
          {/* 1. Hero — total impact */}
          <div className="grid grid-cols-3 gap-3">
            <div className="neu-raised rounded-xl p-4">
              <div className="flex items-center gap-1">
                <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">Revenue</p>
                <TrendingUp className="w-3 h-3 text-green-400" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-green-400 mt-1">
                {formatCurrency(data.revenueGeneratedCents)}
              </p>
              <p className="text-[11px] text-crwn-text-secondary mt-1">Generated for artists</p>
            </div>
            <div className="neu-raised rounded-xl p-4">
              <div className="flex items-center gap-1">
                <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">Fans</p>
                <Users className="w-3 h-3 text-crwn-gold" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-crwn-text mt-1">{data.fansReferred}</p>
              <p className="text-[11px] text-crwn-text-secondary mt-1">Referred by you</p>
            </div>
            <div className="neu-raised rounded-xl p-4">
              <div className="flex items-center gap-1">
                <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">Artists</p>
                <Heart className="w-3 h-3 text-crwn-gold" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-crwn-text mt-1">{data.artistsSupported}</p>
              <p className="text-[11px] text-crwn-text-secondary mt-1">Supported</p>
            </div>
          </div>

          {/* 2. Earnings handoff */}
          <div className="neu-raised rounded-xl p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">Your Earnings</p>
                <p className="text-lg font-bold text-green-400 mt-1">
                  {formatCurrency(data.lifetimeEarnedCents)}
                </p>
                <p className="text-[11px] text-crwn-text-secondary mt-0.5">
                  Earned lifetime from sharing artists
                </p>
              </div>
              <button
                onClick={() => router.push('/earn')}
                className="shrink-0 neu-button-accent text-crwn-bg px-4 py-2 rounded-full font-semibold text-sm flex items-center gap-1.5"
              >
                View earnings &amp; cash out
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 3. Per-artist impact */}
          {data.perArtist.length > 0 && (
            <div className="neu-raised rounded-xl p-4">
              <p className="text-sm text-crwn-text-secondary mb-3">Your impact by artist</p>
              <div className="divide-y divide-crwn-elevated">
                {data.perArtist.map(artist => (
                  <div
                    key={artist.artistId}
                    onClick={() => artist.slug && router.push(`/${artist.slug}`)}
                    className={`flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 ${
                      artist.slug ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-crwn-text font-medium truncate">{artist.artistName}</p>
                      <p className="text-xs text-crwn-text-secondary mt-0.5">
                        {artist.subscribersReferred} subscriber{artist.subscribersReferred === 1 ? '' : 's'} referred
                        {artist.earnedCents > 0 && (
                          <> &middot; you earned {formatCurrency(artist.earnedCents)}</>
                        )}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm text-green-400 font-semibold">
                        {formatCurrency(artist.revenueCents)}
                      </p>
                      <p className="text-[11px] text-crwn-text-secondary">revenue driven</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. Impact timeline */}
          {data.timeline.length > 0 && (
            <div className="neu-raised rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-crwn-gold" />
                <p className="text-sm text-crwn-text-secondary">Impact timeline</p>
              </div>
              <div className="divide-y divide-crwn-elevated">
                {data.timeline.map((event, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 text-sm">
                    <p className="text-crwn-text min-w-0 truncate">
                      Drove <span className="text-green-400 font-semibold">{formatCurrency(event.grossCents)}</span> for{' '}
                      <span className="font-medium">{event.artistName}</span>
                    </p>
                    <span className="text-xs text-crwn-text-secondary shrink-0">
                      {relativeTime(event.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
