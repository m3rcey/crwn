'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FlaskConical,
  Lightbulb,
  Megaphone,
  Scissors,
  ShoppingBag,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

type Priority = 'high' | 'medium' | 'low';

interface Recommendation {
  id: string;
  priority: Priority;
  title: string;
  why: string;
  ctaLabel: string;
  href: string;
  icon?: string;
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  scissors: Scissors,
  lightbulb: Lightbulb,
  trophy: Trophy,
  users: Users,
  'shopping-bag': ShoppingBag,
  megaphone: Megaphone,
  flask: FlaskConical,
};

// high = orange (time-sensitive), medium = gold, low = muted.
const PRIORITY_STYLES: Record<Priority, string> = {
  high: 'bg-orange-500/15 text-orange-400 border border-orange-500/40',
  medium: 'bg-crwn-gold/15 text-crwn-gold border border-crwn-gold/40',
  low: 'bg-crwn-elevated text-crwn-text-secondary',
};

const PRIORITY_LABELS: Record<Priority, string> = {
  high: 'Do this now',
  medium: 'Worth doing',
  low: 'When you have time',
};

/**
 * AI Artist Action Plan — the artist's next best moves, ranked. ADVISORY-ONLY:
 * every card explains why and deep-links to where the artist does it manually.
 * Nothing here auto-executes and nothing touches money or prices.
 */
export default function ActionPlanPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [isArtist, setIsArtist] = useState(true);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/action-plan');
      if (res.status === 403) {
        setIsArtist(false);
        setLoading(false);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setRecommendations(data.recommendations || []);
      }
    } catch {
      // Network hiccup — show the empty state rather than crashing.
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    load();
  }, [authLoading, user, router, load]);

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-crwn-gold" />
      </div>
    );
  }

  if (!isArtist) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <p className="text-crwn-text mb-4">The Action Plan is for artists. Publish your artist page first.</p>
        <button
          onClick={() => router.push('/home')}
          className="bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full hover:bg-crwn-gold/90 transition-colors"
        >
          Back to CRWN
        </button>
      </div>
    );
  }

  const [topMove, ...rest] = recommendations;
  const TopIcon = (topMove?.icon && ICONS[topMove.icon]) || Sparkles;

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <button
          onClick={() => router.push('/profile/artist')}
          className="inline-flex items-center gap-2 text-sm text-crwn-text-secondary hover:text-crwn-text transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </button>

        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-6 h-6 text-purple-400" />
          <h1 className="text-3xl font-bold text-crwn-text">Your Action Plan</h1>
        </div>
        <p className="text-crwn-text-secondary text-sm mb-8">Your next best moves, ranked.</p>

        {recommendations.length === 0 ? (
          <div className="border border-dashed border-crwn-elevated rounded-2xl py-14 px-6 text-center">
            <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-3" />
            <p className="text-crwn-text font-medium mb-1">
              You&apos;re all caught up — nothing needs attention right now.
            </p>
            <p className="text-sm text-crwn-text-secondary">
              Check back after your next drop, mission, or demand test.
            </p>
          </div>
        ) : (
          <>
            {/* Top move — the single highest-priority recommendation */}
            <div className="border border-purple-500/30 rounded-2xl p-5 sm:p-6 mb-8 bg-purple-500/5">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-purple-400">
                  Top move
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${PRIORITY_STYLES[topMove.priority]}`}
                >
                  {PRIORITY_LABELS[topMove.priority]}
                </span>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-full bg-crwn-gold/10 flex items-center justify-center flex-shrink-0">
                  <TopIcon className="w-5 h-5 text-crwn-gold" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold text-crwn-text mb-1">{topMove.title}</h2>
                  <p className="text-sm text-crwn-text-secondary mb-4">{topMove.why}</p>
                  <button
                    onClick={() => router.push(topMove.href)}
                    className="inline-flex items-center gap-2 bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full hover:bg-crwn-gold/90 transition-colors"
                  >
                    {topMove.ctaLabel}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* The rest, ranked */}
            {rest.length > 0 && (
              <div className="space-y-0 mb-8">
                {rest.map((rec, i) => {
                  const Icon = (rec.icon && ICONS[rec.icon]) || Sparkles;
                  return (
                    <div key={rec.id} className={`py-4 ${i > 0 ? 'border-t border-crwn-elevated' : ''}`}>
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-crwn-gold/10 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-5 h-5 text-crwn-gold" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <p className="font-medium text-crwn-text">{rec.title}</p>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${PRIORITY_STYLES[rec.priority]}`}
                            >
                              {PRIORITY_LABELS[rec.priority]}
                            </span>
                          </div>
                          <p className="text-sm text-crwn-text-secondary mb-2">{rec.why}</p>
                          <button
                            onClick={() => router.push(rec.href)}
                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-crwn-gold hover:text-crwn-gold/80 transition-colors"
                          >
                            {rec.ctaLabel}
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Advisory-only footer */}
        <p className="text-xs text-crwn-text-secondary text-center mt-10">
          These are suggestions — nothing happens automatically. You&apos;re always in control.
        </p>
      </div>
    </div>
  );
}
