'use client';

// PromiseCalendar — the artist's fulfillment view. Phase 1 is READ-ONLY: it
// surfaces what the artist owes supporters (fulfillment tasks) alongside every
// deadline already flowing from campaigns, missions, city unlocks, bounties,
// demand tests and scheduled livestreams. Creating obligations from the tier
// builder + Mark-complete actions land in later phases.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, CalendarClock, AlertTriangle, CheckCircle2, ArrowRight, CalendarCheck,
} from 'lucide-react';
import {
  type CalendarItem,
  type CalendarBucket,
  ITEM_TYPE_LABEL,
  BUCKET_LABEL,
  bucketFor,
  relativeDueLabel,
} from '@/lib/calendar';

type ViewTab = 'week' | 'overdue' | 'completed';

const TABS: { id: ViewTab; label: string }[] = [
  { id: 'week', label: 'This week' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'completed', label: 'Completed' },
];

export function PromiseCalendar() {
  const router = useRouter();
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<ViewTab>('week');

  useEffect(() => {
    fetch('/api/promise-calendar')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.items)) setItems(d.items);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  const buckets = useMemo(() => {
    const b: Record<CalendarBucket, CalendarItem[]> = {
      overdue: [], today: [], week: [], later: [], completed: [],
    };
    for (const it of items) b[bucketFor(it)].push(it);
    return b;
  }, [items]);

  const overdueCount = buckets.overdue.length;
  const thisWeek = [...buckets.today, ...buckets.week];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-1 flex items-center gap-2">
        <CalendarCheck className="w-5 h-5 text-crwn-gold" />
        <h2 className="text-xl font-bold text-crwn-text">Promise Calendar</h2>
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
            Nothing due this week. When you attach recurring benefits to a tier, those
            fulfillment tasks will show up here automatically.
          </p>
        ) : (
          <p className="text-sm text-crwn-text-secondary">
            {thisWeek.length} due this week{overdueCount > 0 ? `, ${overdueCount} overdue` : ''}.
          </p>
        )}
      </div>

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
      {tab === 'week' && <ItemList items={thisWeek} emptyLabel="Nothing due this week." onOpen={router.push} />}
      {tab === 'overdue' && <ItemList items={buckets.overdue} emptyLabel="Nothing overdue. You're on top of it." onOpen={router.push} />}
      {tab === 'completed' && <ItemList items={buckets.completed} emptyLabel="No completed promises yet." onOpen={router.push} />}
    </div>
  );
}

function ItemList({
  items, emptyLabel, onOpen,
}: {
  items: CalendarItem[];
  emptyLabel: string;
  onOpen: (href: string) => void;
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
              {it.cta && it.href && !done && (
                <button
                  onClick={() => onOpen(it.href!)}
                  className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-crwn-gold/15 text-crwn-gold hover:bg-crwn-gold/25 transition-colors"
                >
                  {it.cta}
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
