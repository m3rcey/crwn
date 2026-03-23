'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import {
  Check,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  User,
  CreditCard,
  Music,
  Share2,
  DollarSign,
  Sparkles,
  Lock,
} from 'lucide-react';
import { FadeIn } from '@/components/ui/FadeIn';

interface RoadmapStep {
  id: string;
  label: string;
  description: string;
  completed: boolean;
  actionLabel?: string;
  actionTab?: string;
  actionUrl?: string;
}

interface RoadmapPhase {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  steps: RoadmapStep[];
}

interface RoadmapProgress {
  hasAvatar: boolean;
  hasBanner: boolean;
  hasBio: boolean;
  hasGenres: boolean;
  hasSocialLinks: boolean;
  hasSlug: boolean;
  hasStripeConnect: boolean;
  trackCount: number;
  freeTrackCount: number;
  gatedTrackCount: number;
  hasFreeTier: boolean;
  hasPaidTier: boolean;
  freeTierCount: number;
  paidTierCount: number;
  freeSubscriberCount: number;
  paidSubscriberCount: number;
  totalSubscriberCount: number;
}

interface MonetizationRoadmapProps {
  artistId: string;
  onSwitchTab: (tab: string) => void;
}

export function MonetizationRoadmap({ artistId, onSwitchTab }: MonetizationRoadmapProps) {
  const supabase = createBrowserSupabaseClient();
  const router = useRouter();
  const [progress, setProgress] = useState<RoadmapProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const fetchProgress = useCallback(async () => {
    // Fetch artist profile + profile data
    const { data: artist } = await supabase
      .from('artist_profiles')
      .select('id, user_id, slug, banner_url, stripe_connect_id, genres')
      .eq('id', artistId)
      .single();

    if (!artist) {
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('avatar_url, bio, social_links')
      .eq('id', artist.user_id)
      .single();

    // Fetch tracks
    const { data: tracks } = await supabase
      .from('tracks')
      .select('id, is_free, allowed_tier_ids')
      .eq('artist_id', artistId)
      .eq('is_active', true);

    const trackList = tracks || [];
    const freeTrackCount = trackList.filter(t => t.is_free !== false).length;
    const gatedTrackCount = trackList.filter(t => t.is_free === false && t.allowed_tier_ids?.length > 0).length;

    // Fetch tiers
    const { data: tiers } = await supabase
      .from('subscription_tiers')
      .select('id, price, is_active')
      .eq('artist_id', artistId)
      .eq('is_active', true);

    const tierList = tiers || [];
    const freeTiers = tierList.filter(t => t.price === 0);
    const paidTiers = tierList.filter(t => t.price > 0);

    // Fetch subscriber counts
    const { count: totalSubs } = await supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', artistId)
      .eq('status', 'active');

    // Count paid subscribers (subscribed to a paid tier)
    const paidTierIds = paidTiers.map(t => t.id);
    let paidSubCount = 0;
    if (paidTierIds.length > 0) {
      const { count } = await supabase
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('artist_id', artistId)
        .eq('status', 'active')
        .in('tier_id', paidTierIds);
      paidSubCount = count || 0;
    }

    const socialLinks = profile?.social_links || {};
    const hasSocialLinks = Object.values(socialLinks).some((v: unknown) => typeof v === 'string' && v.trim() !== '');

    setProgress({
      hasAvatar: !!profile?.avatar_url,
      hasBanner: !!artist.banner_url,
      hasBio: !!profile?.bio && profile.bio.trim().length > 0,
      hasGenres: Array.isArray(artist.genres) && artist.genres.length > 0,
      hasSocialLinks,
      hasSlug: !!artist.slug,
      hasStripeConnect: !!artist.stripe_connect_id,
      trackCount: trackList.length,
      freeTrackCount,
      gatedTrackCount,
      hasFreeTier: freeTiers.length > 0,
      hasPaidTier: paidTiers.length > 0,
      freeTierCount: freeTiers.length,
      paidTierCount: paidTiers.length,
      freeSubscriberCount: (totalSubs || 0) - paidSubCount,
      paidSubscriberCount: paidSubCount,
      totalSubscriberCount: totalSubs || 0,
    });

    setLoading(false);
  }, [artistId, supabase]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  // Auto-expand the first incomplete phase
  useEffect(() => {
    if (!progress) return;
    const phases = buildPhases(progress);
    const firstIncomplete = phases.find(p => p.steps.some(s => !s.completed));
    if (firstIncomplete && !expandedPhase) {
      setExpandedPhase(firstIncomplete.id);
    }
  }, [progress, expandedPhase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-crwn-gold" />
      </div>
    );
  }

  if (!progress) return null;

  const phases = buildPhases(progress);
  const totalSteps = phases.reduce((sum, p) => sum + p.steps.length, 0);
  const completedSteps = phases.reduce((sum, p) => sum + p.steps.filter(s => s.completed).length, 0);
  const isComplete = completedSteps === totalSteps;

  // If roadmap is complete and dismissed, don't show
  if (isComplete && dismissed) return null;

  const overallPercent = Math.round((completedSteps / totalSteps) * 100);

  const handleAction = (step: RoadmapStep) => {
    if (step.actionTab) {
      onSwitchTab(step.actionTab);
    } else if (step.actionUrl) {
      router.push(step.actionUrl);
    }
  };

  return (
    <FadeIn>
      <div className="mb-8 rounded-xl border border-crwn-elevated overflow-hidden">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-crwn-gold/5 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-crwn-gold/10">
                <Sparkles className="w-5 h-5 text-crwn-gold" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-crwn-text">Path to Monetization</h3>
                <p className="text-sm text-crwn-text-secondary">
                  {isComplete
                    ? 'You\'re monetized! Your AI Manager will guide you from here.'
                    : `${completedSteps} of ${totalSteps} steps complete`}
                </p>
              </div>
            </div>
            {isComplete && (
              <button
                onClick={() => setDismissed(true)}
                className="text-xs text-crwn-text-secondary hover:text-crwn-text transition-colors"
              >
                Dismiss
              </button>
            )}
          </div>

          {/* Overall progress bar */}
          <div className="mt-4">
            <div className="h-2 rounded-full bg-crwn-elevated overflow-hidden">
              <div
                className="h-full rounded-full bg-crwn-gold transition-all duration-500"
                style={{ width: `${overallPercent}%` }}
              />
            </div>
            <p className="text-xs text-crwn-text-secondary mt-1.5">{overallPercent}% complete</p>
          </div>
        </div>

        {/* Phases */}
        <div className="divide-y divide-crwn-elevated">
          {phases.map((phase) => {
            const phaseCompleted = phase.steps.filter(s => s.completed).length;
            const phaseTotal = phase.steps.length;
            const phasePercent = Math.round((phaseCompleted / phaseTotal) * 100);
            const isExpanded = expandedPhase === phase.id;
            const isPhaseComplete = phaseCompleted === phaseTotal;
            const Icon = phase.icon;

            return (
              <div key={phase.id}>
                <button
                  onClick={() => setExpandedPhase(isExpanded ? null : phase.id)}
                  className="w-full px-5 py-4 flex items-center gap-4 hover:bg-crwn-elevated/20 transition-colors text-left"
                >
                  <div className={`p-2 rounded-lg ${isPhaseComplete ? 'bg-crwn-gold/20' : 'bg-crwn-elevated'}`}>
                    {isPhaseComplete ? (
                      <Check className="w-4 h-4 text-crwn-gold" />
                    ) : (
                      <Icon className="w-4 h-4 text-crwn-text-secondary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${isPhaseComplete ? 'text-crwn-gold' : 'text-crwn-text'}`}>
                        {phase.title}
                      </span>
                      <span className="text-xs text-crwn-text-secondary">
                        {phaseCompleted}/{phaseTotal}
                      </span>
                    </div>
                    {/* Phase progress bar */}
                    <div className="mt-1.5 h-1 rounded-full bg-crwn-elevated overflow-hidden max-w-[200px]">
                      <div
                        className="h-full rounded-full bg-crwn-gold transition-all duration-500"
                        style={{ width: `${phasePercent}%` }}
                      />
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-crwn-text-secondary shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-crwn-text-secondary shrink-0" />
                  )}
                </button>

                {isExpanded && (
                  <div className="px-5 pb-4 space-y-2">
                    <p className="text-xs text-crwn-text-secondary mb-3 pl-12">{phase.description}</p>
                    {phase.steps.map((step) => (
                      <div
                        key={step.id}
                        className={`flex items-start gap-3 pl-12 py-2 rounded-lg ${
                          step.completed ? 'opacity-60' : ''
                        }`}
                      >
                        <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                          step.completed
                            ? 'bg-crwn-gold/20'
                            : 'border border-crwn-elevated'
                        }`}>
                          {step.completed && <Check className="w-3 h-3 text-crwn-gold" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${step.completed ? 'text-crwn-text-secondary line-through' : 'text-crwn-text'}`}>
                            {step.label}
                          </p>
                          <p className="text-xs text-crwn-text-secondary/60 mt-0.5">
                            {step.description}
                          </p>
                        </div>
                        {!step.completed && (step.actionTab || step.actionUrl) && (
                          <button
                            onClick={() => handleAction(step)}
                            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-crwn-gold hover:text-crwn-gold/80 border border-crwn-gold/30 rounded-full transition-colors shrink-0"
                          >
                            {step.actionLabel || 'Do this'}
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </FadeIn>
  );
}

function buildPhases(p: RoadmapProgress): RoadmapPhase[] {
  const profileComplete = p.hasAvatar && p.hasBanner && p.hasBio && p.hasGenres && p.hasSocialLinks && p.hasSlug;

  return [
    {
      id: 'foundation',
      title: 'Set Up Your Foundation',
      description: 'Get your profile looking professional so fans take you seriously when you share your link.',
      icon: User,
      steps: [
        {
          id: 'avatar',
          label: 'Add a profile photo',
          description: 'First thing fans see — make it count.',
          completed: p.hasAvatar,
          actionLabel: 'Upload',
          actionTab: 'profile',
        },
        {
          id: 'banner',
          label: 'Add a banner image',
          description: 'Sets the vibe on your public profile page.',
          completed: p.hasBanner,
          actionLabel: 'Upload',
          actionTab: 'profile',
        },
        {
          id: 'bio',
          label: 'Write your bio',
          description: 'Tell fans who you are and what your music is about.',
          completed: p.hasBio,
          actionLabel: 'Write',
          actionTab: 'profile',
        },
        {
          id: 'genres',
          label: 'Select your genres',
          description: 'Helps fans discover you on the Explore page.',
          completed: p.hasGenres,
          actionLabel: 'Select',
          actionTab: 'profile',
        },
        {
          id: 'social',
          label: 'Add social links',
          description: 'Connect your IG, Twitter, TikTok — fans want to find you everywhere.',
          completed: p.hasSocialLinks,
          actionLabel: 'Add',
          actionTab: 'profile',
        },
        {
          id: 'stripe',
          label: 'Connect Stripe',
          description: 'Required to create tiers and get paid. Takes 2 minutes.',
          completed: p.hasStripeConnect,
          actionLabel: 'Connect',
          actionTab: 'tiers',
        },
      ],
    },
    {
      id: 'catalog',
      title: 'Build Your Catalog',
      description: 'Upload music and set up your free tier so fans have a reason to subscribe.',
      icon: Music,
      steps: [
        {
          id: 'first-track',
          label: 'Upload your first track',
          description: 'Start with a free track — this is the hook that draws fans in.',
          completed: p.trackCount >= 1,
          actionLabel: 'Upload',
          actionTab: 'tracks',
        },
        {
          id: 'three-tracks',
          label: 'Upload at least 3 tracks',
          description: '1-2 free, 1+ gated. Enough to feel like a real catalog.',
          completed: p.trackCount >= 3,
          actionLabel: 'Upload',
          actionTab: 'tracks',
        },
        {
          id: 'free-tier',
          label: 'Create a free tier',
          description: 'Lowest friction way to capture fans. They subscribe for $0 and unlock gated tracks.',
          completed: p.hasFreeTier,
          actionLabel: 'Create',
          actionTab: 'tiers',
        },
        {
          id: 'gate-track',
          label: 'Gate a track behind your free tier',
          description: 'Lock your best track — fans will subscribe to hear it.',
          completed: p.gatedTrackCount >= 1,
          actionLabel: 'Gate a track',
          actionTab: 'tracks',
        },
      ],
    },
    {
      id: 'audience',
      title: 'Grow Your Audience',
      description: 'Share gated track links on your socials to drive fans to subscribe.',
      icon: Share2,
      steps: [
        {
          id: 'share-link',
          label: 'Share a gated track link',
          description: 'Post a link to a locked track on your socials. Fans click, discover your profile, and subscribe.',
          completed: false, // Can't track this directly — will stay manual
          actionLabel: 'Copy link',
          actionTab: 'tracks',
        },
        {
          id: 'first-subscriber',
          label: 'Get your first subscriber',
          description: 'Even a free subscriber means someone chose to follow your journey.',
          completed: p.totalSubscriberCount >= 1,
        },
        {
          id: 'ten-subscribers',
          label: 'Reach 10 free subscribers',
          description: 'Now you have an audience to announce your paid tier to.',
          completed: p.freeSubscriberCount >= 10,
        },
      ],
    },
    {
      id: 'monetize',
      title: 'Monetize',
      description: 'Create a paid tier and start earning recurring revenue from your music.',
      icon: DollarSign,
      steps: [
        {
          id: 'paid-tier',
          label: 'Create a paid tier ($5-10/mo)',
          description: 'Offer exclusive tracks and early access to new releases.',
          completed: p.hasPaidTier,
          actionLabel: 'Create',
          actionTab: 'tiers',
        },
        {
          id: 'gate-paid',
          label: 'Gate new music behind the paid tier',
          description: 'This is the conversion engine — new drops are for paying supporters first.',
          completed: p.hasPaidTier && p.gatedTrackCount >= 2,
          actionLabel: 'Gate a track',
          actionTab: 'tracks',
        },
        {
          id: 'first-paid-subscriber',
          label: 'Get your first paid subscriber',
          description: 'Real revenue. You\'re officially monetized.',
          completed: p.paidSubscriberCount >= 1,
        },
      ],
    },
  ];
}
