'use client';

// Admin inspection panel for the prospect (pre-signup) nurture funnel. Read-only rollup of
// enrollments, sends, opens, clicks, conversions, and per-calculator + per-phase distribution.
// Renders under the Sequences tab, next to the account-holder platform sequences.

import { useEffect, useState } from 'react';
import { Loader2, Mail } from 'lucide-react';

interface Data {
  totals: { enrollments: number; active: number; completed: number; canceled: number; converted: number };
  sends: { totalSent: number; opened: number; clicked: number; bounced: number };
  byTool: Record<string, number>;
  byPhase: Record<string, number>;
  byExit: Record<string, number>;
  recent: Array<{
    id: string;
    email: string;
    tool_slug: string;
    phase: string | null;
    status: string;
    step: number;
    exit_reason: string | null;
    created_at: string;
    last_sent_at: string | null;
    next_send_at: string | null;
  }>;
  sequenceVersion: number;
}

function pct(n: number, d: number): string {
  if (!d) return '0%';
  return `${Math.round((n / d) * 100)}%`;
}

export default function ProspectNurtureView() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/prospect-nurture')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load'))))
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-crwn-text-secondary py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading prospect nurture...
      </div>
    );
  }
  if (error || !data) {
    return <div className="text-crwn-text-secondary py-8">Prospect nurture data unavailable. {error}</div>;
  }

  const { totals, sends } = data;

  return (
    <div className="mt-10">
      <div className="flex items-center gap-2 mb-1">
        <Mail className="w-5 h-5 text-crwn-gold" />
        <h2 className="text-lg font-bold text-crwn-text">Prospect Nurture</h2>
        <span className="text-xs text-crwn-text-secondary">(email-only calculator leads, seq v{data.sequenceVersion})</span>
      </div>
      <p className="text-sm text-crwn-text-secondary mb-4">
        Leads who ran a calculator and asked for the result by email but have not made an account. They exit the moment they sign up.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Stat label="Enrolled" value={totals.enrollments} />
        <Stat label="Active" value={totals.active} />
        <Stat label="Converted to account" value={totals.converted} />
        <Stat label="Completed" value={totals.completed} />
        <Stat label="Canceled" value={totals.canceled} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Emails sent" value={sends.totalSent} />
        <Stat label="Opened" value={sends.opened} sub={pct(sends.opened, sends.totalSent)} />
        <Stat label="Clicked" value={sends.clicked} sub={pct(sends.clicked, sends.totalSent)} />
        <Stat label="Bounced" value={sends.bounced} sub={pct(sends.bounced, sends.totalSent)} />
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <Breakdown title="By calculator" map={data.byTool} />
        <Breakdown title="Active by phase" map={data.byPhase} />
        <Breakdown title="Exit reasons" map={data.byExit} />
      </div>

      <div className="bg-crwn-surface rounded-2xl overflow-hidden">
        <div className="px-4 py-3 text-sm font-semibold text-crwn-text border-b border-crwn-elevated">Recent enrollments</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-crwn-text-secondary text-xs">
                <th className="text-left px-4 py-2 font-medium">Lead</th>
                <th className="text-left px-4 py-2 font-medium">Calculator</th>
                <th className="text-left px-4 py-2 font-medium">Phase</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Step</th>
                <th className="text-left px-4 py-2 font-medium">Next send</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((r) => (
                <tr key={r.id} className="border-t border-crwn-elevated/50">
                  <td className="px-4 py-2 text-crwn-text-secondary">{r.email}</td>
                  <td className="px-4 py-2 text-crwn-text">{r.tool_slug}</td>
                  <td className="px-4 py-2 text-crwn-text-secondary">{r.phase || '-'}</td>
                  <td className="px-4 py-2">
                    <span className="text-crwn-text">{r.status}</span>
                    {r.exit_reason ? <span className="text-crwn-text-secondary"> ({r.exit_reason})</span> : null}
                  </td>
                  <td className="px-4 py-2 text-crwn-text-secondary">{r.step}</td>
                  <td className="px-4 py-2 text-crwn-text-secondary">
                    {r.next_send_at ? new Date(r.next_send_at).toLocaleDateString() : '-'}
                  </td>
                </tr>
              ))}
              {data.recent.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-crwn-text-secondary">
                    No enrollments yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-crwn-surface rounded-2xl p-4">
      <div className="text-2xl font-bold text-crwn-text">{value.toLocaleString()}</div>
      <div className="text-xs text-crwn-text-secondary mt-1">{label}</div>
      {sub ? <div className="text-xs text-crwn-gold mt-0.5">{sub}</div> : null}
    </div>
  );
}

function Breakdown({ title, map }: { title: string; map: Record<string, number> }) {
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
  return (
    <div className="bg-crwn-surface rounded-2xl p-4">
      <div className="text-sm font-semibold text-crwn-text mb-2">{title}</div>
      {entries.length === 0 ? (
        <div className="text-xs text-crwn-text-secondary">None yet.</div>
      ) : (
        <div className="space-y-1">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-sm">
              <span className="text-crwn-text-secondary truncate mr-2">{k}</span>
              <span className="text-crwn-text font-medium">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
