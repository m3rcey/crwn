'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Mail, AlertTriangle, ShieldX, TrendingDown, RefreshCw,
  CheckCircle, XCircle, Eye, MousePointerClick, Info,
} from 'lucide-react';

interface SuppressionRecord {
  id: string;
  email: string;
  reason: string;
  bounce_message: string | null;
  source: string | null;
  created_at: string;
}

interface UnsubscribeEvent {
  id: string;
  fan_id: string;
  artist_id: string | null;
  source_type: string;
  source_id: string | null;
  scope: string;
  created_at: string;
}

interface EmailHealthData {
  suppressions: {
    list: SuppressionRecord[];
    total: number;
    hardBounces: number;
    spamComplaints: number;
    last7d: number;
    last30d: number;
  };
  campaigns: {
    total: number;
    sent: number;
    opened: number;
    clicked: number;
    bounced: number;
    failed: number;
  };
  sequences: {
    total: number;
    sent: number;
    opened: number;
    clicked: number;
    bounced: number;
  };
  unsubscribes: {
    recent: UnsubscribeEvent[];
    total: number;
    last30d: number;
    global: number;
  };
  conversions: Record<string, { total: number; converted: number }>;
  deliverabilityRate: number;
}

const TRIGGER_LABELS: Record<string, string> = {
  new_subscription: 'Welcome Sequence',
  new_purchase: 'Post-Purchase',
  tier_upgrade: 'Tier Upgrade',
  win_back: 'Win-Back',
  starter_upgrade_nudge: 'Starter Upgrade Nudge',
  post_purchase_upsell: 'Post-Purchase Upsell',
  onboarding_incomplete: 'Onboarding Incomplete',
  paid_at_risk: 'Paid At Risk',
  paid_churned: 'Paid Churned',
  loyalty_survey: 'Loyalty Survey',
};

interface EmailHealthProps {
  userId: string;
}

export default function EmailHealth({ userId }: EmailHealthProps) {
  const [data, setData] = useState<EmailHealthData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/email-health?userId=${userId}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch email health:', err);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 text-crwn-gold animate-spin" />
      </div>
    );
  }

  const campaignOpenRate = data.campaigns.sent > 0
    ? Math.round((data.campaigns.opened / data.campaigns.sent) * 100) : 0;
  const campaignClickRate = data.campaigns.sent > 0
    ? Math.round((data.campaigns.clicked / data.campaigns.sent) * 100) : 0;
  const seqOpenRate = data.sequences.sent > 0
    ? Math.round((data.sequences.opened / data.sequences.sent) * 100) : 0;
  const seqClickRate = data.sequences.sent > 0
    ? Math.round((data.sequences.clicked / data.sequences.sent) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-crwn-text">Email Health</h2>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-crwn-card text-crwn-text-secondary text-sm hover:text-crwn-text transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Top-level health metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Deliverability"
          value={`${data.deliverabilityRate}%`}
          icon={<Mail className="w-5 h-5" />}
          color={data.deliverabilityRate >= 95 ? 'green' : data.deliverabilityRate >= 90 ? 'yellow' : 'red'}
          tooltip="(Total sent - bounced) / total sent. Above 95% is healthy. Below 90% means your sender reputation is at risk."
        />
        <MetricCard
          label="Suppressions"
          value={String(data.suppressions.total)}
          icon={<ShieldX className="w-5 h-5" />}
          color="neutral"
          sub={`+${data.suppressions.last7d} this week`}
          tooltip="Emails permanently blocked from receiving mail (hard bounces + spam complaints). These protect your sender reputation."
        />
        <MetricCard
          label="Unsubscribes (30d)"
          value={String(data.unsubscribes.last30d)}
          icon={<TrendingDown className="w-5 h-5" />}
          color={data.unsubscribes.last30d > 20 ? 'red' : 'neutral'}
          sub={`${data.unsubscribes.global} global`}
          tooltip="Fans who opted out in the last 30 days. Global = opted out of ALL artists. High global unsubs mean your email frequency or content needs work."
        />
        <MetricCard
          label="Spam Complaints"
          value={String(data.suppressions.spamComplaints)}
          icon={<AlertTriangle className="w-5 h-5" />}
          color={data.suppressions.spamComplaints > 5 ? 'red' : 'neutral'}
          tooltip="Fans who marked your email as spam. Even a few can damage your domain reputation. Target: 0. Each one is a red flag."
        />
      </div>

      {/* Aggregate Performance: Campaigns vs Sequences side-by-side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-crwn-card rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-crwn-text-secondary uppercase tracking-wider mb-4">
            Campaign Performance (All Time)
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <StatRow icon={<Mail className="w-4 h-4 text-crwn-text-secondary" />} label="Total Sent" value={data.campaigns.sent} />
            <StatRow icon={<Eye className="w-4 h-4 text-blue-400" />} label="Open Rate" value={`${campaignOpenRate}%`} />
            <StatRow icon={<MousePointerClick className="w-4 h-4 text-crwn-gold" />} label="Click Rate" value={`${campaignClickRate}%`} />
            <StatRow icon={<XCircle className="w-4 h-4 text-red-400" />} label="Bounced" value={data.campaigns.bounced} />
          </div>
        </div>

        <div className="bg-crwn-card rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-crwn-text-secondary uppercase tracking-wider mb-4">
            Sequence Performance (All Time)
          </h3>
          {data.sequences.total > 0 ? (
            <div className="grid grid-cols-2 gap-4">
              <StatRow icon={<Mail className="w-4 h-4 text-crwn-text-secondary" />} label="Total Sent" value={data.sequences.sent} />
              <StatRow icon={<Eye className="w-4 h-4 text-blue-400" />} label="Open Rate" value={`${seqOpenRate}%`} />
              <StatRow icon={<MousePointerClick className="w-4 h-4 text-crwn-gold" />} label="Click Rate" value={`${seqClickRate}%`} />
              <StatRow icon={<XCircle className="w-4 h-4 text-red-400" />} label="Bounced" value={data.sequences.bounced} />
            </div>
          ) : (
            <p className="text-crwn-text-secondary text-sm">No sequence sends tracked yet. Data will appear after the migration is applied.</p>
          )}
        </div>
      </div>

      {/* Sequence Conversion Rates */}
      {Object.keys(data.conversions).length > 0 && (
        <div className="bg-crwn-card rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-crwn-text-secondary uppercase tracking-wider mb-4">
            Sequence Conversion Rates
          </h3>
          <div className="space-y-3">
            {Object.entries(data.conversions).map(([triggerType, stats]) => {
              const rate = stats.total > 0 ? Math.round((stats.converted / stats.total) * 100) : 0;
              return (
                <div key={triggerType} className="flex items-center justify-between py-2 border-b border-crwn-elevated last:border-0">
                  <span className="text-sm text-crwn-text">
                    {TRIGGER_LABELS[triggerType] || triggerType}
                  </span>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-crwn-text-secondary">
                      {stats.converted}/{stats.total} completed
                    </span>
                    <span className={`text-sm font-semibold ${rate >= 20 ? 'text-green-400' : rate >= 10 ? 'text-crwn-gold' : 'text-red-400'}`}>
                      {rate}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Suppression List */}
      <div className="bg-crwn-card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-crwn-text-secondary uppercase tracking-wider">
            Suppression List ({data.suppressions.total})
          </h3>
          <div className="flex items-center gap-3 text-xs text-crwn-text-secondary">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-400" /> Hard Bounce: {data.suppressions.hardBounces}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-orange-400" /> Spam: {data.suppressions.spamComplaints}
            </span>
          </div>
        </div>

        {data.suppressions.list.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-crwn-text-secondary text-left border-b border-crwn-elevated">
                  <th className="pb-2 font-medium">Email</th>
                  <th className="pb-2 font-medium">Reason</th>
                  <th className="pb-2 font-medium">Source</th>
                  <th className="pb-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.suppressions.list.map(s => (
                  <tr key={s.id} className="border-b border-crwn-elevated/50 last:border-0">
                    <td className="py-2 text-crwn-text font-mono text-xs">{s.email}</td>
                    <td className="py-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                        s.reason === 'hard_bounce' ? 'bg-red-400/10 text-red-400' : 'bg-orange-400/10 text-orange-400'
                      }`}>
                        {s.reason === 'hard_bounce' ? 'Bounce' : 'Spam'}
                      </span>
                    </td>
                    <td className="py-2 text-crwn-text-secondary text-xs">{s.source || 'unknown'}</td>
                    <td className="py-2 text-crwn-text-secondary text-xs">
                      {new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-crwn-text-secondary text-sm flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-400" />
            Clean list. No suppressions.
          </p>
        )}
      </div>

      {/* Recent Unsubscribes */}
      <div className="bg-crwn-card rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-crwn-text-secondary uppercase tracking-wider mb-4">
          Recent Unsubscribes ({data.unsubscribes.total} total)
        </h3>

        {data.unsubscribes.recent.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-crwn-text-secondary text-left border-b border-crwn-elevated">
                  <th className="pb-2 font-medium">Source</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Scope</th>
                  <th className="pb-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.unsubscribes.recent.map(u => (
                  <tr key={u.id} className="border-b border-crwn-elevated/50 last:border-0">
                    <td className="py-2 text-crwn-text text-xs">{u.source_type}</td>
                    <td className="py-2 text-crwn-text-secondary text-xs font-mono">
                      {u.source_id ? u.source_id.slice(0, 8) : 'n/a'}
                    </td>
                    <td className="py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${
                        u.scope === 'global' ? 'bg-red-400/10 text-red-400' : 'bg-crwn-elevated text-crwn-text-secondary'
                      }`}>
                        {u.scope}
                      </span>
                    </td>
                    <td className="py-2 text-crwn-text-secondary text-xs">
                      {new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-crwn-text-secondary text-sm">No unsubscribe events recorded yet.</p>
        )}
      </div>
    </div>
  );
}

// Helper components
function MetricCard({ label, value, icon, color, sub, tooltip }: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: 'green' | 'yellow' | 'red' | 'neutral';
  sub?: string;
  tooltip?: string;
}) {
  const [showTip, setShowTip] = useState(false);
  const colorMap = {
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400',
    neutral: 'text-crwn-text',
  };

  return (
    <div className="bg-crwn-card rounded-2xl p-4 relative">
      <div className="flex items-center justify-between mb-2">
        <span className="text-crwn-text-secondary">{icon}</span>
        {tooltip && (
          <button
            onClick={() => setShowTip(!showTip)}
            className="text-crwn-text-secondary hover:text-crwn-text"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <p className={`text-2xl font-bold ${colorMap[color]}`}>{value}</p>
      <p className="text-xs text-crwn-text-secondary mt-1">{label}</p>
      {sub && <p className="text-xs text-crwn-text-secondary mt-0.5">{sub}</p>}
      {showTip && tooltip && (
        <div className="absolute top-full left-0 right-0 mt-1 z-10 bg-crwn-elevated border border-crwn-card rounded-lg p-3 text-xs text-crwn-text-secondary shadow-lg">
          {tooltip}
        </div>
      )}
    </div>
  );
}

function StatRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <div>
        <p className="text-xs text-crwn-text-secondary">{label}</p>
        <p className="text-sm font-semibold text-crwn-text">{value}</p>
      </div>
    </div>
  );
}
