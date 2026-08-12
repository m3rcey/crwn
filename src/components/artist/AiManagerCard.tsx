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
import Link from 'next/link';
import { FadeIn } from '@/components/ui/FadeIn';
import type { ConstraintResult } from '@/lib/constraint/types';
import { resolveOperatingFlow } from '@/lib/constraint/presentation';
import { staleBefore } from '@/lib/ai/actionValidity';

const TYPE_CONFIG: Record<AiInsightType, { icon: React.ElementType; label: string }> = {
  revenue: { icon: TrendingUp, label: 'Revenue' },
  churn: { icon: UserMinus, label: 'Churn Alert' },
  vip_fan: { icon: Star, label: 'VIP Fan' },
  booking_reminder: { icon: Calendar, label: 'Reminder' },
  content_nudge: { icon: Pen, label: 'Content' },
  weekly_digest: { icon: FileText, label: 'Digest' },
  sync_match: { icon: Music, label: 'Sync Opportunity' },
  fulfillment: { icon: Calendar, label: 'Promise' },
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
  // No outcome_delta / outcome_measured_at. The columns still exist on the row (dropping them
  // would need a migration for no safety benefit) but nothing writes them since the Manager
  // outcome loop was retired, and nothing here reads them.
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
}

/**
 * The canonical priority, rendered ABOVE everything Manager has to say.
 *
 * Manager is a READER of this, never its owner. That is why this banner carries no gold primary
 * button: the one "Do it now" lives on Rise Mode, where the Constraint Engine owns it, and a
 * second copy here would be the same coordination problem the One Operating Flow removed. The
 * link sends the artist back to that flow instead.
 *
 * Renders NOTHING when the engine declined to diagnose and nothing is blocking launch. Silence is
 * a real answer, and manufacturing a priority so this box has something confident to say is
 * precisely what a reader may not do.
 */
function CanonicalPriorityBanner({ result }: { result: ConstraintResult | null }) {
  const flow = resolveOperatingFlow(result);

  if (flow.phase === 'priority' && flow.constraint) {
    return (
      <div className="mb-6 p-4 rounded-xl border border-crwn-gold/40 bg-crwn-gold/5">
        <p className="text-[10px] font-medium uppercase tracking-wider text-crwn-text-secondary/60">
          CRWN&apos;s priority right now
        </p>
        <h3 className="text-sm font-semibold text-crwn-text mt-1">{flow.constraint.title}</h3>
        <p className="text-xs text-crwn-text-secondary mt-1 leading-relaxed">
          Everything below serves this. Your manager helps you work it and can handle some of it
          for you. It does not pick a different priority.
        </p>
        <Link
          prefetch
          href="/profile/artist"
          className="inline-flex items-center gap-1 mt-3 text-xs font-medium text-crwn-gold hover:text-crwn-gold/80 transition-colors"
        >
          Open it in Rise Mode
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    );
  }

  if (flow.phase === 'launch') {
    return (
      <div className="mb-6 p-4 rounded-xl border border-crwn-elevated bg-crwn-elevated/20">
        <p className="text-[10px] font-medium uppercase tracking-wider text-crwn-text-secondary/60">
          Still setting up
        </p>
        <p className="text-xs text-crwn-text-secondary mt-1 leading-relaxed">
          Growth coaching is on hold until a fan can actually pay you. Finish these first:
        </p>
        <ul className="mt-2 space-y-1">
          {flow.launchBlockers.slice(0, 3).map((b) => (
            <li key={b} className="flex items-start gap-2 text-xs text-crwn-text">
              <span className="mt-1.5 w-1 h-1 rounded-full bg-crwn-gold shrink-0" />
              {b}
            </li>
          ))}
        </ul>
        <Link
          prefetch
          href="/profile/artist"
          className="inline-flex items-center gap-1 mt-3 text-xs font-medium text-crwn-gold hover:text-crwn-gold/80 transition-colors"
        >
          Finish setup in Rise Mode
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    );
  }

  return null;
}

export function AiManagerCard({ artistId, platformTier }: AiManagerCardProps) {
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
  const [expiredCount, setExpiredCount] = useState(0);
  const [constraint, setConstraint] = useState<ConstraintResult | null>(null);

  const isStarterOnly = platformTier === 'starter';

  // The SAME route Rise Mode reads, deliberately. It is the single Z3 issuer and its write is
  // idempotent (one open row per artist per constraint), so the diagnosis appearing on a second
  // surface is still exactly one recommendation with one identity. Ownership comes from the
  // session inside that route: it takes no artistId, so this cannot ask about another artist.
  // Fails silently to null, which renders no banner and leaves the page as it was.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/artist/constraint')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled) setConstraint(j?.constraint ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

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

    // Fetch pending actions, EXCLUDING ones that have gone stale.
    //
    // Same cutoff the execution route enforces (`staleBefore`), on purpose. Offering an Approve
    // button the server would refuse is worse than not offering it: the button itself implies
    // CRWN still stands behind the suggestion. Expiry is DERIVED from `created_at`, so no schema
    // and no backfill: a 130-day-old row simply stops being offered the moment this ships.
    const cutoff = staleBefore();
    const { data: pendingData } = await supabase
      .from('artist_agent_actions')
      .select('*')
      .eq('artist_id', artistId)
      .eq('status', 'pending')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(10);

    setPendingActions((pendingData || []) as PendingAction[]);

    // Count the stale ones so their absence can be explained rather than just felt. They stay in
    // the table as history; they are simply no longer actionable.
    const { count: staleCount } = await supabase
      .from('artist_agent_actions')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', artistId)
      .eq('status', 'pending')
      .lt('created_at', cutoff);

    setExpiredCount(staleCount || 0);

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
      // NO Authorization header. This is a client component, so anything it holds is public.
      // It used to send `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET}`, which compiled the
      // cron secret into the browser bundle for every visitor to read. The route now accepts
      // this artist's SESSION COOKIE instead, which the browser sends automatically and which
      // cannot be lifted out of the page source.
      await fetch('/api/ai-manager/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
              <h2 className="text-xl font-bold text-crwn-text">Manager</h2>
              <p className="text-sm text-crwn-text-secondary">
                Works the priority CRWN set with you, and can handle some of it for you
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

        {/* The canonical priority leads. Nothing Manager says outranks it. */}
        <CanonicalPriorityBanner result={constraint} />

        {/* Starter Tier Upsell */}
        {isStarterOnly && (
          <div className="mb-6 p-4 rounded-xl border border-crwn-gold/20 bg-crwn-gold/5">
            <div className="flex items-start gap-3">
              <Crown className="w-5 h-5 text-crwn-gold mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-crwn-text">
                  Upgrade to Pro for deeper insights and autonomous actions
                </p>
                <p className="text-xs text-crwn-text-secondary mt-1">
                  Get churn prevention, VIP fan detection, auto re-engagement emails, smart pricing suggestions, and more, all tailored to your data.
                </p>
                <button
                  onClick={() => router.push('/account/billing')}
                  className="mt-3 inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-crwn-gold text-black rounded-full hover:bg-crwn-gold/90 transition-colors"
                >
                  Upgrade to Pro
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Suggestions that aged out. Shown as a quiet fact, not a task: the artist should know
            why an Approve button they may remember is gone, without being asked to do anything
            about it. The rows are untouched and still count as history. */}
        {expiredCount > 0 && (
          <div className="mb-6 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-crwn-elevated/30">
            <Clock className="w-3.5 h-3.5 text-crwn-text-secondary/50 mt-0.5 shrink-0" />
            <p className="text-xs text-crwn-text-secondary">
              {expiredCount} older suggestion{expiredCount === 1 ? '' : 's'} expired. They were
              based on numbers that have since moved, so your manager no longer offers them. Hit
              Refresh for a current read.
            </p>
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

                // This row deliberately shows WHAT MANAGER DID, never what it CAUSED.
                //
                // It used to render "Worked" / "No lift" and a dollar MRR movement beside each
                // action, from a delta that self-derived MRR, could not tell missing from zero,
                // covered a window of unrecorded length, and attributed one artist-wide movement
                // to every action at once. That verdict was removed first; the measurement that
                // produced it was RETIRED outright on 2026-08-11, so `outcome_delta` is no longer
                // written and there is nothing left to render even if someone wanted to.
                //
                // Manager keeps action TELEMETRY, which is what this list is: what was done, when,
                // and whether the handler succeeded. Recommendation-to-outcome evidence is Z3's
                // job and stays there.
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
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
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
              No insights yet. Your manager checks in daily with recommendations and actions.
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

      // SAME cutoff as the Manager page and the execution route. A teaser that counts three
      // pending actions while the page offers none, because the page filters stale ones and this
      // did not, is how a safety fix turns into a bug report.
      const { count: actionCount } = await supabase
        .from('artist_agent_actions')
        .select('id', { count: 'exact', head: true })
        .eq('artist_id', artistId)
        .eq('status', 'pending')
        .gte('created_at', staleBefore());

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
            You have <span className="font-semibold text-crwn-gold">{unreadCount}</span> new insight{unreadCount !== 1 ? 's' : ''} from your manager
          </>
        )}
      </span>
      <ArrowRight className="w-4 h-4 text-crwn-text-secondary ml-auto shrink-0" />
    </button>
  );
}
