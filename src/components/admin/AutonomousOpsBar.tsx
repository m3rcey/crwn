'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bot, ChevronDown, ChevronUp, Zap, Shield, AlertTriangle, CheckCircle2, Clock, TrendingUp } from 'lucide-react';

interface RunLogEntry {
  id: string;
  scope: string;
  diagnosis_summary: string;
  severity: 'critical' | 'warning' | 'info';
  actions_recommended: number;
  actions_auto_executed: number;
  actions_escalated: number;
  outcome: string;
  created_at: string;
}

interface AutonomousStats {
  totalRuns: number;
  totalActionsExecuted: number;
  totalEscalated: number;
  lastRunAt: string | null;
  recentRuns: RunLogEntry[];
  weeklyData: { week: string; runs: number; fixes: number }[];
}

const SCOPE_LABELS: Record<string, string> = {
  dashboard: 'Platform Health',
  pipeline: 'Artist Pipeline',
  funnel: 'Acquisition Funnel',
  sequences: 'Automations',
  email: 'Email Health',
  partners: 'Partners',
  crm: 'CRM',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#E53935',
  warning: '#D4AF37',
  info: '#3B82F6',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Tiny sparkline using SVG
function Sparkline({ data, color = '#D4AF37', height = 24, width = 80 }: { data: number[]; color?: string; height?: number; width?: number }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = width / (data.length - 1 || 1);
  const points = data.map((v, i) => `${i * step},${height - ((v - min) / range) * (height - 4) - 2}`).join(' ');
  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export default function AutonomousOpsBar({ userId }: { userId: string }) {
  const [stats, setStats] = useState<AutonomousStats | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/agent/autonomous-stats?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      // Silent fail — banner just doesn't show
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading || !stats || stats.totalRuns === 0) return null;

  const fixTrend = stats.weeklyData.map(w => w.fixes);

  return (
    <div className="mb-6 animate-[fadeInUp_0.3s_ease-out]">
      {/* ── Banner ── */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full bg-[#1A1A1A] border border-[#2a2a2a] rounded-xl p-4 hover:border-[#3a3a3a] transition-all group"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Pulsing indicator */}
            <div className="relative">
              <Bot className="w-5 h-5 text-crwn-gold" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full">
                <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-75" />
              </span>
            </div>

            <div className="flex items-center gap-4 text-sm">
              <span className="text-white font-medium">Autonomous Agent</span>
              <span className="text-[#999]">
                <span className="text-crwn-gold font-semibold">{stats.totalRuns}</span> analyses
              </span>
              <span className="text-[#666]">·</span>
              <span className="text-[#999]">
                <span className="text-green-400 font-semibold">{stats.totalActionsExecuted}</span> optimizations applied
              </span>
              {stats.lastRunAt && (
                <>
                  <span className="text-[#666]">·</span>
                  <span className="text-[#666] text-xs flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Last run {timeAgo(stats.lastRunAt)}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Sparkline showing optimization trend */}
            {fixTrend.length > 1 && (
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3 text-green-400" />
                <Sparkline data={fixTrend} color="#10B981" />
              </div>
            )}

            {expanded ? (
              <ChevronUp className="w-4 h-4 text-[#666] group-hover:text-white transition" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[#666] group-hover:text-white transition" />
            )}
          </div>
        </div>
      </button>

      {/* ── Expanded Run Log ── */}
      {expanded && (
        <div className="mt-2 bg-[#141414] border border-[#2a2a2a] rounded-xl overflow-hidden animate-[fadeInUp_0.2s_ease-out]">
          {/* Header */}
          <div className="px-4 py-3 border-b border-[#2a2a2a] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-crwn-gold" />
              <span className="text-sm font-medium text-white">Autonomous Run History</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-[#666]">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-green-400" />
                {stats.totalActionsExecuted} auto-executed
              </span>
              <span className="flex items-center gap-1">
                <Shield className="w-3 h-3 text-[#D4AF37]" />
                {stats.totalEscalated} escalated
              </span>
            </div>
          </div>

          {/* Run entries */}
          <div className="max-h-[320px] overflow-y-auto">
            {stats.recentRuns.map((run) => (
              <div
                key={run.id}
                className="px-4 py-3 border-b border-[#1e1e1e] hover:bg-[#1A1A1A] transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {/* Severity dot */}
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: SEVERITY_COLORS[run.severity] || '#3B82F6' }}
                      />
                      <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-[#2a2a2a] text-[#999]">
                        {SCOPE_LABELS[run.scope] || run.scope}
                      </span>
                      <span className="text-[#666] text-xs">
                        {new Date(run.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {' · '}
                        {new Date(run.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm text-[#ccc] truncate">{run.diagnosis_summary}</p>
                    {run.outcome && run.actions_auto_executed > 0 && (
                      <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        {run.outcome}
                      </p>
                    )}
                    {run.actions_escalated > 0 && (
                      <p className="text-xs text-[#D4AF37] mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {run.actions_escalated} action{run.actions_escalated > 1 ? 's' : ''} escalated for review
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    {run.actions_auto_executed > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
                        <Zap className="w-3 h-3" />
                        {run.actions_auto_executed} fixed
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-[#2a2a2a] bg-[#111]">
            <p className="text-xs text-[#555] text-center">
              Autonomous agent runs daily · Low-risk actions auto-executed · Medium/high risk escalated for review
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
