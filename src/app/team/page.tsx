'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { roleLabel } from '@/lib/teamSplits/constants';
import type { TeamSplitDeal } from '@/lib/teamSplits/types';
import { Loader2, Users, ChevronRight } from 'lucide-react';

function money(c: number) { return `$${(c / 100).toFixed(2)}`; }

export default function CollaboratorDealsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [deals, setDeals] = useState<TeamSplitDeal[]>([]);
  const [available, setAvailable] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    (async () => {
      const res = await fetch('/api/team-splits?role=collaborator');
      const data = await res.json();
      setDeals(data.deals || []);

      const now = Date.now();
      const [{ data: earnings }, { data: payouts }] = await Promise.all([
        supabase.from('team_split_earnings').select('commission_amount, status, released_at, cleared_at').eq('collaborator_user_id', user.id),
        supabase.from('team_split_payouts').select('amount, status').eq('collaborator_user_id', user.id),
      ]);
      let cashable = 0;
      (earnings || []).forEach((e: { commission_amount: number; status: string; released_at: string | null; cleared_at: string }) => {
        if (e.status === 'reversed' || e.status === 'disputed') return;
        if (e.commission_amount < 0) { cashable += e.commission_amount; return; }
        if (e.released_at && new Date(e.cleared_at).getTime() <= now) cashable += e.commission_amount;
      });
      let reserved = 0;
      (payouts || []).forEach((p: { amount: number; status: string }) => { if (['completed', 'pending'].includes(p.status)) reserved += p.amount; });
      setAvailable(Math.max(0, cashable - reserved));
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  if (authLoading || loading) return <div className="flex justify-center py-24"><Loader2 className="w-7 h-7 text-crwn-gold animate-spin" /></div>;

  return (
    <div className="max-w-lg mx-auto px-4 py-6 page-fade-in">
      <h1 className="text-2xl font-bold text-crwn-text mb-1 flex items-center gap-2"><Users className="w-6 h-6 text-crwn-gold" /> Team Deals</h1>
      <p className="text-sm text-crwn-text-secondary mb-4">Revenue-share deals you’re part of.</p>

      {deals.length > 0 && (
        <div className="bg-crwn-gold/15 rounded-xl p-4 mb-4 text-center">
          <p className="text-[10px] uppercase tracking-wide text-crwn-text-secondary">Available to cash out</p>
          <p className="text-2xl font-bold text-crwn-gold">{money(available)}</p>
        </div>
      )}

      {deals.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-crwn-elevated rounded-xl">
          <Users className="w-10 h-10 text-crwn-gold/30 mx-auto mb-3" />
          <p className="text-crwn-text font-medium">No team deals yet</p>
          <p className="text-sm text-crwn-text-secondary mt-1">When an artist sends you a Team Split, it shows up here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {deals.map((d) => (
            <Link key={d.id} href={`/team/${d.id}`} className="block bg-crwn-card rounded-xl p-4 hover:bg-crwn-elevated transition-colors">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-crwn-text truncate">{d.title}</p>
                  <p className="text-xs text-crwn-text-secondary">{roleLabel(d.role, d.custom_role)}{d.revenue_source_label ? ` · ${d.revenue_source_label}` : ''}</p>
                  <p className="text-xs text-crwn-text-secondary mt-1">
                    {d.percentage != null ? `${d.percentage}% of ${d.payout_basis === 'gross_revenue' ? 'gross' : 'net'}` : d.milestone_amount ? `${money(d.milestone_amount)} bonus` : ''}
                    <span className="ml-2 uppercase tracking-wide text-[10px]">{d.status.replace(/_/g, ' ')}</span>
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-crwn-text-secondary shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
