'use client';

import { useState } from 'react';
import { Sparkles, AlertTriangle, AlertCircle, Info, Loader2 } from 'lucide-react';

interface Insight {
  priority: 'critical' | 'warning' | 'info';
  category: string;
  title: string;
  body: string;
  metric: string;
}

interface AgentInsightsProps {
  userId: string;
}

const PRIORITY_CONFIG = {
  critical: { color: '#E53935', bg: 'rgba(229, 57, 53, 0.1)', border: '#E53935', icon: AlertTriangle, label: 'CRITICAL' },
  warning: { color: '#D4AF37', bg: 'rgba(212, 175, 55, 0.1)', border: '#D4AF37', icon: AlertCircle, label: 'WARNING' },
  info: { color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.1)', border: '#3B82F6', icon: Info, label: 'INFO' },
};

const CATEGORY_COLORS: Record<string, string> = {
  revenue: '#D4AF37',
  retention: '#10B981',
  acquisition: '#3B82F6',
  health: '#E53935',
  growth: '#8B5CF6',
};

export default function AgentInsights({ userId }: AgentInsightsProps) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyze = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/agent/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Analysis failed');
      }

      const data = await res.json();
      setInsights(data.insights || []);
      setAnalyzedAt(new Date(data.analyzedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const criticals = insights.filter(i => i.priority === 'critical');
  const warnings = insights.filter(i => i.priority === 'warning');
  const infos = insights.filter(i => i.priority === 'info');

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-crwn-gold" />
          <h2 className="text-lg font-semibold text-white">Agent Analysis</h2>
          {analyzedAt && (
            <span className="text-[#555] text-xs">analyzed at {analyzedAt}</span>
          )}
        </div>

        <button
          onClick={analyze}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-crwn-gold text-black text-sm font-medium hover:brightness-110 transition disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Analyze
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {insights.length > 0 && (
        <div className="space-y-3 animate-[fadeInUp_0.3s_ease-out]">
          {[...criticals, ...warnings, ...infos].map((insight, i) => {
            const config = PRIORITY_CONFIG[insight.priority];
            const Icon = config.icon;
            const catColor = CATEGORY_COLORS[insight.category] || '#666';

            return (
              <div
                key={i}
                className="rounded-xl border p-4 transition-all hover:brightness-110"
                style={{
                  backgroundColor: config.bg,
                  borderColor: `${config.border}33`,
                  borderLeftWidth: '3px',
                  borderLeftColor: config.border,
                }}
              >
                <div className="flex items-start gap-3">
                  <Icon className="w-5 h-5 mt-0.5 shrink-0" style={{ color: config.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ color: config.color, backgroundColor: `${config.color}20` }}
                      >
                        {config.label}
                      </span>
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                        style={{ color: catColor, backgroundColor: `${catColor}20` }}
                      >
                        {insight.category}
                      </span>
                      <span className="text-[#555] text-[10px]">{insight.metric}</span>
                    </div>
                    <p className="text-white text-sm font-medium mb-1">{insight.title}</p>
                    <p className="text-[#999] text-sm leading-relaxed">{insight.body}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && insights.length === 0 && !error && (
        <div className="bg-[#1A1A1A] rounded-xl border border-[#2a2a2a] p-8 text-center">
          <Sparkles className="w-8 h-8 text-[#333] mx-auto mb-3" />
          <p className="text-[#555] text-sm">Click Analyze to get AI-powered insights on your metrics</p>
          <p className="text-[#444] text-xs mt-1">Uses Kimi K2.5 to evaluate your dashboard against Hormozi&apos;s playbook</p>
        </div>
      )}
    </div>
  );
}
