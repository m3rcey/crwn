'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { AiInsight, AiInsightType } from '@/types';
import { useRouter } from 'next/navigation';
import {
  TrendingUp,
  UserMinus,
  Star,
  Calendar,
  Pen,
  FileText,
  X,
  Sparkles,
  RefreshCw,
  ArrowRight,
  Crown,
  Music,
} from 'lucide-react';
import { FadeIn } from '@/components/ui/FadeIn';

const TYPE_CONFIG: Record<AiInsightType, { icon: React.ElementType; label: string }> = {
  revenue: { icon: TrendingUp, label: 'Revenue' },
  churn: { icon: UserMinus, label: 'Churn Alert' },
  vip_fan: { icon: Star, label: 'VIP Fan' },
  booking_reminder: { icon: Calendar, label: 'Reminder' },
  content_nudge: { icon: Pen, label: 'Content' },
  weekly_digest: { icon: FileText, label: 'Digest' },
  sync_match: { icon: Music, label: 'Sync Opportunity' },
};

const PRIORITY_STYLES: Record<string, string> = {
  urgent: 'border-crwn-gold/60 bg-crwn-gold/5',
  high: 'border-crwn-gold/30 bg-crwn-gold/[0.02]',
  normal: 'border-crwn-elevated',
  low: 'border-crwn-elevated/50',
};

interface AiManagerCardProps {
  artistId: string;
  platformTier: string;
  isFoundingArtist?: boolean;
}

export function AiManagerCard({ artistId, platformTier, isFoundingArtist }: AiManagerCardProps) {
  const supabase = createBrowserSupabaseClient();
  const router = useRouter();
  const [insights, setInsights] = useState<AiInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const effectiveTier = (platformTier === 'starter' && isFoundingArtist) ? 'pro' : platformTier;
  const isStarterOnly = effectiveTier === 'starter';

  const fetchInsights = useCallback(async () => {
    const { data } = await supabase
      .from('ai_insights')
      .select('*')
      .eq('artist_id', artistId)
      .eq('is_dismissed', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(20);

    if (data) {
      setInsights(data as AiInsight[]);

      // Mark unread insights as read
      const unreadIds = data.filter(d => !d.is_read).map(d => d.id);
      if (unreadIds.length > 0) {
        await supabase
          .from('ai_insights')
          .update({ is_read: true })
          .in('id', unreadIds);
      }
    }
    setLoading(false);
  }, [artistId, supabase]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const handleDismiss = async (id: string) => {
    setInsights(prev => prev.filter(i => i.id !== id));
    await supabase
      .from('ai_insights')
      .update({ is_dismissed: true })
      .eq('id', id);
  };

  const handleAction = (insight: AiInsight) => {
    if (insight.action_type === 'link' && insight.action_url) {
      router.push(insight.action_url);
    }
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await fetch('/api/ai-manager/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || ''}`,
        },
        body: JSON.stringify({ artistId }),
      });
      await fetchInsights();
    } catch {
      // Silently fail — user can try again
    }
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-crwn-gold" />
      </div>
    );
  }

  return (
    <FadeIn>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-crwn-gold/10">
              <Sparkles className="w-5 h-5 text-crwn-gold" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-crwn-text">AI Manager</h2>
              <p className="text-sm text-crwn-text-secondary">
                Your 24/7 assistant analyzing your data and surfacing opportunities
              </p>
            </div>
          </div>
          {!isStarterOnly && (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-crwn-text-secondary hover:text-crwn-gold border border-crwn-elevated rounded-full transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Analyzing...' : 'Refresh'}
            </button>
          )}
        </div>

        {/* Starter Tier Upsell */}
        {isStarterOnly && (
          <div className="mb-6 p-4 rounded-xl border border-crwn-gold/20 bg-crwn-gold/5">
            <div className="flex items-start gap-3">
              <Crown className="w-5 h-5 text-crwn-gold mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-crwn-text">
                  Upgrade to Pro for AI-powered insights
                </p>
                <p className="text-xs text-crwn-text-secondary mt-1">
                  Get churn prevention alerts, VIP fan detection, smart content suggestions, and revenue optimization — all tailored to your data.
                </p>
                <button
                  onClick={() => router.push('/profile/artist?tab=billing')}
                  className="mt-3 inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-crwn-gold text-black rounded-full hover:bg-crwn-gold/90 transition-colors"
                >
                  Upgrade to Pro
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Insight Feed */}
        {insights.length === 0 ? (
          <div className="text-center py-16">
            <Sparkles className="w-10 h-10 text-crwn-text-secondary/30 mx-auto mb-4" />
            <p className="text-crwn-text-secondary text-sm">
              No insights yet. Your AI Manager checks in daily with recommendations.
            </p>
            {!isStarterOnly && (
              <p className="text-crwn-text-secondary/60 text-xs mt-2">
                Or hit Refresh to generate insights now.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {insights.map((insight) => {
              const config = TYPE_CONFIG[insight.type] || TYPE_CONFIG.content_nudge;
              const Icon = config.icon;
              const priorityStyle = PRIORITY_STYLES[insight.priority] || PRIORITY_STYLES.normal;

              return (
                <div
                  key={insight.id}
                  className={`p-4 rounded-xl border transition-colors ${priorityStyle}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-1.5 rounded-lg shrink-0 ${
                      insight.priority === 'urgent' ? 'bg-crwn-gold/20 text-crwn-gold' : 'bg-crwn-elevated text-crwn-text-secondary'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-medium uppercase tracking-wider text-crwn-text-secondary/60">
                            {config.label}
                          </span>
                          <h3 className="text-sm font-semibold text-crwn-text mt-0.5">
                            {insight.title}
                          </h3>
                        </div>
                        <button
                          onClick={() => handleDismiss(insight.id)}
                          className="p-1 text-crwn-text-secondary/40 hover:text-crwn-text-secondary transition-colors shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-xs text-crwn-text-secondary mt-1 leading-relaxed">
                        {insight.body}
                      </p>
                      <div className="flex items-center gap-3 mt-3">
                        {insight.action_type === 'link' && insight.action_url && (
                          <button
                            onClick={() => handleAction(insight)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-crwn-gold hover:text-crwn-gold/80 transition-colors"
                          >
                            Take action
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                        <span className="text-[10px] text-crwn-text-secondary/40">
                          {new Date(insight.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </FadeIn>
  );
}

// Teaser banner for the Analytics tab
interface AiManagerTeaserProps {
  artistId: string;
  onNavigate: () => void;
}

export function AiManagerTeaser({ artistId, onNavigate }: AiManagerTeaserProps) {
  const supabase = createBrowserSupabaseClient();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    async function checkUnread() {
      const { count } = await supabase
        .from('ai_insights')
        .select('id', { count: 'exact', head: true })
        .eq('artist_id', artistId)
        .eq('is_read', false)
        .eq('is_dismissed', false)
        .gt('expires_at', new Date().toISOString());

      setUnreadCount(count || 0);
    }
    checkUnread();
  }, [artistId, supabase]);

  if (unreadCount === 0) return null;

  return (
    <button
      onClick={onNavigate}
      className="w-full mb-6 p-3 rounded-xl border border-crwn-gold/20 bg-crwn-gold/5 flex items-center gap-3 hover:bg-crwn-gold/10 transition-colors text-left"
    >
      <Sparkles className="w-4 h-4 text-crwn-gold shrink-0" />
      <span className="text-sm text-crwn-text">
        You have <span className="font-semibold text-crwn-gold">{unreadCount}</span> new insight{unreadCount !== 1 ? 's' : ''} from your AI Manager
      </span>
      <ArrowRight className="w-4 h-4 text-crwn-text-secondary ml-auto shrink-0" />
    </button>
  );
}
