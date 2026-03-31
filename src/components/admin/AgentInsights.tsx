'use client';

import { useState, useEffect, useRef } from 'react';
import { Sparkles, AlertTriangle, AlertCircle, Info, Loader2, Play, X, CheckCircle2, ShieldAlert, Shield, ShieldCheck, ArrowRight, CircleDot } from 'lucide-react';

interface Diagnosis {
  bottleneck: string;
  dropoff_rate: string;
  why: string;
  impact_chain: string[];
  severity: 'critical' | 'warning' | 'info';
}

interface SupportingSignal {
  signal: string;
  detail: string;
  sentiment: 'bad' | 'okay' | 'good';
}

interface AgentAction {
  type: string;
  label: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
  params: Record<string, unknown>;
}

type ActionStatus = 'pending' | 'executing' | 'done' | 'failed' | 'dismissed';

export type AgentScope = 'dashboard' | 'pipeline' | 'partners' | 'funnel' | 'sequences' | 'email' | 'crm';

interface AgentInsightsProps {
  userId: string;
  scope?: AgentScope;
}

const SCOPE_LABELS: Record<AgentScope, { title: string; button: string; empty: string; subtitle: string }> = {
  dashboard: { title: 'Agent Diagnosis', button: 'Diagnose', empty: 'Click Diagnose to find your biggest funnel bottleneck', subtitle: 'Traces cause → effect chain and suggests actions to fix it' },
  pipeline: { title: 'Pipeline Agent', button: 'Analyze Pipeline', empty: 'Click to analyze which artists are stuck and why', subtitle: 'Identifies stalled artists and recommends actions' },
  partners: { title: 'Partners Agent', button: 'Analyze Partners', empty: 'Click to evaluate partner/recruiter performance', subtitle: 'Finds underperforming partners and ROI problems' },
  funnel: { title: 'Funnel Agent', button: 'Analyze Funnel', empty: 'Click to find where the funnel is leaking', subtitle: 'Compares sources, finds bottlenecks, suggests fixes' },
  sequences: { title: 'Sequences Agent', button: 'Analyze Sequences', empty: 'Click to evaluate automation performance', subtitle: 'Finds dead sequences and enrollment gaps' },
  email: { title: 'Email Health Agent', button: 'Analyze Email', empty: 'Click to check email infrastructure health', subtitle: 'Monitors deliverability, bounces, and spam risk' },
  crm: { title: 'CRM Agent', button: 'Analyze Contacts', empty: 'Click to find which contacts need outreach', subtitle: 'Identifies stale leads, list conversion rates, and outreach priorities' },
};

const SEVERITY_CONFIG = {
  critical: { color: '#E53935', bg: 'rgba(229, 57, 53, 0.08)', border: '#E53935', icon: AlertTriangle, label: 'CRITICAL' },
  warning: { color: '#D4AF37', bg: 'rgba(212, 175, 55, 0.08)', border: '#D4AF37', icon: AlertCircle, label: 'WARNING' },
  info: { color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.08)', border: '#3B82F6', icon: Info, label: 'INFO' },
};

const SENTIMENT_CONFIG = {
  bad: { color: '#E53935', dot: '#E53935' },
  okay: { color: '#D4AF37', dot: '#D4AF37' },
  good: { color: '#10B981', dot: '#10B981' },
};

const RISK_CONFIG = {
  low: { color: '#10B981', icon: ShieldCheck, label: 'LOW RISK' },
  medium: { color: '#D4AF37', icon: Shield, label: 'MEDIUM RISK' },
  high: { color: '#E53935', icon: ShieldAlert, label: 'HIGH RISK' },
};

export default function AgentInsights({ userId, scope = 'dashboard' }: AgentInsightsProps) {
  const labels = SCOPE_LABELS[scope];
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [signals, setSignals] = useState<SupportingSignal[]>([]);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [actionStatuses, setActionStatuses] = useState<Record<number, ActionStatus>>({});
  const [actionMessages, setActionMessages] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Simulated progress bar: fills 0→90% over ~15 seconds with easing
  useEffect(() => {
    if (loading) {
      setProgress(0);
      const startTime = Date.now();
      progressRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        // Ease out: fast start, slows as it approaches 90%
        const pct = Math.min(90, 90 * (1 - Math.exp(-elapsed / 5)));
        setProgress(Math.round(pct));
      }, 200);
    } else {
      if (progressRef.current) {
        clearInterval(progressRef.current);
        progressRef.current = null;
      }
      if (progress > 0) {
        setProgress(100);
        const t = setTimeout(() => setProgress(0), 600);
        return () => clearTimeout(t);
      }
    }
    return () => {
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [loading]);

  const analyze = async () => {
    setLoading(true);
    setError(null);
    setDiagnosis(null);
    setSignals([]);
    setActions([]);
    setActionStatuses({});
    setActionMessages({});

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      const res = await fetch('/api/admin/agent/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, scope }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(data.error || `Analysis failed (${res.status})`);
      }

      const data = await res.json();
      setDiagnosis(data.diagnosis || null);
      setSignals(data.supportingSignals || []);
      setActions(data.actions || []);
      setAnalyzedAt(new Date(data.analyzedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Analysis timed out (60s). Check that MOONSHOT_API_KEY is set in Vercel.');
      } else {
        setError(err instanceof Error ? err.message : 'Analysis failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const executeAction = async (index: number, action: AgentAction) => {
    setActionStatuses(prev => ({ ...prev, [index]: 'executing' }));

    try {
      const res = await fetch('/api/admin/agent/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action }),
      });

      const data = await res.json();

      if (data.success) {
        setActionStatuses(prev => ({ ...prev, [index]: 'done' }));
        setActionMessages(prev => ({ ...prev, [index]: data.message }));
      } else {
        setActionStatuses(prev => ({ ...prev, [index]: 'failed' }));
        setActionMessages(prev => ({ ...prev, [index]: data.message || 'Execution failed' }));
      }
    } catch {
      setActionStatuses(prev => ({ ...prev, [index]: 'failed' }));
      setActionMessages(prev => ({ ...prev, [index]: 'Network error' }));
    }
  };

  const dismissAction = (index: number) => {
    setActionStatuses(prev => ({ ...prev, [index]: 'dismissed' }));
  };

  const visibleActions = actions.filter((_, i) => actionStatuses[i] !== 'dismissed');

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-crwn-gold" />
          <h2 className="text-lg font-semibold text-white">{labels.title}</h2>
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
              {labels.button}
            </>
          )}
        </button>
      </div>

      {loading && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-[#888]">
              {progress < 30 ? 'Collecting platform data...' : progress < 60 ? 'Analyzing metrics...' : progress < 85 ? 'Generating diagnosis...' : 'Finalizing...'}
            </span>
            <span className="text-xs text-[#888]">{progress}%</span>
          </div>
          <div className="w-full h-1.5 bg-[#2A2A2A] rounded-full overflow-hidden">
            <div
              className="h-full bg-crwn-gold rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Diagnosis Card */}
      {diagnosis && (
        <div className="animate-[fadeInUp_0.3s_ease-out] space-y-4">
          {(() => {
            const config = SEVERITY_CONFIG[diagnosis.severity];
            const Icon = config.icon;
            return (
              <div
                className="rounded-xl border p-5"
                style={{
                  backgroundColor: config.bg,
                  borderColor: `${config.border}33`,
                  borderLeftWidth: '4px',
                  borderLeftColor: config.border,
                }}
              >
                {/* Header */}
                <div className="flex items-start gap-3 mb-3">
                  <Icon className="w-5 h-5 mt-0.5 shrink-0" style={{ color: config.color }} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ color: config.color, backgroundColor: `${config.color}20` }}
                      >
                        {config.label}
                      </span>
                      <span className="text-[#999] text-xs">Biggest bottleneck</span>
                    </div>
                    <p className="text-white text-base font-semibold">{diagnosis.bottleneck}</p>
                    <p className="text-[#D4AF37] text-sm font-medium mt-0.5">{diagnosis.dropoff_rate} conversion</p>
                  </div>
                </div>

                {/* Why */}
                <p className="text-[#ccc] text-sm leading-relaxed mb-4">{diagnosis.why}</p>

                {/* Impact Chain */}
                {diagnosis.impact_chain.length > 0 && (
                  <div className="bg-black/20 rounded-lg p-3">
                    <p className="text-[#666] text-[10px] font-bold uppercase tracking-wider mb-2">Impact Chain</p>
                    <div className="space-y-1.5">
                      {diagnosis.impact_chain.map((step, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <ArrowRight className="w-3 h-3 mt-1 shrink-0" style={{ color: config.color, opacity: 0.6 }} />
                          <p className="text-[#bbb] text-sm">{step}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Supporting Signals */}
          {signals.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {signals.map((signal, i) => {
                const sentConfig = SENTIMENT_CONFIG[signal.sentiment];
                return (
                  <div
                    key={i}
                    className="bg-[#1A1A1A] rounded-lg border border-[#2a2a2a] p-3"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <CircleDot className="w-3 h-3 shrink-0" style={{ color: sentConfig.dot }} />
                      <span className="text-white text-xs font-medium truncate">{signal.signal}</span>
                    </div>
                    <p className="text-[#999] text-xs leading-relaxed">{signal.detail}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Actions */}
          {visibleActions.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-[#999] uppercase tracking-wider mb-3">Recommended Actions</h3>
              <div className="space-y-2">
                {actions.map((action, i) => {
                  const status = actionStatuses[i] || 'pending';
                  if (status === 'dismissed') return null;

                  const riskConfig = RISK_CONFIG[action.risk];
                  const RiskIcon = riskConfig.icon;

                  return (
                    <div
                      key={i}
                      className="rounded-xl border border-[#2a2a2a] bg-[#1A1A1A] p-4 transition-all"
                      style={{
                        borderLeftWidth: '3px',
                        borderLeftColor: riskConfig.color,
                        opacity: status === 'done' ? 0.7 : 1,
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <RiskIcon className="w-5 h-5 mt-0.5 shrink-0" style={{ color: riskConfig.color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                              style={{ color: riskConfig.color, backgroundColor: `${riskConfig.color}20` }}
                            >
                              {riskConfig.label}
                            </span>
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded text-[#666] bg-[#ffffff08]">
                              {action.type.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <p className="text-white text-sm font-medium mb-1">{action.label}</p>
                          <p className="text-[#999] text-sm leading-relaxed">{action.description}</p>

                          {actionMessages[i] && (
                            <p className={`text-xs mt-2 ${status === 'done' ? 'text-emerald-400' : 'text-red-400'}`}>
                              {actionMessages[i]}
                            </p>
                          )}

                          <div className="flex items-center gap-2 mt-3">
                            {status === 'pending' && (
                              <>
                                <button
                                  onClick={() => executeAction(i, action)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-crwn-gold text-black text-xs font-medium hover:brightness-110 transition"
                                >
                                  <Play className="w-3 h-3" />
                                  Approve
                                </button>
                                <button
                                  onClick={() => dismissAction(i)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#2a2a2a] text-[#999] text-xs font-medium hover:text-white transition"
                                >
                                  <X className="w-3 h-3" />
                                  Dismiss
                                </button>
                              </>
                            )}
                            {status === 'executing' && (
                              <div className="flex items-center gap-1.5 text-crwn-gold text-xs">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Executing...
                              </div>
                            )}
                            {status === 'done' && (
                              <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
                                <CheckCircle2 className="w-3 h-3" />
                                Executed
                              </div>
                            )}
                            {status === 'failed' && (
                              <>
                                <div className="flex items-center gap-1.5 text-red-400 text-xs">
                                  <AlertTriangle className="w-3 h-3" />
                                  Failed
                                </div>
                                <button
                                  onClick={() => executeAction(i, action)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#2a2a2a] text-[#999] text-xs font-medium hover:text-white transition"
                                >
                                  Retry
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && !diagnosis && !error && (
        <div className="bg-[#1A1A1A] rounded-xl border border-[#2a2a2a] p-8 text-center">
          <Sparkles className="w-8 h-8 text-[#333] mx-auto mb-3" />
          <p className="text-[#555] text-sm">{labels.empty}</p>
          <p className="text-[#444] text-xs mt-1">{labels.subtitle}</p>
        </div>
      )}
    </div>
  );
}
