'use client';

// PromiseCalendar — the artist's fulfillment view. Surfaces what the artist owes
// supporters (fulfillment tasks) alongside every deadline already flowing from
// campaigns, missions, city unlocks, bounties, demand tests and scheduled
// livestreams. Artists can create a tracked promise and mark each cycle complete;
// completing a recurring promise auto-schedules the next cycle.

import { useCallback, useEffect, useMemo, useState } from 'react';
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
          {tab === 'week' && <ItemList items={thisWeek} emptyLabel="Nothing due this week." onOpen={router.push} onComplete={completeEvent} onReschedule={rescheduleEvent} onCancel={cancelEvent} busyId={busyId} />}
          {tab === 'overdue' && <ItemList items={buckets.overdue} emptyLabel="Nothing overdue. You're on top of it." onOpen={router.push} onComplete={completeEvent} onReschedule={rescheduleEvent} onCancel={cancelEvent} busyId={busyId} />}
          {tab === 'completed' && <ItemList items={buckets.completed} emptyLabel="No completed promises yet." onOpen={router.push} onComplete={completeEvent} onReschedule={rescheduleEvent} onCancel={cancelEvent} busyId={busyId} />}
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
}: {
  items: CalendarItem[];
  emptyLabel: string;
  onOpen: (href: string) => void;
  onComplete: (item: CalendarItem) => void;
  onReschedule: (item: CalendarItem, dueAt: string) => void;
  onCancel: (item: CalendarItem) => void;
  busyId: string | null;
}) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
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
          return (
            <div key={it.id} className="py-3 first:pt-1 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-crwn-gold/80">
                      {ITEM_TYPE_LABEL[it.type]}
                    </span>
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
