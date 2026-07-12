'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { getPlatformFeePercent } from '@/lib/platformTier';
import { TeamSplitBuilder } from '@/components/team/TeamSplitBuilder';
import { roleLabel } from '@/lib/teamSplits/constants';
import type { TeamSplitDeal } from '@/lib/teamSplits/types';
import { Plus, Users, Loader2, ChevronRight } from 'lucide-react';

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-crwn-elevated text-crwn-text-secondary',
  sent: 'bg-blue-500/15 text-blue-300',
  viewed: 'bg-blue-500/15 text-blue-300',
  changes_requested: 'bg-amber-500/15 text-amber-300',
  accepted: 'bg-emerald-500/15 text-emerald-300',
  active: 'bg-emerald-500/15 text-emerald-300',
  paused: 'bg-crwn-elevated text-crwn-text-secondary',
  completed: 'bg-crwn-gold/15 text-crwn-gold',
  terminated: 'bg-crwn-elevated text-crwn-text-secondary',
  cancelled: 'bg-crwn-elevated text-crwn-text-secondary',
  disputed: 'bg-red-500/15 text-red-300',
  expired: 'bg-crwn-elevated text-crwn-text-secondary',
  archived: 'bg-crwn-elevated text-crwn-text-secondary',
};

function money(cents: number) { return `$${(cents / 100).toFixed(0)}`; }

export function TeamManager({ artistId, platformTier }: { artistId: string; platformTier?: string }) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [deals, setDeals] = useState<TeamSplitDeal[]>([]);
  const [accruals, setAccruals] = useState<Record<string, { accrued: number; released: number }>>({});
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/team-splits?role=artist');
    const data = await res.json();
    setDeals(data.deals || []);
    // Aggregate accruals per deal (artist can read own via RLS).
    const { data: earnings } = await supabase
      .from('team_split_earnings')
      .select('deal_id, commission_amount, released_at')
      .eq('artist_id', artistId);
    const agg: Record<string, { accrued: number; released: number }> = {};
    (earnings || []).forEach((e: { deal_id: string; commission_amount: number; released_at: string | null }) => {
      const a = (agg[e.deal_id] ??= { accrued: 0, released: 0 });
      a.accrued += e.commission_amount;
      if (e.released_at) a.released += e.commission_amount;
    });
    setAccruals(agg);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [artistId]);

  const feePct = getPlatformFeePercent(platformTier);
  const active = deals.filter((d) => ['active', 'accepted', 'paused'].includes(d.status));

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-crwn-text flex items-center gap-2"><Users className="w-5 h-5 text-crwn-gold" /> Team Splits</h2>
          <p className="text-sm text-crwn-text-secondary">Build your team with transparent revenue-share deals.</p>
        </div>
        <button data-tour="new-team-split" onClick={() => setShowBuilder(true)}
          className="flex items-center gap-1.5 bg-crwn-gold text-crwn-bg font-semibold text-sm px-4 py-2 rounded-full">
          <Plus className="w-4 h-4" /> New Split
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-crwn-gold animate-spin" /></div>
      ) : deals.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-crwn-elevated rounded-xl">
          <Users className="w-10 h-10 text-crwn-gold/30 mx-auto mb-3" />
          <p className="text-crwn-text font-medium">No Team Splits yet</p>
          <p className="text-sm text-crwn-text-secondary mt-1 max-w-xs mx-auto">Offer a videographer, producer, or editor a share of a campaign instead of paying upfront.</p>
          <button onClick={() => setShowBuilder(true)} className="mt-4 bg-crwn-gold text-crwn-bg font-semibold text-sm px-5 py-2 rounded-full">Create your first split</button>
        </div>
      ) : (
        <div className="space-y-2">
          {deals.map((d) => {
            const agg = accruals[d.id] || { accrued: 0, released: 0 };
            return (
              <Link key={d.id} href={`/team/${d.id}`}
                className="block bg-crwn-surface rounded-xl p-4 hover:bg-crwn-elevated transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-crwn-text truncate">{d.collaborator_name || d.collaborator_email || 'Collaborator'}</p>
                    <p className="text-xs text-crwn-text-secondary">{roleLabel(d.role, d.custom_role)} · {d.title}</p>
                    <p className="text-xs text-crwn-text-secondary mt-1">
                      {d.percentage != null ? `${d.percentage}% of ${d.payout_basis === 'gross_revenue' ? 'gross' : 'net'}` : d.milestone_amount ? `${money(d.milestone_amount)} bonus` : ''}
                      {d.revenue_source_label ? ` · ${d.revenue_source_label}` : ''}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-semibold ${STATUS_STYLE[d.status] || ''}`}>{d.status.replace(/_/g, ' ')}</span>
                      {agg.accrued > 0 && (
                        <span className="text-xs text-crwn-text-secondary">
                          {money(agg.accrued)}{d.cap_amount ? ` / ${money(d.cap_amount)}` : ''} accrued
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-crwn-text-secondary shrink-0" />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {showBuilder && (
        <TeamSplitBuilder
          artistId={artistId}
          artistFeePct={feePct}
          onClose={() => setShowBuilder(false)}
          onCreated={() => { setShowBuilder(false); load(); }}
        />
      )}
    </div>
  );
}
