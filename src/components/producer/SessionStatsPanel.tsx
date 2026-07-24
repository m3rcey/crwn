'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, DollarSign, Users, Inbox, BarChart3, Star } from 'lucide-react';
import type { SubmissionStatus } from '@/types/producer';

interface Stats {
  tickets: { count: number; grossCents: number; feeCents: number; netCents: number };
  tips: { count: number; grossCents: number; feeCents: number; netCents: number };
  totalNetCents: number;
  attendance: { uniqueViewers: number; activeNow: number };
  submissions: { total: number; byStatus: Record<SubmissionStatus, number> };
  polls: { count: number; votes: number };
}

interface Props {
  sessionId: string;
  sessionTitle: string;
  onClose: () => void;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// Per-session numbers for the artist: revenue (tickets + tips, net after fee),
// attendance, submission counts, poll engagement. Owner-only via the API.
export function SessionStatsPanel({ sessionId, sessionTitle, onClose }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/producer/analytics?sessionId=${sessionId}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) setStats(data);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-crwn-surface-solid w-full sm:max-w-md sm:rounded-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-crwn-elevated">
          <div className="min-w-0">
            <h2 className="text-crwn-text font-semibold truncate">Session stats</h2>
            <p className="text-crwn-text-secondary text-xs truncate">{sessionTitle}</p>
          </div>
          <button onClick={onClose} className="text-crwn-text-secondary hover:text-crwn-text p-2"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 text-crwn-gold animate-spin" /></div>
          ) : error || !stats ? (
            <p className="text-crwn-text-secondary text-sm text-center py-10">Couldn&apos;t load stats.</p>
          ) : (
            <div className="space-y-4">
              {/* Money */}
              <div className="rounded-xl border border-crwn-elevated/60 p-4">
                <div className="flex items-center gap-2 text-crwn-text-secondary text-xs uppercase tracking-wide mb-2">
                  <DollarSign className="w-3.5 h-3.5" /> You earned
                </div>
                <p className="text-3xl font-bold text-crwn-gold">{money(stats.totalNetCents)}</p>
                <p className="text-crwn-text-secondary text-xs mt-1">net, after platform fee</p>
                <div className="mt-3 pt-3 border-t border-crwn-elevated/50 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-crwn-text font-semibold">{money(stats.tickets.netCents)}</p>
                    <p className="text-crwn-text-secondary text-xs">{stats.tickets.count} seat{stats.tickets.count === 1 ? '' : 's'} sold</p>
                  </div>
                  <div>
                    <p className="text-crwn-text font-semibold">{money(stats.tips.netCents)}</p>
                    <p className="text-crwn-text-secondary text-xs">{stats.tips.count} tip{stats.tips.count === 1 ? '' : 's'}</p>
                  </div>
                </div>
              </div>

              {/* Attendance + polls */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-crwn-elevated/60 p-4">
                  <div className="flex items-center gap-2 text-crwn-text-secondary text-xs uppercase tracking-wide mb-2">
                    <Users className="w-3.5 h-3.5" /> Watched
                  </div>
                  <p className="text-2xl font-bold text-crwn-text">{stats.attendance.uniqueViewers}</p>
                  {stats.attendance.activeNow > 0 && (
                    <p className="text-crwn-gold text-xs mt-1">{stats.attendance.activeNow} watching now</p>
                  )}
                </div>
                <div className="rounded-xl border border-crwn-elevated/60 p-4">
                  <div className="flex items-center gap-2 text-crwn-text-secondary text-xs uppercase tracking-wide mb-2">
                    <BarChart3 className="w-3.5 h-3.5" /> Poll votes
                  </div>
                  <p className="text-2xl font-bold text-crwn-text">{stats.polls.votes}</p>
                  <p className="text-crwn-text-secondary text-xs mt-1">{stats.polls.count} poll{stats.polls.count === 1 ? '' : 's'}</p>
                </div>
              </div>

              {/* Submissions */}
              <div className="rounded-xl border border-crwn-elevated/60 p-4">
                <div className="flex items-center gap-2 text-crwn-text-secondary text-xs uppercase tracking-wide mb-2">
                  <Inbox className="w-3.5 h-3.5" /> Submissions
                </div>
                <p className="text-2xl font-bold text-crwn-text">{stats.submissions.total}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-crwn-text-secondary">
                  <span className="flex items-center gap-1 text-crwn-gold"><Star className="w-3 h-3 fill-crwn-gold" /> {stats.submissions.byStatus.featured} featured</span>
                  <span>{stats.submissions.byStatus.shortlisted} shortlisted</span>
                  <span>{stats.submissions.byStatus.pending} new</span>
                  <span>{stats.submissions.byStatus.rejected} passed</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
