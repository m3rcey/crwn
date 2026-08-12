'use client';

// ManagerOpsView — operational truth about the ARTIST-FACING Manager.
//
// READ-ONLY BY CONSTRUCTION. There is no button on this page that changes anything: no approve,
// no execute, no unexpire, no reactivate. The founder can see what Manager is doing and nothing
// else, because the alternative is an admin quietly running artists' businesses for them.
//
// Not to be confused with the Agent Diagnosis panel on the Dashboard tab, which is CRWN's OWN
// business agent (funnel, pipeline, partners, CRM). Different agent, different subject. The tab
// is labelled "Artist Manager" for exactly that reason.
//
// Deliberately absent: any outcome score, any POSITIVE/NEGATIVE verdict, any "worked" / "no lift",
// any MRR delta, any artist ranking, any approval percentage on a single-digit sample. Those were
// retired on 2026-08-11 because they were claims CRWN could not support, and an admin chart is
// still a claim.

import { useEffect, useState } from 'react';
import { Loader2, Bot, Clock, AlertTriangle, CheckCircle2, PauseCircle, Inbox } from 'lucide-react';
import { FAILURE_LABELS, type FailureKind } from '@/lib/admin/managerOps';

interface Payload {
  generatedAt: string;
  validityCutoff: string;
  status: {
    artistRequested: string;
    scheduledAutonomy: string;
    cronState: 'not_running' | 'running_no_work' | 'running_with_work' | 'unknown';
    heartbeat: { detail: string | null; created_at: string } | null;
    lastMeaningfulActivity: string | null;
  };
  actions: {
    total: number;
    validPending: number;
    expiredPending: number;
    oldestValidPendingDays: number | null;
    approved: number;
    rejected: number;
    autoExecuted: number;
    failed: number;
    byType: Record<string, number>;
    byRisk: Record<string, number>;
    failuresByKind: Record<string, number>;
  };
  approvals: { awaiting: number; approved: number; rejected: number; abandoned: number; decided: number; sampleTooSmallForRates: boolean };
  insights: { total: number; active: number; byType: Record<string, number>; lastAt: string | null };
  runs: { created_at: string; severity: string | null; actions_recommended: number | null; actions_auto_executed: number | null; actions_escalated: number | null; outcome: string | null }[];
  recentActions: {
    artist: string; type: string; label: string; risk: string; status: string;
    createdAt: string; ageDays: number; expired: boolean; executedAt: string | null;
    failureKind: FailureKind | null; resultMessage: string | null;
  }[];
}

const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'never');

const CRON_STATE: Record<Payload['status']['cronState'], { label: string; detail: string; tone: string; Icon: React.ElementType }> = {
  running_with_work: { label: 'Running, doing work', detail: 'The daily job ran and processed artists.', tone: 'text-green-400', Icon: CheckCircle2 },
  running_no_work: { label: 'Running, no work done', detail: 'The job completes but processes nothing. This is the state a completion-only heartbeat cannot express.', tone: 'text-crwn-gold', Icon: PauseCircle },
  not_running: { label: 'Not running', detail: 'No heartbeat in the last 48 hours.', tone: 'text-red-400', Icon: AlertTriangle },
  unknown: { label: 'Unknown', detail: 'No heartbeat has ever been recorded.', tone: 'text-crwn-text-secondary', Icon: Clock },
};

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="rounded-xl border border-crwn-elevated bg-crwn-elevated/20 p-4">
      <p className="text-[10px] font-medium uppercase tracking-wider text-crwn-text-secondary/60">{label}</p>
      <p className="text-2xl font-bold text-crwn-text mt-1">{value}</p>
      {note && <p className="text-[11px] text-crwn-text-secondary mt-1 leading-snug">{note}</p>}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  // Truthful empty states: "nothing has happened" must never look like "something is broken".
  return (
    <div className="flex items-center gap-2 px-3 py-3 rounded-lg bg-crwn-elevated/20 text-xs text-crwn-text-secondary">
      <Inbox className="w-3.5 h-3.5 shrink-0 opacity-60" />
      {children}
    </div>
  );
}

export default function ManagerOpsView() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/manager-ops')
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error(r.status === 403 ? 'Admin only' : `HTTP ${r.status}`))))
      .then((j) => { if (!cancelled) setData(j); })
      .catch((e) => { if (!cancelled) setError(String(e.message || e)); });
    return () => { cancelled = true; };
  }, []);

  if (error) return <div className="p-6 text-sm text-red-400">Could not load Manager ops: {error}</div>;
  if (!data) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-crwn-gold" /></div>;

  const { status, actions, approvals, insights, recentActions } = data;
  const cron = CRON_STATE[status.cronState];

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-crwn-gold" />
          <h2 className="text-lg font-bold text-crwn-text">Artist Manager</h2>
        </div>
        <p className="text-xs text-crwn-text-secondary mt-1">
          Operational state of the artist-facing Manager. Read only: nothing here changes an
          artist&apos;s account. This is not CRWN&apos;s own business agent, which lives on the
          Dashboard tab.
        </p>
      </div>

      {/* ── Status ─────────────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-crwn-text mb-3">Status</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-crwn-elevated bg-crwn-elevated/20 p-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-crwn-text-secondary/60">Artist-requested Manager</p>
            <p className="text-sm font-semibold text-crwn-text mt-1">Available</p>
            <p className="text-[11px] text-crwn-text-secondary mt-1">Runs when an artist opens Manager or hits Refresh. No schedule.</p>
          </div>
          <div className="rounded-xl border border-crwn-elevated bg-crwn-elevated/20 p-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-crwn-text-secondary/60">Scheduled autonomy</p>
            <p className="text-sm font-semibold text-crwn-gold mt-1">Intentionally dormant</p>
            <p className="text-[11px] text-crwn-text-secondary mt-1">Founder decision, 2026-08-11. Not a fault, and not something to fix here.</p>
          </div>
          <div className="rounded-xl border border-crwn-elevated bg-crwn-elevated/20 p-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-crwn-text-secondary/60">Daily job</p>
            <p className={`text-sm font-semibold mt-1 flex items-center gap-1.5 ${cron.tone}`}>
              <cron.Icon className="w-3.5 h-3.5" />
              {cron.label}
            </p>
            <p className="text-[11px] text-crwn-text-secondary mt-1">{cron.detail}</p>
            {status.heartbeat && (
              <p className="text-[10px] text-crwn-text-secondary/60 mt-2 font-mono break-all">
                {d(status.heartbeat.created_at)}: &ldquo;{status.heartbeat.detail}&rdquo;
              </p>
            )}
          </div>
        </div>
        <p className="text-[11px] text-crwn-text-secondary mt-3">
          Last artist-visible Manager output: <span className="text-crwn-text">{d(status.lastMeaningfulActivity)}</span>
        </p>
      </section>

      {/* ── Action health ──────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-crwn-text mb-3">Actions</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Awaiting approval" value={actions.validPending}
            note={actions.oldestValidPendingDays !== null ? `Oldest: ${actions.oldestValidPendingDays}d` : 'None waiting'} />
          <Stat label="Expired unactioned" value={actions.expiredPending}
            note="Aged out of the validity window. Kept as history, no longer offered." />
          <Stat label="Executed" value={actions.approved + actions.autoExecuted}
            note={`${actions.approved} artist-approved, ${actions.autoExecuted} auto`} />
          <Stat label="Failed or refused" value={actions.failed} note="Includes validity refusals" />
        </div>

        {Object.keys(actions.byRisk).length > 0 && (
          <p className="text-[11px] text-crwn-text-secondary mt-3">
            By risk:{' '}
            {Object.entries(actions.byRisk).map(([k, v]) => `${k} ${v}`).join(' · ')}
            {'. '}
            Risk is how much a run would mutate, not how good the suggestion is.
          </p>
        )}
      </section>

      {/* ── Approvals ──────────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-crwn-text mb-3">Approvals</h3>
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Waiting" value={approvals.awaiting} />
          <Stat label="Approved" value={approvals.approved} />
          <Stat label="Rejected" value={approvals.rejected} />
          <Stat label="Abandoned" value={approvals.abandoned} note="Expired without a decision" />
        </div>
        {approvals.sampleTooSmallForRates && (
          <p className="text-[11px] text-crwn-text-secondary mt-3">
            Counts only. {approvals.decided} decision{approvals.decided === 1 ? '' : 's'} is too few to
            express as a rate, and a percentage from a handful of rows reads as a finding while
            carrying none.
          </p>
        )}
      </section>

      {/* ── Failures ───────────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-crwn-text mb-3">Failures and refusals</h3>
        {Object.keys(actions.failuresByKind).length === 0 ? (
          <Empty>No Manager action has failed or been refused.</Empty>
        ) : (
          <div className="space-y-1.5">
            {Object.entries(actions.failuresByKind).map(([kind, n]) => (
              <div key={kind} className="flex items-center justify-between px-3 py-2 rounded-lg bg-crwn-elevated/30 text-xs">
                <span className="text-crwn-text">{FAILURE_LABELS[kind as FailureKind] ?? kind}</span>
                <span className="text-crwn-text-secondary">{n}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Insights ───────────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-crwn-text mb-3">Insights</h3>
        {insights.total === 0 ? (
          <Empty>No Manager insights have been generated.</Empty>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Total" value={insights.total} />
              <Stat label="Currently live" value={insights.active} note="Not dismissed, not expired" />
              <Stat label="Last generated" value={d(insights.lastAt)} />
            </div>
            <p className="text-[11px] text-crwn-text-secondary mt-3">
              By type: {Object.entries(insights.byType).map(([k, v]) => `${k} ${v}`).join(' · ')}
            </p>
          </>
        )}
      </section>

      {/* ── Recent actions ─────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-crwn-text mb-3">Recent actions</h3>
        {recentActions.length === 0 ? (
          <Empty>Manager has never proposed an action.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-crwn-text-secondary/60">
                  <th className="py-2 pr-3 font-medium">Artist</th>
                  <th className="py-2 pr-3 font-medium">Action</th>
                  <th className="py-2 pr-3 font-medium">Risk</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Age</th>
                  <th className="py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {recentActions.map((a, i) => (
                  <tr key={`${a.artist}:${a.createdAt}:${i}`} className="border-t border-crwn-elevated/50">
                    <td className="py-2 pr-3 text-crwn-text-secondary">{a.artist}</td>
                    <td className="py-2 pr-3 text-crwn-text">{a.type}</td>
                    <td className="py-2 pr-3 text-crwn-text-secondary">{a.risk}</td>
                    <td className="py-2 pr-3">
                      <span className={a.expired ? 'text-crwn-text-secondary/60' : 'text-crwn-text'}>
                        {a.expired ? 'expired' : a.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-crwn-text-secondary">{a.ageDays}d</td>
                    <td className="py-2 text-crwn-text-secondary/70 max-w-xs truncate">
                      {a.failureKind ? FAILURE_LABELS[a.failureKind] : a.resultMessage || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Notes ──────────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-crwn-elevated bg-crwn-elevated/10 p-4">
        <h3 className="text-sm font-semibold text-crwn-text mb-2">What this page will not tell you</h3>
        <ul className="space-y-1 text-[11px] text-crwn-text-secondary">
          <li>Whether an action &ldquo;worked&rdquo;. Manager&apos;s outcome scoring was retired on 2026-08-11: it derived its own MRR, could not tell missing from zero, and had no control group.</li>
          <li>Which artist is doing better. This is operations, not benchmarking, and CRWN makes no cross-artist claim to an artist.</li>
          <li>What an artist should do next. The Constraint Engine owns that, and there is no second opinion here.</li>
        </ul>
      </section>
    </div>
  );
}
