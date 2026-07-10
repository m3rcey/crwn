'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { buildReferralUrl } from '@/lib/referrals';
import {
  MISSION_TYPE_LABELS,
  missionActionHref,
  missionCurrentCount,
  type MissionTargetKind,
  type MissionType,
} from '@/lib/missions';
import {
  Loader2, Zap, Flag, ArrowRight, Link2, Check, Compass, DollarSign, Library,
} from 'lucide-react';
import { usePageTour } from '@/hooks/usePageTour';
import { getCommandTourSteps } from '@/lib/commandTourSteps';
import { TourReplayButton } from '@/components/shared/TourReplayButton';
import { UpcomingCalendarCard } from '@/components/fan/UpcomingCalendarCard';

interface CommandMission {
  missionId: string;
  title: string;
  cta: string | null;
  type: MissionType;
  targetKind: MissionTargetKind;
  targetId: string | null;
  artistSlug: string | null;
  artistName: string;
  goalCount: number;
  manualCount: number;
  demandResponseCount: number | null;
  joinedAt: string;
}

interface CommandOpportunity {
  artistId: string;
  artistName: string;
  slug: string | null;
  referralCommissionRate: number;
}

interface CommandData {
  referralCode: string;
  joinedMissions: CommandMission[];
  earningOpportunities: CommandOpportunity[];
  weekSnapshot: {
    availableCents: number;
    lifetimeEarnedCents: number;
    revenueGeneratedCents: number;
  };
}

const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Adapt an API mission row to the shared lib/missions progress + href helpers. */
const progressFields = (m: CommandMission) => ({
  target_kind: m.targetKind,
  target_id: m.targetId,
  manual_count: m.manualCount,
});

const missionHref = (m: CommandMission) =>
  m.artistSlug
    ? missionActionHref({ type: m.type, target_kind: m.targetKind, target_id: m.targetId }, m.artistSlug)
    : '/my-missions';

/**
 * Fan Command Center — "what should I do now". One prioritized daily move,
 * the missions you've joined, a money snapshot, and your earning opportunities.
 * Pure surfacing: links out to /earn, /impact, and /my-missions for the detail.
 */
export default function CommandPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<CommandData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedArtistId, setCopiedArtistId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    fetch('/api/command')
      .then(res => res.json())
      .then(result => {
        if (!result.error) setData(result);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [user, authLoading, router]);

  // First-visit tour + on-demand replay (button in the header). Sections here
  // render conditionally, so the steps only include anchors that exist.
  const tourMissions = data?.joinedMissions?.length ?? 0;
  const tourOpportunities = data?.earningOpportunities?.length ?? 0;
  const { replay } = usePageTour({
    tourId: 'command',
    steps: getCommandTourSteps({
      hasMissions: tourMissions > 0,
      hasWeek: tourMissions > 0 || tourOpportunities > 0,
      hasOpportunities: tourOpportunities > 0,
    }),
    userId: user?.id,
    enabled: !authLoading && !isLoading && !!user,
  });

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

  const missions = data?.joinedMissions || [];
  const opportunities = data?.earningOpportunities || [];
  const snapshot = data?.weekSnapshot || {
    availableCents: 0,
    lifetimeEarnedCents: 0,
    revenueGeneratedCents: 0,
  };
  const isBrandNew = missions.length === 0 && opportunities.length === 0;

  // Demand-test counts came down with the payload — build the map the shared
  // missionCurrentCount helper expects.
  const demandCounts: Record<string, number> = {};
  for (const m of missions) {
    if (m.targetKind === 'demand_test' && m.targetId && m.demandResponseCount !== null) {
      demandCounts[m.targetId] = m.demandResponseCount;
    }
  }

  // Today's move — one action, picked deterministically:
  // (a) newest joined mission → (b) best-paying share link → (c) explore.
  const todaysMission = missions[0] || null;
  const todaysOpportunity = !todaysMission ? (opportunities[0] || null) : null;

  return (
    <div className="max-w-2xl mx-auto page-fade-in">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-crwn-text">Command Center</h1>
        <div className="shrink-0 mt-1 flex items-center gap-3">
          <button
            onClick={() => router.push('/library')}
            className="text-xs font-semibold text-crwn-gold hover:text-crwn-gold/80 transition-colors flex items-center gap-1"
          >
            <Library className="w-3.5 h-3.5" />
            Your Library
          </button>
          <TourReplayButton onClick={replay} />
        </div>
      </div>
      <p className="text-sm text-crwn-text-secondary mb-6">
        Your next move for the artists you back. One action at a time.
      </p>

      <div className="space-y-6 stagger-fade-in">
        {/* 1. Today's move — the single highest-priority action */}
        <div className="neu-raised rounded-xl p-5 border border-crwn-gold/20" data-tour="command-today">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-crwn-gold" />
            <p className="text-xs font-semibold text-crwn-gold uppercase tracking-wide">Today&apos;s move</p>
          </div>

          {todaysMission ? (
            <>
              <p className="text-lg font-bold text-crwn-text">
                Continue: {todaysMission.title}
              </p>
              <p className="text-sm text-crwn-text-secondary mt-1">
                {todaysMission.artistName} is counting on you.{' '}
                {MISSION_TYPE_LABELS[todaysMission.type]},{' '}
                {missionCurrentCount(progressFields(todaysMission), demandCounts)}/{todaysMission.goalCount} so far.
              </p>
              <button
                onClick={() => router.push(missionHref(todaysMission))}
                className="mt-4 inline-flex items-center gap-1.5 bg-crwn-gold text-crwn-bg text-sm font-semibold px-5 py-2 rounded-full hover:bg-crwn-gold/90 transition-colors"
              >
                {todaysMission.cta || 'Do it'}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </>
          ) : todaysOpportunity ? (
            <>
              <p className="text-lg font-bold text-crwn-text">
                Grab your {todaysOpportunity.artistName} link and earn{' '}
                <span className="text-green-400">{todaysOpportunity.referralCommissionRate}%</span>
              </p>
              <p className="text-sm text-crwn-text-secondary mt-1">
                Every friend who subscribes through it pays {todaysOpportunity.artistName} and pays you.
              </p>
              {todaysOpportunity.slug && (
                <button
                  onClick={() => handleCopyLink(todaysOpportunity.artistId, todaysOpportunity.slug!)}
                  className="mt-4 inline-flex items-center gap-1.5 bg-crwn-gold text-crwn-bg text-sm font-semibold px-5 py-2 rounded-full hover:bg-crwn-gold/90 transition-colors"
                >
                  {copiedArtistId === todaysOpportunity.artistId
                    ? <Check className="w-3.5 h-3.5" />
                    : <Link2 className="w-3.5 h-3.5" />}
                  {copiedArtistId === todaysOpportunity.artistId ? 'Copied' : 'Copy link'}
                </button>
              )}
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-crwn-text">Find an artist to support</p>
              <p className="text-sm text-crwn-text-secondary mt-1">
                Everything here starts with one artist. Join a mission or grab a share link
                from any artist page and your next moves show up here.
              </p>
              <button
                onClick={() => router.push('/explore')}
                className="mt-4 inline-flex items-center gap-1.5 bg-crwn-gold text-crwn-bg text-sm font-semibold px-5 py-2 rounded-full hover:bg-crwn-gold/90 transition-colors"
              >
                <Compass className="w-3.5 h-3.5" />
                Explore artists
              </button>
            </>
          )}
        </div>

        {/* Upcoming for you — self-hides when the fan's calendar is empty */}
        <UpcomingCalendarCard />

        {isBrandNew ? (
          /* Brand-new fan — nothing joined, nothing to share yet */
          <div className="neu-raised rounded-xl p-8 text-center">
            <Flag className="w-12 h-12 text-crwn-gold/30 mx-auto mb-3" />
            <p className="text-crwn-text font-medium">Your command center is empty, for now</p>
            <p className="text-sm text-crwn-text-secondary mt-2 max-w-sm mx-auto">
              Subscribe to an artist or join one of their missions and this page becomes
              your daily hub: what to do, what you&apos;ve earned, and the impact you&apos;re driving.
            </p>
          </div>
        ) : (
          <>
            {/* 2. Your missions */}
            {missions.length > 0 && (
              <div className="neu-raised rounded-xl p-4" data-tour="command-missions">
                <div className="flex items-center gap-2 mb-1">
                  <Flag className="w-4 h-4 text-crwn-gold" />
                  <p className="text-sm text-crwn-text font-medium">Your missions</p>
                </div>
                <div className="divide-y divide-crwn-elevated">
                  {missions.map(m => {
                    const current = missionCurrentCount(progressFields(m), demandCounts);
                    const goalMet = current >= m.goalCount;
                    const pct = Math.min(100, Math.round((current / Math.max(1, m.goalCount)) * 100));
                    return (
                      <div key={m.missionId} className="py-3 first:pt-2 last:pb-0">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm text-crwn-text font-medium truncate">{m.title}</p>
                            <p className="text-xs text-crwn-text-secondary truncate mt-0.5">
                              {m.artistName} · {MISSION_TYPE_LABELS[m.type]} · {current}/{m.goalCount}
                            </p>
                          </div>
                          <button
                            onClick={() => router.push(missionHref(m))}
                            className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-crwn-gold/15 text-crwn-gold hover:bg-crwn-gold/25 transition-colors"
                          >
                            {m.cta || 'Do it'}
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-crwn-elevated overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${goalMet ? 'bg-green-400' : 'bg-crwn-gold'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={() => router.push('/my-missions')}
                  className="mt-3 text-xs font-semibold text-crwn-gold hover:text-crwn-gold/80 transition-colors flex items-center gap-1"
                >
                  View all
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* 3. This week — money snapshot, links to the detail surfaces */}
            <div className="grid grid-cols-2 gap-4" data-tour="command-week">
              <button
                onClick={() => router.push('/earn')}
                className="neu-raised rounded-xl p-4 text-left hover:opacity-90 transition-opacity"
              >
                <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">Available</p>
                <p className="text-2xl font-bold text-green-400 mt-1">{formatCurrency(snapshot.availableCents)}</p>
                <p className="text-[11px] text-crwn-gold font-semibold mt-1 flex items-center gap-1">
                  Cash out
                  <ArrowRight className="w-3 h-3" />
                </p>
              </button>
              <button
                onClick={() => router.push('/impact')}
                className="neu-raised rounded-xl p-4 text-left hover:opacity-90 transition-opacity"
              >
                <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">Revenue driven</p>
                <p className="text-2xl font-bold text-green-400 mt-1">{formatCurrency(snapshot.revenueGeneratedCents)}</p>
                <p className="text-[11px] text-crwn-gold font-semibold mt-1 flex items-center gap-1">
                  See your impact
                  <ArrowRight className="w-3 h-3" />
                </p>
              </button>
            </div>

            {/* 4. Earning opportunities */}
            {opportunities.length > 0 && (
              <div className="neu-raised rounded-xl p-4" data-tour="command-opportunities">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-4 h-4 text-green-400" />
                  <p className="text-sm text-crwn-text font-medium">Earning opportunities</p>
                </div>
                <p className="text-xs text-crwn-text-secondary mb-2">
                  Artists you back that pay you for every fan you bring in.
                </p>
                <div className="divide-y divide-crwn-elevated">
                  {opportunities.map(o => (
                    <div key={o.artistId} className="flex items-center justify-between gap-3 py-3 first:pt-2 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-sm text-crwn-text font-medium truncate">{o.artistName}</p>
                        <p className="text-xs text-green-400 font-semibold mt-0.5">
                          {o.referralCommissionRate}% commission
                        </p>
                      </div>
                      {o.slug && (
                        <button
                          onClick={() => handleCopyLink(o.artistId, o.slug!)}
                          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-crwn-gold/15 text-crwn-gold hover:bg-crwn-gold/25 transition-colors"
                          title="Copy your share link"
                        >
                          {copiedArtistId === o.artistId
                            ? <Check className="w-3.5 h-3.5" />
                            : <Link2 className="w-3.5 h-3.5" />}
                          {copiedArtistId === o.artistId ? 'Copied' : 'Copy link'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
