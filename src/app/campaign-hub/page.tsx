'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Flag,
  Megaphone,
  Scissors,
  Share2,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { MISSION_TYPE_LABELS, type MissionType } from '@/lib/missions';
import { usePageTour } from '@/hooks/usePageTour';
import { getCampaignHubTourSteps } from '@/lib/campaignHubTourSteps';
import { TourReplayButton } from '@/components/shared/TourReplayButton';
import { smartBack } from '@/lib/navigation';

interface Promoter {
  fanId: string;
  name: string;
  earnedCents: number;
  activeSubscribers: number;
  source: string | null;
}

interface MissionPerf {
  id: string;
  title: string;
  type: string;
  goalCount: number;
  currentCount: number;
  participantCount: number;
  deadline: string | null;
}

interface HubData {
  grossRevenueCents: number;
  commissionsOwedCents: number;
  netCents: number;
  activeResiduals: number;
  revenueSplit: { shareToEarnCents: number; clipToEarnCents: number };
  currentCommission: {
    shareRate: number;
    clipRate: number;
    nextClipChange: { date: string; from: number; to: number } | null;
  };
  topPromoters: Promoter[];
  missionPerformance: MissionPerf[];
}

type Tab = 'overview' | 'engine' | 'missions';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'engine', label: 'Promotion Engine' },
  { id: 'missions', label: 'Missions' },
];

const MS_PER_DAY = 86_400_000;

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Campaign Hub — the artist's promotion engine at a glance. READ-ONLY command
 * center: revenue driven, commissions owed, net, residuals, current rates +
 * step-down, Share vs Clip split, top promoters, mission performance. v1 is
 * artist-wide; per-campaign breakdowns are a later money phase.
 */
export default function CampaignHubPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [isArtist, setIsArtist] = useState(true);
  const [data, setData] = useState<HubData | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  // Captured once per mount so render stays pure (react-compiler lint).
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/campaign-hub');
      if (res.status === 403) {
        setIsArtist(false);
        setLoading(false);
        return;
      }
      if (res.ok) {
        setData(await res.json());
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

  // First-visit tour + on-demand replay. MUST stay above the early returns
  // below (rules of hooks) — gated by `enabled` so it only fires once the
  // real page content is rendered.
  const { replay } = usePageTour({
    tourId: 'campaign-hub',
    steps: getCampaignHubTourSteps({ onOverview: tab === 'overview' }),
    userId: user?.id,
    enabled: !authLoading && !loading && isArtist,
  });

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
        <p className="text-crwn-text mb-4">The Campaign Hub is for artists. Publish your artist page first.</p>
        <button
          onClick={() => router.push('/home')}
          className="bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full hover:bg-crwn-gold/90 transition-colors"
        >
          Back to CRWN
        </button>
      </div>
    );
  }

  const gross = data?.grossRevenueCents ?? 0;
  const owed = data?.commissionsOwedCents ?? 0;
  const net = data?.netCents ?? 0;
  const residuals = data?.activeResiduals ?? 0;
  const share = data?.revenueSplit?.shareToEarnCents ?? 0;
  const clip = data?.revenueSplit?.clipToEarnCents ?? 0;
  const splitTotal = share + clip;
  const sharePct = splitTotal > 0 ? Math.round((share / splitTotal) * 100) : 0;
  const clipPct = splitTotal > 0 ? 100 - sharePct : 0;
  const commission = data?.currentCommission ?? { shareRate: 0, clipRate: 0, nextClipChange: null };
  const nextChange = commission.nextClipChange;
  const daysUntilChange = nextChange
    ? Math.max(1, Math.ceil((new Date(nextChange.date).getTime() - now) / MS_PER_DAY))
    : null;
  const promoters = data?.topPromoters ?? [];
  const missions = data?.missionPerformance ?? [];

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <button
          onClick={() => smartBack(router, '/studio')}
          className="inline-flex items-center gap-2 text-sm text-crwn-text-secondary hover:text-crwn-text transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Studio
        </button>

        <div className="flex items-center justify-between gap-3 mb-2" data-tour="campaign-hub-header">
          <div className="flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-crwn-gold" />
            <h1 className="text-3xl font-bold text-crwn-text">Campaign Hub</h1>
          </div>
          <TourReplayButton onClick={replay} />
        </div>
        <p className="text-crwn-text-secondary text-sm mb-4">Your promotion engine at a glance.</p>

        <span className="inline-block px-3 py-1 rounded-full text-[11px] font-medium bg-crwn-elevated text-crwn-text-secondary mb-8">
          Artist-wide view. Per-campaign breakdowns coming soon
        </span>

        {/* Tabs — hand-rolled like the artist dashboard */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto" data-tour="campaign-hub-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                tab === t.id
                  ? 'bg-crwn-gold text-crwn-bg'
                  : 'bg-crwn-elevated text-crwn-text-secondary hover:text-crwn-text'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ---- OVERVIEW ---- */}
        {tab === 'overview' && (
          <div>
            <div className="grid grid-cols-2 gap-3 mb-6" data-tour="campaign-hub-stats">
              <div className="bg-crwn-card rounded-2xl p-4">
                <p className="text-xs text-crwn-text-secondary mb-1">Gross revenue driven</p>
                <p className="text-xl font-bold text-green-400">{money(gross)}</p>
              </div>
              <div className="bg-crwn-card rounded-2xl p-4">
                <p className="text-xs text-crwn-text-secondary mb-1">Commissions owed</p>
                <p className="text-xl font-bold text-crwn-gold">{money(owed)}</p>
              </div>
              <div className="bg-crwn-card rounded-2xl p-4">
                <p className="text-xs text-crwn-text-secondary mb-1">Your net</p>
                <p className="text-xl font-bold text-green-400">{money(net)}</p>
              </div>
              <div className="bg-crwn-card rounded-2xl p-4">
                <p className="text-xs text-crwn-text-secondary mb-1">Active residuals</p>
                <p className="text-xl font-bold text-crwn-text">{residuals}</p>
              </div>
            </div>

            {/* Current commission card */}
            <div className="bg-crwn-card rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-crwn-gold" />
                <p className="text-sm font-semibold text-crwn-text">Current commission</p>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="inline-flex items-center gap-2 text-sm text-crwn-text-secondary">
                  <Share2 className="w-4 h-4" />
                  Share-to-Earn
                </span>
                <span className="font-bold text-crwn-text">{commission.shareRate}%</span>
              </div>
              <div className="flex items-center justify-between py-2 border-t border-crwn-elevated">
                <span className="inline-flex items-center gap-2 text-sm text-crwn-text-secondary">
                  <Scissors className="w-4 h-4" />
                  Clip-to-Earn
                </span>
                <span className="font-bold text-crwn-text">{commission.clipRate}%</span>
              </div>
              {nextChange && daysUntilChange !== null && (
                <p className="text-xs text-orange-400 mt-2">
                  Clip rate drops to {nextChange.to}% in {daysUntilChange} day{daysUntilChange === 1 ? '' : 's'}
                </p>
              )}
            </div>

            {gross === 0 && owed === 0 && residuals === 0 && (
              <div className="border border-dashed border-crwn-elevated rounded-2xl py-10 px-6 text-center mt-6">
                <Megaphone className="w-8 h-8 text-crwn-gold mx-auto mb-3" />
                <p className="text-crwn-text font-medium mb-1">No promoter revenue yet</p>
                <p className="text-sm text-crwn-text-secondary">
                  When fans share or clip and their referrals pay, the money shows up here.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ---- PROMOTION ENGINE ---- */}
        {tab === 'engine' && (
          <div>
            {/* Share vs Clip revenue split */}
            <div className="bg-crwn-card rounded-2xl p-5 mb-6">
              <p className="text-sm font-semibold text-crwn-text mb-4">Commission split by channel</p>
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="inline-flex items-center gap-2 text-sm text-crwn-text-secondary">
                    <Share2 className="w-4 h-4" />
                    Share-to-Earn
                  </span>
                  <span className="text-sm font-semibold text-crwn-text">
                    {money(share)} <span className="text-crwn-text-secondary font-normal">· {sharePct}%</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-crwn-elevated overflow-hidden">
                  <div className="h-full rounded-full bg-crwn-gold" style={{ width: `${sharePct}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="inline-flex items-center gap-2 text-sm text-crwn-text-secondary">
                    <Scissors className="w-4 h-4" />
                    Clip-to-Earn
                  </span>
                  <span className="text-sm font-semibold text-crwn-text">
                    {money(clip)} <span className="text-crwn-text-secondary font-normal">· {clipPct}%</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-crwn-elevated overflow-hidden">
                  <div className="h-full rounded-full bg-green-400" style={{ width: `${clipPct}%` }} />
                </div>
              </div>
              {splitTotal === 0 && (
                <p className="text-xs text-crwn-text-secondary mt-3">No commission paid yet on either channel.</p>
              )}
            </div>

            {/* Top promoters */}
            <p className="text-sm font-semibold text-crwn-text mb-2">Top promoters</p>
            {promoters.length === 0 ? (
              <div className="border border-dashed border-crwn-elevated rounded-2xl py-10 px-6 text-center">
                <Users className="w-8 h-8 text-crwn-gold mx-auto mb-3" />
                <p className="text-crwn-text font-medium mb-1">No promoters yet</p>
                <p className="text-sm text-crwn-text-secondary">
                  Fans who share or clip your work and convert subscribers will rank here.
                </p>
              </div>
            ) : (
              <div className="space-y-0">
                {promoters.map((p, i) => (
                  <div key={p.fanId} className={`py-3 ${i > 0 ? 'border-t border-crwn-elevated' : ''}`}>
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-sm font-bold text-crwn-text-secondary flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-crwn-text truncate">{p.name}</p>
                          {p.source && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-crwn-elevated text-crwn-text-secondary">
                              {p.source === 'clipper' ? 'Clipper' : 'Sharer'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-crwn-text-secondary">
                          {p.activeSubscribers} active subscriber{p.activeSubscribers === 1 ? '' : 's'}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-green-400 flex-shrink-0">
                        {money(p.earnedCents)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---- MISSIONS ---- */}
        {tab === 'missions' && (
          <div>
            {missions.length === 0 ? (
              <div className="border border-dashed border-crwn-elevated rounded-2xl py-10 px-6 text-center mb-6">
                <Flag className="w-8 h-8 text-crwn-gold mx-auto mb-3" />
                <p className="text-crwn-text font-medium mb-1">No active missions</p>
                <p className="text-sm text-crwn-text-secondary">
                  Give your fans one clear action and a goal. Mission progress shows up here.
                </p>
              </div>
            ) : (
              <div className="space-y-0 mb-6">
                {missions.map((m, i) => {
                  const pct = Math.min(100, Math.round((m.currentCount / Math.max(1, m.goalCount)) * 100));
                  const typeLabel = MISSION_TYPE_LABELS[m.type as MissionType] || m.type;
                  const deadlinePassed = !!m.deadline && new Date(m.deadline).getTime() < now;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => router.push(`/missions/${m.id}`)}
                      className={`w-full text-left py-4 ${i > 0 ? 'border-t border-crwn-elevated' : ''} group`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-crwn-gold/10 flex items-center justify-center flex-shrink-0">
                          <Flag className="w-5 h-5 text-crwn-gold" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-crwn-text truncate group-hover:text-crwn-gold transition-colors">
                            {m.title}
                          </p>
                          <p className="text-xs text-crwn-text-secondary truncate">
                            {typeLabel} · {m.currentCount}/{m.goalCount} · {m.participantCount} joined
                            {m.deadline && (
                              <span className={deadlinePassed ? ' text-orange-400' : ''}>
                                {' '}· {deadlinePassed ? 'ended' : 'ends'} {new Date(m.deadline).toLocaleDateString()}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 ml-13 h-1.5 rounded-full bg-crwn-elevated overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${m.currentCount >= m.goalCount ? 'bg-green-400' : 'bg-crwn-gold'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <button
              onClick={() => router.push('/action-plan')}
              className="inline-flex items-center gap-2 text-sm font-medium text-purple-400 hover:text-purple-300 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              See recommended moves
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Read-only footer */}
        <p className="text-xs text-crwn-text-secondary text-center mt-10">
          Read-only summary. Manage rates in Clip Controls and missions in Missions.
        </p>
      </div>
    </div>
  );
}
