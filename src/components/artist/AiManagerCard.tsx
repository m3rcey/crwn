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
  Check,
  XCircle,
  Bot,
  Zap,
  Shield,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { FadeIn } from '@/components/ui/FadeIn';
import { MonetizationRoadmap } from './MonetizationRoadmap';

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

const ACTION_TYPE_LABELS: Record<string, string> = {
  toggle_sequence: 'Email Sequence',
  create_discount_code: 'Discount Code',
  gate_track: 'Gate Track',
  ungate_track: 'Ungate Track',
  schedule_campaign: 'Email Campaign',
  create_community_post: 'Community Post',
  send_reengagement: 'Re-engagement',
  adjust_tier_price: 'Tier Pricing',
};

const RISK_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  low: { bg: 'bg-green-500/10', text: 'text-green-400', label: 'Auto' },
  medium: { bg: 'bg-crwn-gold/10', text: 'text-crwn-gold', label: 'Review' },
  high: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Caution' },
};

interface PendingAction {
  id: string;
  action_type: string;
  action_label: string;
  action_description: string;
  action_params: Record<string, unknown>;
  risk: string;
  status: string;
  result_message: string | null;
  created_at: string;
  executed_at: string | null;
  outcome_delta: Record<string, number> | null;
  outcome_measured_at: string | null;
}

interface AgentRun {
  id: string;
  diagnosis_summary: string;
  severity: string;
  actions_recommended: number;
  actions_auto_executed: number;
  actions_escalated: number;
  outcome: string;
  created_at: string;
}

interface AiManagerCardProps {
  artistId: string;
  platformTier: string;
  isFoundingArtist?: boolean;
  onSwitchTab?: (tab: string) => void;
}

export function AiManagerCard({ artistId, platformTier, isFoundingArtist, onSwitchTab }: AiManagerCardProps) {
  const supabase = createBrowserSupabaseClient();
  const router = useRouter();
  const [insights, setInsights] = useState<AiInsight[]>([]);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [recentActions, setRecentActions] = useState<PendingAction[]>([]);
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const effectiveTier = (platformTier === 'starter' && isFoundingArtist) ? 'pro' : platformTier;
  const isStarterOnly = effectiveTier === 'starter';

  const fetchAll = useCallback(async () => {
    // Fetch insights
    const { data: insightData } = await supabase
      .from('ai_insights')
      .select('*')
      .eq('artist_id', artistId)
      .eq('is_dismissed', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(20);

    if (insightData) {
      setInsights(insightData as AiInsight[]);
      const unreadIds = insightData.filter(d => !d.is_read).map(d => d.id);
      if (unreadIds.length > 0) {
        await supabase.from('ai_insights').update({ is_read: true }).in('id', unreadIds);
      }
    }

    // Fetch pending actions
    const { data: pendingData } = await supabase
      .from('artist_agent_actions')
      .select('*')
      .eq('artist_id', artistId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(10);

    setPendingActions((pendingData || []) as PendingAction[]);

    // Fetch recent executed/rejected actions (last 30 days to show measured outcomes)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: recentData } = await supabase
      .from('artist_agent_actions')
      .select('*')
      .eq('artist_id', artistId)
      .in('status', ['auto_executed', 'executed', 'rejected', 'failed'])
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(15);

    setRecentActions((recentData || []) as PendingAction[]);

    // Fetch agent run history
    const { data: runData } = await supabase
      .from('artist_agent_runs')
      .select('*')
      .eq('artist_id', artistId)
      .order('created_at', { ascending: false })
      .limit(7);

    setAgentRuns((runData || []) as AgentRun[]);

    setLoading(false);
  }, [artistId, supabase]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleDismiss = async (id: string) => {
    setInsights(prev => prev.filter(i => i.id !== id));
    await supabase.from('ai_insights').update({ is_dismissed: true }).eq('id', id);
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
      await fetchAll();
    } catch {
      // Silently fail
    }
    setRefreshing(false);
  };

  const handleApproveAction = async (actionId: string, approve: boolean) => {
    setProcessingAction(actionId);
    try {
      const res = await fetch('/api/ai-manager/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId, approve }),
      });
      if (res.ok) {
        await fetchAll();
      }
    } catch {
      // Silently fail
    }
    setProcessingAction(null);
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
                Your 24/7 assistant analyzing your data and taking action
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

        {/* Monetization Roadmap */}
        {onSwitchTab && (
          <MonetizationRoadmap artistId={artistId} onSwitchTab={onSwitchTab} />
        )}

        {/* Starter Tier Upsell */}
        {isStarterOnly && (
          <div className="mb-6 p-4 rounded-xl border border-crwn-gold/20 bg-crwn-gold/5">
            <div className="flex items-start gap-3">
              <Crown className="w-5 h-5 text-crwn-gold mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-crwn-text">
                  Upgrade to Pro for AI-powered insights and autonomous actions
                </p>
                <p className="text-xs text-crwn-text-secondary mt-1">
                  Get churn prevention, VIP fan detection, auto re-engagement emails, smart pricing suggestions, and more — all tailored to your data.
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

        {/* Pending Actions — Needs Artist Approval */}
        {pendingActions.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-crwn-gold" />
              <h3 className="text-sm font-semibold text-crwn-text">Pending Actions</h3>
              <span className="text-xs text-crwn-gold bg-crwn-gold/10 px-2 py-0.5 rounded-full">
                {pendingActions.length} awaiting approval
              </span>
            </div>
            <div className="space-y-2">
              {pendingActions.map((action) => {
                const riskStyle = RISK_STYLES[action.risk] || RISK_STYLES.medium;
                const isProcessing = processingAction === action.id;

                return (
                  <div
                    key={action.id}
                    className="p-4 rounded-xl border border-crwn-gold/30 bg-crwn-gold/[0.02]"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-1.5 rounded-lg bg-crwn-gold/20 text-crwn-gold shrink-0">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-medium uppercase tracking-wider text-crwn-text-secondary/60">
                            {ACTION_TYPE_LABELS[action.action_type] || action.action_type}
                          </span>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${riskStyle.bg} ${riskStyle.text}`}>
                            {riskStyle.label}
                          </span>
                        </div>
                        <h3 className="text-sm font-semibold text-crwn-text mt-0.5">
                          {action.action_label}
                        </h3>
                        <p className="text-xs text-crwn-text-secondary mt-1 leading-relaxed">
                          {action.action_description}
                        </p>
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            onClick={() => handleApproveAction(action.id, true)}
                            disabled={isProcessing}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-crwn-gold text-black rounded-full hover:bg-crwn-gold/90 transition-colors disabled:opacity-50"
                          >
                            <Check className="w-3 h-3" />
                            {isProcessing ? 'Executing...' : 'Approve'}
                          </button>
                          <button
                            onClick={() => handleApproveAction(action.id, false)}
                            disabled={isProcessing}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-crwn-text-secondary border border-crwn-elevated rounded-full hover:text-crwn-text transition-colors disabled:opacity-50"
                          >
                            <XCircle className="w-3 h-3" />
                            Reject
                          </button>
                          <span className="text-[10px] text-crwn-text-secondary/40 ml-auto">
                            {new Date(action.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Agent Activity */}
        {recentActions.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-crwn-text-secondary" />
              <h3 className="text-sm font-semibold text-crwn-text">Recent Agent Activity</h3>
            </div>
            <div className="space-y-1.5">
              {recentActions.map((action) => {
                const isSuccess = action.status === 'auto_executed' || action.status === 'executed';
                const isRejected = action.status === 'rejected';
                const delta = action.outcome_delta;
                const hasMeasurement = action.outcome_measured_at && delta;

                // Compute simple outcome score for badge
                let outcomeVerdict: 'positive' | 'negative' | 'neutral' | null = null;
                if (hasMeasurement) {
                  const score = (delta.mrr || 0) + (delta.activeSubs || 0) * 100 - (delta.churnRate || 0) * 500;
                  outcomeVerdict = score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
                }

                return (
                  <div key={action.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-crwn-elevated/30">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                      isSuccess ? 'bg-green-500/20' : isRejected ? 'bg-crwn-text-secondary/20' : 'bg-red-500/20'
                    }`}>
                      {isSuccess ? (
                        <Check className="w-3 h-3 text-green-400" />
                      ) : isRejected ? (
                        <X className="w-3 h-3 text-crwn-text-secondary" />
                      ) : (
                        <XCircle className="w-3 h-3 text-red-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-crwn-text truncate">
                        {action.action_label}
                        {action.status === 'auto_executed' && (
                          <span className="text-crwn-text-secondary/60 ml-1">(auto)</span>
                        )}
                      </p>
                      {action.result_message && (
                        <p className="text-[10px] text-crwn-text-secondary/60 truncate">{action.result_message}</p>
                      )}
                      {hasMeasurement && (
                        <div className="flex items-center gap-2 mt-1">
                          {delta.mrr !== 0 && (
                            <span className={`text-[10px] font-medium ${delta.mrr > 0 ? 'text-green-400' : 'text-red-400'}`}>
                              MRR {delta.mrr > 0 ? '+' : ''}{(delta.mrr / 100).toFixed(0)}
                            </span>
                          )}
                          {delta.activeSubs !== 0 && (
                            <span className={`text-[10px] font-medium ${delta.activeSubs > 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {delta.activeSubs > 0 ? '+' : ''}{delta.activeSubs} subs
                            </span>
                          )}
                          {delta.churnRate !== 0 && (
                            <span className={`text-[10px] font-medium ${delta.churnRate < 0 ? 'text-green-400' : 'text-red-400'}`}>
                              churn {delta.churnRate > 0 ? '+' : ''}{delta.churnRate}%
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {outcomeVerdict && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          outcomeVerdict === 'positive' ? 'bg-green-500/10 text-green-400' :
                          outcomeVerdict === 'negative' ? 'bg-red-500/10 text-red-400' :
                          'bg-crwn-elevated text-crwn-text-secondary'
                        }`}>
                          {outcomeVerdict === 'positive' ? 'Worked' : outcomeVerdict === 'negative' ? 'No lift' : 'Flat'}
                        </span>
                      )}
                      <span className="text-[10px] text-crwn-text-secondary/40">
                        {new Date(action.executed_at || action.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Agent Run History (collapsible) */}
        {agentRuns.length > 0 && (
          <div className="mb-6">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2 mb-2 text-sm text-crwn-text-secondary hover:text-crwn-text transition-colors"
            >
              <Clock className="w-4 h-4" />
              <span className="font-medium">Agent Run History</span>
              <span className="text-xs text-crwn-text-secondary/60">({agentRuns.length} runs)</span>
              {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {showHistory && (
              <div className="space-y-1.5">
                {agentRuns.map((run) => {
                  const severityColor = run.severity === 'critical' ? 'text-red-400' : run.severity === 'warning' ? 'text-crwn-gold' : 'text-blue-400';
                  return (
                    <div key={run.id} className="px-3 py-2.5 rounded-lg bg-crwn-elevated/30 border border-crwn-elevated/50">
                      <div className="flex items-center gap-2">
                        <Bot className={`w-3.5 h-3.5 ${severityColor}`} />
                        <p className="text-xs text-crwn-text flex-1 truncate">{run.diagnosis_summary}</p>
                        <span className="text-[10px] text-crwn-text-secondary/40 shrink-0">
                          {new Date(run.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 ml-5.5">
                        {run.actions_auto_executed > 0 && (
                          <span className="text-[10px] text-green-400">
                            {run.actions_auto_executed} auto-executed
                          </span>
                        )}
                        {run.actions_escalated > 0 && (
                          <span className="text-[10px] text-crwn-gold">
                            {run.actions_escalated} escalated
                          </span>
                        )}
                        {run.actions_recommended === 0 && (
                          <span className="text-[10px] text-crwn-text-secondary/60">No actions needed</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Insight Feed */}
        {insights.length === 0 && pendingActions.length === 0 && recentActions.length === 0 ? (
          <div className="text-center py-16">
            <Sparkles className="w-10 h-10 text-crwn-text-secondary/30 mx-auto mb-4" />
            <p className="text-crwn-text-secondary text-sm">
              No insights yet. Your AI Manager checks in daily with recommendations and actions.
            </p>
            {!isStarterOnly && (
              <p className="text-crwn-text-secondary/60 text-xs mt-2">
                Or hit Refresh to generate insights now.
              </p>
            )}
          </div>
        ) : insights.length > 0 && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-crwn-text-secondary" />
              <h3 className="text-sm font-semibold text-crwn-text">Insights</h3>
            </div>
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
          </>
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
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    async function checkUnread() {
      const { count: insightCount } = await supabase
        .from('ai_insights')
        .select('id', { count: 'exact', head: true })
        .eq('artist_id', artistId)
        .eq('is_read', false)
        .eq('is_dismissed', false)
        .gt('expires_at', new Date().toISOString());

      setUnreadCount(insightCount || 0);

      const { count: actionCount } = await supabase
        .from('artist_agent_actions')
        .select('id', { count: 'exact', head: true })
        .eq('artist_id', artistId)
        .eq('status', 'pending');

      setPendingCount(actionCount || 0);
    }
    checkUnread();
  }, [artistId, supabase]);

  const total = unreadCount + pendingCount;
  if (total === 0) return null;

  return (
    <button
      onClick={onNavigate}
      className="w-full mb-6 p-3 rounded-xl border border-crwn-gold/20 bg-crwn-gold/5 flex items-center gap-3 hover:bg-crwn-gold/10 transition-colors text-left"
    >
      <Sparkles className="w-4 h-4 text-crwn-gold shrink-0" />
      <span className="text-sm text-crwn-text">
        {pendingCount > 0 ? (
          <>
            <span className="font-semibold text-crwn-gold">{pendingCount}</span> pending action{pendingCount !== 1 ? 's' : ''} need{pendingCount === 1 ? 's' : ''} your approval
            {unreadCount > 0 && <span className="text-crwn-text-secondary"> + {unreadCount} insight{unreadCount !== 1 ? 's' : ''}</span>}
          </>
        ) : (
          <>
            You have <span className="font-semibold text-crwn-gold">{unreadCount}</span> new insight{unreadCount !== 1 ? 's' : ''} from your AI Manager
          </>
        )}
      </span>
      <ArrowRight className="w-4 h-4 text-crwn-text-secondary ml-auto shrink-0" />
    </button>
  );
}
