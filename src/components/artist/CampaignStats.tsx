'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, Mail, Eye, MousePointer, AlertTriangle, DollarSign, Clock } from 'lucide-react';

interface StatsData {
  total: number;
  sent: number;
  opened: number;
  clicked: number;
  bounced: number;
  failed: number;
  openRate: number;
  clickRate: number;
  clickToOpenRate: number;
  attributedRevenue: number;
  opensByHour: Record<number, number>;
}

interface CampaignData {
  id: string;
  name: string;
  subject: string | null;
  status: string;
  sent_at: string | null;
}

interface CampaignStatsProps {
  campaignId: string;
  onBack: () => void;
}

export function CampaignStats({ campaignId, onBack }: CampaignStatsProps) {
  const [campaign, setCampaign] = useState<CampaignData | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/stats`);
        const json = await res.json();
        setCampaign(json.campaign);
        setStats(json.stats);
      } catch {
        // silent
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [campaignId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-crwn-gold" />
      </div>
    );
  }

  if (!campaign || !stats) {
    return (
      <div className="text-center py-16 text-crwn-text-secondary">
        Campaign not found.
      </div>
    );
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  };

  // Build opens-by-hour chart data
  const maxHourOpens = Math.max(...Object.values(stats.opensByHour), 1);
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg text-crwn-text-secondary hover:text-crwn-text transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-lg font-semibold text-crwn-text">{campaign.name}</h2>
          <p className="text-xs text-crwn-text-secondary">
            {campaign.subject && `Subject: ${campaign.subject} · `}
            Sent {formatDate(campaign.sent_at)}
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Sent', value: stats.sent, icon: <Mail className="w-4 h-4" />, color: 'text-crwn-text' },
          { label: 'Opened', value: stats.opened, sub: `${stats.openRate}%`, icon: <Eye className="w-4 h-4" />, color: 'text-blue-400' },
          { label: 'Clicked', value: stats.clicked, sub: `${stats.clickRate}%`, icon: <MousePointer className="w-4 h-4" />, color: 'text-green-400' },
          { label: 'Click/Open', value: null, sub: `${stats.clickToOpenRate}%`, icon: <MousePointer className="w-4 h-4" />, color: 'text-crwn-gold' },
          { label: 'Bounced', value: stats.bounced, icon: <AlertTriangle className="w-4 h-4" />, color: 'text-red-400' },
          { label: 'Revenue', value: null, sub: `$${(stats.attributedRevenue / 100).toFixed(0)}`, icon: <DollarSign className="w-4 h-4" />, color: 'text-crwn-gold' },
        ].map(card => (
          <div key={card.label} className="bg-crwn-card rounded-xl border border-crwn-elevated p-4">
            <div className={`flex items-center gap-1.5 mb-1 ${card.color}`}>
              {card.icon}
              <span className="text-xs text-crwn-text-secondary">{card.label}</span>
            </div>
            <p className="text-xl font-bold text-crwn-text">
              {card.value != null ? card.value.toLocaleString() : card.sub}
            </p>
            {card.value != null && card.sub && (
              <p className="text-xs text-crwn-text-secondary">{card.sub}</p>
            )}
          </div>
        ))}
      </div>

      {/* Opens by Hour */}
      <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-crwn-text-secondary" />
          <h3 className="text-sm font-medium text-crwn-text">Opens by Hour</h3>
        </div>
        <div className="flex items-end gap-1 h-24">
          {hours.map(hour => {
            const count = stats.opensByHour[hour] || 0;
            const height = maxHourOpens > 0 ? (count / maxHourOpens) * 100 : 0;
            return (
              <div key={hour} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full bg-crwn-gold/60 rounded-t-sm transition-all hover:bg-crwn-gold"
                  style={{ height: `${Math.max(height, 2)}%` }}
                  title={`${hour}:00 — ${count} opens`}
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-crwn-text-secondary">12am</span>
          <span className="text-[10px] text-crwn-text-secondary">6am</span>
          <span className="text-[10px] text-crwn-text-secondary">12pm</span>
          <span className="text-[10px] text-crwn-text-secondary">6pm</span>
          <span className="text-[10px] text-crwn-text-secondary">12am</span>
        </div>
      </div>

      {/* Attribution note */}
      {stats.attributedRevenue > 0 && (
        <div className="bg-crwn-gold/5 border border-crwn-gold/20 rounded-xl p-4">
          <p className="text-sm text-crwn-gold font-medium">
            This campaign drove ${(stats.attributedRevenue / 100).toFixed(2)} in revenue
          </p>
          <p className="text-xs text-crwn-text-secondary mt-1">
            Based on purchases and subscriptions within 48 hours of fans opening this email.
          </p>
        </div>
      )}
    </div>
  );
}
