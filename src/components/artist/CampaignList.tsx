'use client';

import { useState, useEffect } from 'react';
import { Plus, Mail, Clock, CheckCircle, AlertCircle, Loader2, BarChart3, Edit3 } from 'lucide-react';

interface Campaign {
  id: string;
  name: string;
  subject: string | null;
  status: string;
  sent_at: string | null;
  stats: Record<string, number>;
  created_at: string;
}

interface CampaignListProps {
  artistId: string;
  onNewCampaign: () => void;
  onEditCampaign: (id: string) => void;
  onViewStats: (id: string) => void;
}

export function CampaignList({ artistId, onNewCampaign, onEditCampaign, onViewStats }: CampaignListProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/campaigns?artistId=${artistId}`);
        const json = await res.json();
        setCampaigns(json.campaigns || []);
      } catch {
        // silent
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [artistId]);

  const statusConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
    draft: { icon: <Edit3 className="w-3.5 h-3.5" />, label: 'Draft', color: 'text-crwn-text-secondary' },
    scheduled: { icon: <Clock className="w-3.5 h-3.5" />, label: 'Scheduled', color: 'text-blue-400' },
    sending: { icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, label: 'Sending', color: 'text-yellow-400' },
    sent: { icon: <CheckCircle className="w-3.5 h-3.5" />, label: 'Sent', color: 'text-green-400' },
    failed: { icon: <AlertCircle className="w-3.5 h-3.5" />, label: 'Failed', color: 'text-red-400' },
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-crwn-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-crwn-text">Email Campaigns</h2>
          <p className="text-sm text-crwn-text-secondary mt-0.5">Send personalized emails to your audience</p>
        </div>
        <button
          onClick={onNewCampaign}
          className="flex items-center gap-2 px-4 py-2.5 bg-crwn-gold text-crwn-bg rounded-full text-sm font-semibold hover:bg-crwn-gold/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Campaign
        </button>
      </div>

      {/* Campaign list */}
      {campaigns.length === 0 ? (
        <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-12 text-center">
          <Mail className="w-10 h-10 text-crwn-text-secondary mx-auto mb-3" />
          <p className="text-crwn-text font-medium mb-1">No campaigns yet</p>
          <p className="text-sm text-crwn-text-secondary mb-4">
            Create your first email campaign to reach your fans.
          </p>
          <button
            onClick={onNewCampaign}
            className="px-4 py-2.5 bg-crwn-gold text-crwn-bg rounded-full text-sm font-semibold hover:bg-crwn-gold/90 transition-colors"
          >
            Create Campaign
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(campaign => {
            const status = statusConfig[campaign.status] || statusConfig.draft;
            const openRate = campaign.stats?.sent_count
              ? Math.round(((campaign.stats.open_count || 0) / campaign.stats.sent_count) * 100)
              : null;
            const clickRate = campaign.stats?.sent_count
              ? Math.round(((campaign.stats.click_count || 0) / campaign.stats.sent_count) * 100)
              : null;

            return (
              <div
                key={campaign.id}
                className="bg-crwn-card rounded-xl border border-crwn-elevated p-4 hover:border-crwn-elevated/80 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-medium text-crwn-text truncate">{campaign.name}</h3>
                      <span className={`flex items-center gap-1 text-xs ${status.color}`}>
                        {status.icon}
                        {status.label}
                      </span>
                    </div>
                    {campaign.subject && (
                      <p className="text-xs text-crwn-text-secondary truncate mb-2">
                        Subject: {campaign.subject}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-crwn-text-secondary">
                      <span>{formatDate(campaign.sent_at || campaign.created_at)}</span>
                      {campaign.status === 'sent' && campaign.stats?.sent_count && (
                        <>
                          <span>{campaign.stats.sent_count} sent</span>
                          {openRate != null && <span>{openRate}% opened</span>}
                          {clickRate != null && <span>{clickRate}% clicked</span>}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {campaign.status === 'draft' && (
                      <button
                        onClick={() => onEditCampaign(campaign.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-crwn-elevated text-crwn-text-secondary hover:text-crwn-text transition-colors"
                      >
                        Edit
                      </button>
                    )}
                    {campaign.status === 'sent' && (
                      <button
                        onClick={() => onViewStats(campaign.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-crwn-elevated text-crwn-text-secondary hover:text-crwn-text transition-colors"
                      >
                        <BarChart3 className="w-3 h-3" />
                        Stats
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
