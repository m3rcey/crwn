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
  List, CalendarDays,
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

  const completeEvent = useCallback(async (item: CalendarItem) => {
    if (item.sourceType !== 'fulfillment_event') return;
    setBusyId(item.id);
    try {
      await fetch(`/api/promise-calendar/events/${item.sourceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete' }),
      });
      await refetch();
    } finally {
      setBusyId(null);
    }
  }, [refetch]);

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
        missions, drops and lives — in one place.
      </p>

      {/* This week's promises — the hero summary */}
      <div className="neu-raised rounded-xl p-5 border border-crwn-gold/20 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <CalendarClock className="w-4 h-4 text-crwn-gold" />
          <p className="text-xs font-semibold text-crwn-gold uppercase tracking-wide">
            This week&apos;s promises
          </p>
        </div>
        {overdueCount > 0 && (
          <div className="flex items-center gap-2 mb-3 text-sm text-crwn-error">
            <AlertTriangle className="w-4 h-4" />
            {overdueCount} overdue {overdueCount === 1 ? 'promise' : 'promises'} — fulfill these first to protect retention.
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
          {tab === 'week' && <ItemList items={thisWeek} emptyLabel="Nothing due this week." onOpen={router.push} onComplete={completeEvent} busyId={busyId} />}
          {tab === 'overdue' && <ItemList items={buckets.overdue} emptyLabel="Nothing overdue. You're on top of it." onOpen={router.push} onComplete={completeEvent} busyId={busyId} />}
          {tab === 'completed' && <ItemList items={buckets.completed} emptyLabel="No completed promises yet." onOpen={router.push} onComplete={completeEvent} busyId={busyId} />}
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
  items, emptyLabel, onOpen, onComplete, busyId,
}: {
  items: CalendarItem[];
  emptyLabel: string;
  onOpen: (href: string) => void;
  onComplete: (item: CalendarItem) => void;
  busyId: string | null;
}) {
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
            <div key={it.id} className="py-3 first:pt-1 last:pb-0 flex items-center justify-between gap-3">
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
              {!done && isPromise ? (
                <button
                  onClick={() => onComplete(it)}
                  disabled={busy}
                  className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-crwn-gold/15 text-crwn-gold hover:bg-crwn-gold/25 transition-colors disabled:opacity-50"
                >
                  {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                  Mark complete
                </button>
              ) : !done && it.cta && it.href ? (
                <button
                  onClick={() => onOpen(it.href!)}
                  className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-crwn-gold/15 text-crwn-gold hover:bg-crwn-gold/25 transition-colors"
                >
                  {it.cta}
                  <ArrowRight className="w-3 h-3" />
                </button>
              ) : null}
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
            {RECURRENCE_LABEL[recurrence]} — completing each one schedules the next automatically.
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
