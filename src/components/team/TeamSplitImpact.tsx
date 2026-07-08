'use client';

import { useEffect, useMemo, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { getPlatformFeePercent } from '@/lib/platformTier';
import { roleLabel } from '@/lib/teamSplits/constants';
import { Users } from 'lucide-react';

interface DealRow { id: string; percentage: number | null; role: string; custom_role: string | null; collaborator_name: string | null; cap_amount: number | null; }

function money(c: number) { return `$${(c / 100).toFixed(2)}`; }

/**
 * Shows the Team Split financial stack for one revenue source (e.g. a campaign
 * or product). Reads the artist's own deals via RLS. `grossCents` is the
 * source's revenue-to-date (money-goal current_value / offer revenue) used to
 * estimate what's owed. All figures are labeled estimates.
 */
export function TeamSplitImpact({ sourceId, grossCents }: { sourceType: string; sourceId: string; grossCents: number }) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [feePct, setFeePct] = useState(12);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const [{ data: d }, tierRes] = await Promise.all([
        supabase.from('team_split_deals')
          .select('id, percentage, role, custom_role, collaborator_name, cap_amount')
          .eq('revenue_source_id', sourceId)
          .in('status', ['active', 'accepted', 'paused']),
        user ? supabase.from('artist_profiles').select('platform_tier').eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (!active) return;
      setDeals((d || []) as DealRow[]);
      setFeePct(getPlatformFeePercent((tierRes as { data: { platform_tier?: string } | null }).data?.platform_tier));
      setLoaded(true);
    })();
    return () => { active = false; };
  }, [supabase, sourceId]);

  if (!loaded || deals.length === 0) return null;

  const totalPct = deals.reduce((s, d) => s + (d.percentage || 0), 0);
  const platformFee = Math.round(grossCents * feePct / 100);
  const netBeforeSplits = grossCents - platformFee;
  const teamSplit = Math.round(netBeforeSplits * totalPct / 100);
  const artistNet = netBeforeSplits - teamSplit;

  return (
    <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-crwn-gold" />
        <p className="text-sm font-semibold text-crwn-text">Team Splits ({totalPct}% of net)</p>
      </div>
      <div className="space-y-1 mb-3">
        {deals.map((d) => (
          <div key={d.id} className="flex justify-between text-xs">
            <span className="text-crwn-text-secondary">{d.collaborator_name || 'Collaborator'} · {roleLabel(d.role, d.custom_role)}</span>
            <span className="text-crwn-text">{d.percentage}%{d.cap_amount ? ` (cap ${money(d.cap_amount)})` : ''}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-crwn-elevated pt-2 space-y-1 text-xs">
        <Line k="Revenue to date" v={money(grossCents)} />
        <Line k={`Platform fee (${feePct}%)`} v={`-${money(platformFee)}`} />
        <Line k="Team Splits" v={`-${money(teamSplit)}`} />
        <div className="flex justify-between font-semibold text-crwn-text pt-1">
          <span>Your estimated net</span><span className="text-crwn-gold">{money(artistNet)}</span>
        </div>
      </div>
      <p className="text-[10px] text-crwn-text-secondary mt-2">Estimate. Excludes Stripe processing fees and any fan/clipper commissions, which come out before Team Splits.</p>
    </div>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span className="text-crwn-text-secondary">{k}</span><span className="text-crwn-text">{v}</span></div>;
}
