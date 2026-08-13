'use client';

// PromiseCalendar — the artist's fulfillment view. Surfaces what the artist owes
// supporters (fulfillment tasks) alongside every deadline already flowing from
// campaigns, missions, city unlocks, bounties, demand tests and scheduled
// livestreams. Artists can create a tracked promise and mark each cycle complete;
// completing a recurring promise auto-schedules the next cycle.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, CalendarClock, AlertTriangle, CheckCircle2, ArrowRight, CalendarCheck, Plus, X,
  List, CalendarDays, MoreHorizontal,
} from 'lucide-react';
import { CalendarMonthGrid } from '@/components/calendar/CalendarMonthGrid';
import {
  type CalendarItem,
  type CalendarBucket,
  ITEM_TYPE_LABEL,
  bucketFor,
  relativeDueLabel,
} from '@/lib/calendar';
import {
  RECURRENCE_LABEL, FULFILLMENT_TYPE_LABEL, type Recurrence,
} from '@/lib/fulfillment';

type ViewTab = 'week' | 'overdue' | 'completed';

// The revenue ramp, as the API sends it. The dated steps themselves arrive as normal
// calendar items (type 'roadmap'); this is the arc they add up to.
interface RampPhaseSummary {
  key: string;
  name: string;
  startDay: number;
  endDay: number;
  focus: string;
  expect: string;
  startsAt: string;
  endsAt: string;
  targetMonthlyCents: number | null;
  targetPayers: number | null;
}
interface RampSummary {
  targetMonthlyCents: number | null;
  startedAt: string;
  acceleratedDays: number;
  totalDays: number;
  phases: RampPhaseSummary[];
  currentPhaseKey: string | null;
}

// Where the artist actually is. Drives the one-milestone-at-a-time view: a plan that shows all
// twelve months at once is the thing artists quit in front of.
interface RampProgressSummary {
  currentPhaseKey: string | null;
  nextStep: { key: string; title: string; detail: string; href: string; dueAt: string; accelerator?: boolean; entryPriority?: boolean } | null;
  stepsDone: number;
  stepsTotal: number;
  phaseStepsDone: number;
  phaseStepsTotal: number;
  phaseProgressPct: number;
  overallProgressPct: number;
  currentMrrCents: number | null;
  nextMilestoneName: string | null;
  nextMilestoneTargetCents: number | null;
  centsToNextMilestone: number | null;
  supportersToNextMilestone: number | null;
  behindDays: number;
  aheadDays: number;
  projectedTotalDays: number;
}

const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;

interface TierHealth {
  tierId: string;
  tierName: string;
  obligations: number;
  completed: number;
  resolved: number;
  pct: number | null;
}

const TABS: { id: ViewTab; label: string }[] = [
  { id: 'week', label: 'This week' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'completed', label: 'Completed' },
];

const RECURRENCE_OPTIONS: Recurrence[] = ['none', 'weekly', 'biweekly', 'monthly', 'quarterly'];
const FULFILLMENT_OPTIONS = Object.keys(FULFILLMENT_TYPE_LABEL);

export function PromiseCalendar() {
  const router = useRouter();
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<ViewTab>('week');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tierHealth, setTierHealth] = useState<TierHealth[]>([]);
  const [ramp, setRamp] = useState<RampSummary | null>(null);
  const [seedingRamp, setSeedingRamp] = useState(false);
  const [progress, setProgress] = useState<RampProgressSummary | null>(null);
  // Deep link from Rise Mode: ?tab=overdue opens the overdue list, ?event=<fulfillment_events.id>
  // highlights and scrolls to that promise. The id is a POINTER, not authority: the list below is
  // this artist's own /api/promise-calendar payload, so an id belonging to anyone else matches
  // nothing, reveals nothing and changes no permission. Read from window.location the same way
  // AudienceTab reads its ?view=, which keeps this component out of a Suspense boundary.
  const [highlightEventId, setHighlightEventId] = useState<string | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tab');
    if (t === 'overdue' || t === 'completed' || t === 'week') setTab(t);
    const ev = params.get('event');
    if (ev) setHighlightEventId(ev);
  }, []);

  useEffect(() => {
    fetch('/api/promise-calendar/health')
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.tiers)) setTierHealth(d.tiers); })
      .catch(() => {});
  }, []);

  const refetch = useCallback(() => {
    return fetch('/api/promise-calendar')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.items)) setItems(d.items);
        setRamp(d.ramp && typeof d.ramp === 'object' ? (d.ramp as RampSummary) : null);
        setProgress(d.progress && typeof d.progress === 'object' ? (d.progress as RampProgressSummary) : null);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  const buckets = useMemo(() => {
    const b: Record<CalendarBucket, CalendarItem[]> = {
      overdue: [], today: [], week: [], later: [], completed: [],
    };
    for (const it of items) b[bucketFor(it)].push(it);
    return b;
  }, [items]);

  const overdueCount = buckets.overdue.length;
  const thisWeek = [...buckets.today, ...buckets.week];

  // Fulfillment health = of your resolved promises, how many you kept (completed)
  // vs let go overdue/missed. Null when there's no track record yet.
  const health = useMemo(() => {
    const promises = items.filter((i) => i.sourceType === 'fulfillment_event');
    const completed = promises.filter((i) => i.status === 'completed').length;
    const missed = promises.filter((i) => i.status === 'overdue' || i.status === 'missed').length;
    const resolved = completed + missed;
    return resolved > 0 ? { pct: Math.round((completed / resolved) * 100), completed, resolved } : null;
  }, [items]);

  const eventAction = useCallback(async (item: CalendarItem, body: Record<string, unknown>) => {
    if (item.sourceType !== 'fulfillment_event') return;
    setBusyId(item.id);
    try {
      await fetch(`/api/promise-calendar/events/${item.sourceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      await refetch();
    } finally {
      setBusyId(null);
    }
  }, [refetch]);

  const completeEvent = useCallback((item: CalendarItem) => eventAction(item, { action: 'complete' }), [eventAction]);
  const rescheduleEvent = useCallback((item: CalendarItem, dueAt: string) => eventAction(item, { action: 'reschedule', dueAt }), [eventAction]);
  const cancelEvent = useCallback((item: CalendarItem) => eventAction(item, { action: 'cancel' }), [eventAction]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <CalendarCheck className="w-5 h-5 text-crwn-gold" />
          <h2 className="text-xl font-bold text-crwn-text">Promise Calendar</h2>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="shrink-0 inline-flex items-center gap-1.5 bg-crwn-gold text-crwn-bg text-sm font-semibold px-4 py-2 rounded-full hover:bg-crwn-gold/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New promise
        </button>
      </div>
      <p className="text-sm text-crwn-text-secondary mb-5">
        What you promised supporters, and every deadline coming from your campaigns,
        missions, drops and lives, all in one place.
      </p>

      {/* This week's promises — the hero summary */}
      <div className="neu-raised rounded-xl p-5 border border-crwn-gold/20 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <CalendarClock className="w-4 h-4 text-crwn-gold" />
          <p className="text-xs font-semibold text-crwn-gold uppercase tracking-wide">
            This week&apos;s promises
          </p>
        </div>
        {health && (
          <div className="flex items-center justify-between mb-3 pb-3 border-b border-crwn-elevated">
            <span className="text-xs text-crwn-text-secondary">Fulfillment health</span>
            <span
              className={`text-sm font-bold ${
                health.pct >= 80 ? 'text-green-400' : health.pct >= 50 ? 'text-crwn-gold' : 'text-crwn-error'
              }`}
            >
              {health.pct}%{' '}
              <span className="text-xs font-normal text-crwn-text-secondary">
                ({health.completed}/{health.resolved} kept)
              </span>
            </span>
          </div>
        )}
        {overdueCount > 0 && (
          <div className="flex items-center gap-2 mb-3 text-sm text-crwn-error">
            <AlertTriangle className="w-4 h-4" />
            {overdueCount} overdue {overdueCount === 1 ? 'promise' : 'promises'}. Fulfill these first to protect retention.
          </div>
        )}
        {thisWeek.length === 0 && overdueCount === 0 ? (
          <p className="text-sm text-crwn-text-secondary">
            Nothing due this week. Add a promise, or attach recurring benefits to a
            tier, and those fulfillment tasks show up here automatically.
          </p>
        ) : (
          <p className="text-sm text-crwn-text-secondary">
            {thisWeek.length} due this week{overdueCount > 0 ? `, ${overdueCount} overdue` : ''}.
          </p>
        )}
      </div>

      {/* Artists who signed up before the roadmap existed have no ramp. One button lays it
          down, dated from today. */}
      {!isLoading && !ramp && (
        <div className="neu-raised rounded-xl p-5 mb-6">
          <p className="text-xs font-semibold text-crwn-gold uppercase tracking-wide mb-1">
            Your first year is not laid out yet
          </p>
          <p className="text-sm text-crwn-text-secondary mb-3">
            The number your calculator showed is a full-year number. Without the dated steps that
            build it, most of it is still sitting with your fans a year from now. Lay out the plan
            and every step lands on this calendar.
          </p>
          <button
            onClick={() => {
              setSeedingRamp(true);
              fetch('/api/promise-calendar/ramp', { method: 'POST' })
                .then(() => refetch())
                .finally(() => setSeedingRamp(false));
            }}
            disabled={seedingRamp}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold bg-crwn-gold text-crwn-bg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {seedingRamp ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
            Lay out my first year
          </button>
        </div>
      )}

      {/* ONE milestone at a time.
          The destination never moves and stays visible as a thin line at the top, but the card
          is about the next rung only. Showing an artist the whole twelve months is showing them
          how far away the end is, which is the thing they quit in front of. */}
      {ramp && progress && (
        <div className="neu-raised rounded-xl p-5 mb-6">
          {/* Destination: small, permanent, not the headline. */}
          {ramp.targetMonthlyCents !== null && (
            <div className="flex items-center justify-between text-[11px] text-crwn-text-secondary mb-3 pb-3 border-b border-crwn-elevated">
              <span>
                Destination {money(ramp.targetMonthlyCents)}/mo
                {progress.currentMrrCents !== null && ` · you are at ${money(progress.currentMrrCents)}/mo`}
              </span>
              <span>{progress.overallProgressPct}%</span>
            </div>
          )}

          {/* The milestone in play. */}
          <p className="text-xs font-semibold text-crwn-gold uppercase tracking-wide mb-1">
            {progress.nextMilestoneName ? `Milestone: ${progress.nextMilestoneName}` : 'Your first year'}
          </p>
          {progress.nextMilestoneTargetCents !== null && progress.nextMilestoneTargetCents > 0 && (
            <p className="text-2xl font-bold text-crwn-text mb-1">
              {money(progress.nextMilestoneTargetCents)}<span className="text-base font-semibold">/mo</span>
            </p>
          )}
          {progress.supportersToNextMilestone !== null && progress.supportersToNextMilestone > 0 && (
            <p className="text-sm text-crwn-gold font-semibold mb-2">
              {progress.supportersToNextMilestone.toLocaleString()} more paying{' '}
              {progress.supportersToNextMilestone === 1 ? 'supporter' : 'supporters'} to get there
            </p>
          )}

          <div className="h-2 rounded-full bg-crwn-elevated overflow-hidden mb-1">
            <div
              className="h-full rounded-full bg-crwn-gold transition-all duration-500"
              style={{ width: `${progress.phaseProgressPct}%` }}
            />
          </div>
          <p className="text-[11px] text-crwn-text-secondary mb-4">
            {progress.phaseStepsDone} of {progress.phaseStepsTotal} steps done in this milestone
            {progress.behindDays > 0
              ? ` · ${progress.behindDays} ${progress.behindDays === 1 ? 'day' : 'days'} behind plan`
              : progress.aheadDays > 0
                ? ` · ${progress.aheadDays} ${progress.aheadDays === 1 ? 'day' : 'days'} of runway ahead`
                : ' · on plan'}
          </p>

          {/* The single next action. */}
          {progress.nextStep ? (
            <div className="rounded-lg p-3 border border-crwn-gold/40 bg-crwn-gold/5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-crwn-gold">
                  Do this next
                </span>
                {progress.nextStep.accelerator && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-orange-400">
                    Moves it faster
                  </span>
                )}
                {progress.nextStep.entryPriority && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-crwn-text-secondary">
                    What you came for
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-crwn-text">{progress.nextStep.title}</p>
              <p className="text-xs text-crwn-text-secondary mt-1">{progress.nextStep.detail}</p>
              <button
                onClick={() => router.push(progress.nextStep!.href)}
                className="mt-3 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold bg-crwn-gold text-crwn-bg hover:opacity-90 transition-opacity"
              >
                Start this step
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <p className="text-sm text-crwn-text-secondary">
              Every step on your roadmap is done. What holds the number now is keeping the
              promises on this calendar.
            </p>
          )}

          {/* What is coming, named but not detailed. The rest stays locked. */}
          {(() => {
            const idx = ramp.phases.findIndex((p) => p.key === progress.currentPhaseKey);
            const upcoming = idx >= 0 ? ramp.phases.slice(idx + 1, idx + 3) : [];
            if (!upcoming.length) return null;
            return (
              <p className="text-[11px] text-crwn-text-secondary/70 mt-3">
                Locked next: {upcoming.map((p) => p.name).join(', ')}. Each one opens when this
                milestone is done.
              </p>
            );
          })()}
          <p className="text-[11px] text-crwn-text-secondary/70 mt-2">
            Targets are projections built on your own numbers, not guarantees.
            {progress.projectedTotalDays !== ramp.totalDays &&
              ` At your current pace the full number lands around month ${Math.round(progress.projectedTotalDays / 30)}.`}
          </p>
        </div>
      )}

      {/* Per-tier fulfillment health */}
      {tierHealth.length > 0 && (
        <div className="neu-raised rounded-xl p-5 mb-6">
          <p className="text-xs font-semibold text-crwn-gold uppercase tracking-wide mb-3">
            Tier fulfillment health
          </p>
          <div className="space-y-3">
            {tierHealth.map((t) => {
              const color =
                t.pct === null ? 'text-crwn-text-secondary'
                : t.pct >= 80 ? 'text-green-400'
                : t.pct >= 50 ? 'text-crwn-gold'
                : 'text-crwn-error';
              const bar =
                t.pct === null ? 'bg-crwn-text-secondary'
                : t.pct >= 80 ? 'bg-green-400'
                : t.pct >= 50 ? 'bg-crwn-gold'
                : 'bg-crwn-error';
              return (
                <div key={t.tierId}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-crwn-text font-medium">{t.tierName}</span>
                    <span className={`font-bold ${color}`}>{t.pct === null ? '-' : `${t.pct}%`}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-crwn-elevated overflow-hidden">
                    <div className={`h-full rounded-full ${bar}`} style={{ width: `${t.pct ?? 0}%` }} />
                  </div>
                  <p className="text-[11px] text-crwn-text-secondary mt-1">
                    {t.resolved > 0 ? `${t.completed}/${t.resolved} kept` : 'No promises resolved yet'}
                    {' · '}{t.obligations} promise{t.obligations !== 1 ? 's' : ''}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* List / Calendar view toggle */}
      <div className="inline-flex rounded-full neu-raised p-1 mb-4">
        <button
          onClick={() => setView('list')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            view === 'list' ? 'bg-crwn-gold text-crwn-bg' : 'text-crwn-text-secondary hover:text-crwn-text'
          }`}
        >
          <List className="w-3.5 h-3.5" /> List
        </button>
        <button
          onClick={() => setView('calendar')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            view === 'calendar' ? 'bg-crwn-gold text-crwn-bg' : 'text-crwn-text-secondary hover:text-crwn-text'
          }`}
        >
          <CalendarDays className="w-3.5 h-3.5" /> Calendar
        </button>
      </div>

      {view === 'calendar' ? (
        <CalendarMonthGrid items={items} onOpen={router.push} onComplete={completeEvent} busyId={busyId} />
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-6 border-b border-crwn-elevated mb-4">
            {TABS.map((t) => {
              const count =
                t.id === 'week' ? thisWeek.length
                : t.id === 'overdue' ? buckets.overdue.length
                : buckets.completed.length;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    tab === t.id
                      ? 'text-crwn-gold border-crwn-gold'
                      : 'text-crwn-text-secondary border-transparent hover:text-crwn-text'
                  }`}
                >
                  {t.label}{count > 0 ? ` (${count})` : ''}
                </button>
              );
            })}
          </div>

          {/* Lists */}
          {tab === 'week' && <ItemList items={thisWeek} emptyLabel="Nothing due this week." onOpen={router.push} onComplete={completeEvent} onReschedule={rescheduleEvent} onCancel={cancelEvent} busyId={busyId} highlightEventId={highlightEventId} highlightRef={highlightRef} />}
          {tab === 'overdue' && <ItemList items={buckets.overdue} emptyLabel="Nothing overdue. You're on top of it." onOpen={router.push} onComplete={completeEvent} onReschedule={rescheduleEvent} onCancel={cancelEvent} busyId={busyId} highlightEventId={highlightEventId} highlightRef={highlightRef} />}
          {tab === 'completed' && <ItemList items={buckets.completed} emptyLabel="No completed promises yet." onOpen={router.push} onComplete={completeEvent} onReschedule={rescheduleEvent} onCancel={cancelEvent} busyId={busyId} highlightEventId={highlightEventId} highlightRef={highlightRef} />}
        </>
      )}

      {showForm && (
        <NewPromiseModal
          onClose={() => setShowForm(false)}
          onCreated={async () => { setShowForm(false); await refetch(); }}
        />
      )}
    </div>
  );
}

function ItemList({
  items, emptyLabel, onOpen, onComplete, onReschedule, onCancel, busyId,
  highlightEventId, highlightRef,
}: {
  items: CalendarItem[];
  emptyLabel: string;
  onOpen: (href: string) => void;
  onComplete: (item: CalendarItem) => void;
  onReschedule: (item: CalendarItem, dueAt: string) => void;
  onCancel: (item: CalendarItem) => void;
  busyId: string | null;
  /** `fulfillment_events.id` named by the Rise Mode CTA, or null. */
  highlightEventId?: string | null;
  highlightRef?: React.MutableRefObject<HTMLDivElement | null>;
}) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');

  // Bring the named promise into view once it has actually rendered. Same treatment the payouts
  // screen already gives ?earning=<id>, so the two deep links behave identically.
  useEffect(() => {
    if (highlightEventId && highlightRef?.current) {
      highlightRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [highlightEventId, highlightRef, items]);

  if (items.length === 0) {
    return (
      <div className="neu-raised rounded-xl p-8 text-center">
        <CheckCircle2 className="w-10 h-10 text-crwn-gold/30 mx-auto mb-3" />
        <p className="text-sm text-crwn-text-secondary">{emptyLabel}</p>
      </div>
    );
  }
  return (
    <div className="neu-raised rounded-xl p-4">
      <div className="divide-y divide-crwn-elevated">
        {items.map((it) => {
          const overdue = it.status === 'overdue' || it.status === 'missed';
          const done = it.status === 'completed';
          const isPromise = it.sourceType === 'fulfillment_event';
          const busy = busyId === it.id;
          // Match on the SOURCE row id, never the composite `${sourceType}:${sourceId}` key.
          const highlighted =
            !!highlightEventId && isPromise && it.sourceId === highlightEventId;
          return (
            <div
              key={it.id}
              ref={highlighted ? highlightRef : null}
              className={`py-3 first:pt-1 last:pb-0 ${
                highlighted ? 'rounded-xl ring-2 ring-crwn-gold px-3 -mx-1' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-crwn-gold/80">
                      {ITEM_TYPE_LABEL[it.type]}
                    </span>
                    {it.meta?.rampAccelerator === true && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-orange-400">
                        Moves it faster
                      </span>
                    )}
                    <span
                      className={`text-[11px] font-medium ${
                        overdue ? 'text-crwn-error' : done ? 'text-green-400' : 'text-crwn-text-secondary'
                      }`}
                    >
                      {done ? 'Done' : relativeDueLabel(it.dueAt)}
                    </span>
                  </div>
                  <p className={`text-sm font-medium truncate mt-0.5 ${done ? 'text-crwn-text-secondary line-through' : 'text-crwn-text'}`}>
                    {it.title}
                  </p>
                  {it.subtitle && (
                    <p className="text-xs text-crwn-text-secondary truncate">{it.subtitle}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!done && isPromise ? (
                    <>
                      {/* Roadmap steps carry a deep link to the screen where the work happens.
                          A promise owed to a supporter does not: it is discharged by the artist
                          doing the thing, wherever that is. */}
                      {it.href && (
                        <button
                          onClick={() => onOpen(it.href!)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-crwn-elevated text-crwn-text-secondary hover:text-crwn-text transition-colors"
                        >
                          {it.cta || 'Open'}
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={() => onComplete(it)}
                        disabled={busy}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-crwn-gold/15 text-crwn-gold hover:bg-crwn-gold/25 transition-colors disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                        Mark complete
                      </button>
                      <button
                        onClick={() => { setMenuId(menuId === it.id ? null : it.id); setRescheduleId(null); }}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-crwn-text-secondary hover:text-crwn-text hover:bg-crwn-elevated/50"
                        aria-label="More"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </>
                  ) : !done && it.cta && it.href ? (
                    <button
                      onClick={() => onOpen(it.href!)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-crwn-gold/15 text-crwn-gold hover:bg-crwn-gold/25 transition-colors"
                    >
                      {it.cta}
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Reschedule / cancel menu */}
              {menuId === it.id && (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  {rescheduleId === it.id ? (
                    <>
                      <input
                        type="date"
                        value={rescheduleDate}
                        onChange={(e) => setRescheduleDate(e.target.value)}
                        className="bg-crwn-elevated rounded-lg px-2 py-1.5 text-xs text-crwn-text outline-none focus:ring-1 focus:ring-crwn-gold"
                      />
                      <button
                        onClick={() => {
                          if (!rescheduleDate) return;
                          onReschedule(it, new Date(rescheduleDate + 'T12:00:00').toISOString());
                          setMenuId(null); setRescheduleId(null); setRescheduleDate('');
                        }}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold bg-crwn-gold text-crwn-bg hover:bg-crwn-gold/90"
                      >
                        Move
                      </button>
                      <button onClick={() => setRescheduleId(null)} className="px-2 py-1.5 text-xs text-crwn-text-secondary hover:text-crwn-text">
                        Back
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setRescheduleId(it.id);
                          setRescheduleDate(new Date(it.dueAt).toISOString().slice(0, 10));
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-crwn-elevated text-crwn-text hover:bg-crwn-elevated/70"
                      >
                        <CalendarClock className="w-3 h-3" /> Reschedule
                      </button>
                      <button
                        onClick={() => { onCancel(it); setMenuId(null); }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold text-crwn-error hover:bg-crwn-error/10"
                      >
                        <X className="w-3 h-3" /> Cancel promise
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NewPromiseModal({
  onClose, onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState('content_drop');
  const [recurrence, setRecurrence] = useState<Recurrence>('monthly');
  const [firstDueAt, setFirstDueAt] = useState(defaultDueDate());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim()) { setError('Give the promise a name.'); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/promise-calendar/obligations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          fulfillmentType,
          recurrence,
          firstDueAt: new Date(firstDueAt).toISOString(),
        }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Could not save.'); setSaving(false); return; }
      onCreated();
    } catch {
      setError('Could not save.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="neu-modal p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-crwn-text">New promise</h3>
          <button onClick={onClose} className="text-crwn-text-secondary hover:text-crwn-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="block text-xs font-semibold text-crwn-text-secondary uppercase tracking-wide mb-1">What you owe supporters</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Monthly unreleased demo"
          className="w-full bg-crwn-elevated rounded-lg px-3 py-2.5 text-sm text-crwn-text placeholder:text-crwn-text-secondary/60 mb-4 outline-none focus:ring-1 focus:ring-crwn-gold"
        />

        <label className="block text-xs font-semibold text-crwn-text-secondary uppercase tracking-wide mb-1">Type</label>
        <select
          value={fulfillmentType}
          onChange={(e) => setFulfillmentType(e.target.value)}
          className="w-full bg-crwn-elevated rounded-lg px-3 py-2.5 text-sm text-crwn-text mb-4 outline-none focus:ring-1 focus:ring-crwn-gold"
        >
          {FULFILLMENT_OPTIONS.map((t) => (
            <option key={t} value={t}>{FULFILLMENT_TYPE_LABEL[t]}</option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div>
            <label className="block text-xs font-semibold text-crwn-text-secondary uppercase tracking-wide mb-1">Repeats</label>
            <select
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as Recurrence)}
              className="w-full bg-crwn-elevated rounded-lg px-3 py-2.5 text-sm text-crwn-text outline-none focus:ring-1 focus:ring-crwn-gold"
            >
              {RECURRENCE_OPTIONS.map((r) => (
                <option key={r} value={r}>{RECURRENCE_LABEL[r]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-crwn-text-secondary uppercase tracking-wide mb-1">First due</label>
            <input
              type="date"
              value={firstDueAt}
              onChange={(e) => setFirstDueAt(e.target.value)}
              className="w-full bg-crwn-elevated rounded-lg px-3 py-2.5 text-sm text-crwn-text outline-none focus:ring-1 focus:ring-crwn-gold"
            />
          </div>
        </div>

        {error && <p className="text-sm text-crwn-error mb-3">{error}</p>}

        <button
          onClick={submit}
          disabled={saving}
          className="w-full bg-crwn-gold text-crwn-bg text-sm font-semibold py-3 rounded-full hover:bg-crwn-gold/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Add to calendar
        </button>
        {recurrence !== 'none' && (
          <p className="text-xs text-crwn-text-secondary mt-3 text-center">
            {RECURRENCE_LABEL[recurrence]}. Completing each one schedules the next automatically.
          </p>
        )}
      </div>
    </div>
  );
}

// Default the first-due date input to 7 days out (YYYY-MM-DD, local).
function defaultDueDate(): string {
  const d = new Date(Date.now() + 7 * 86400000);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
