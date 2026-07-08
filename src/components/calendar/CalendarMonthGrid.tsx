'use client';

// CalendarMonthGrid — the visual month view shared by the artist Promise Calendar
// and the fan My CRWN Calendar. Mobile-first: a compact month of day-cells with
// status dots; tapping a day reveals that day's items below the grid (progressive
// disclosure, per CLAUDE.md — never cram a full dashboard onto one screen).
//
// Pure rendering of the same CalendarItem[] the lists use — no data fetching here.

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowRight, CheckCircle2, Loader2, Dot } from 'lucide-react';
import {
  type CalendarItem,
  ITEM_TYPE_LABEL,
  relativeDueLabel,
  formatTime,
} from '@/lib/calendar';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Local YYYY-MM-DD key for a Date (matches how days are bucketed visually).
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dotClass(status: CalendarItem['status']): string {
  if (status === 'overdue' || status === 'missed') return 'bg-crwn-error';
  if (status === 'completed') return 'bg-green-400';
  if (status === 'today') return 'bg-crwn-gold';
  return 'bg-crwn-text-secondary';
}

export function CalendarMonthGrid({
  items,
  onOpen,
  onComplete,
  busyId,
}: {
  items: CalendarItem[];
  onOpen?: (href: string) => void;
  onComplete?: (item: CalendarItem) => void;
  busyId?: string | null;
}) {
  const today = new Date();
  const [cursor, setCursor] = useState<{ y: number; m: number }>({
    y: today.getFullYear(),
    m: today.getMonth(),
  });
  const [selectedKey, setSelectedKey] = useState<string>(dayKey(today));

  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const it of items) {
      const k = dayKey(new Date(it.dueAt));
      const arr = map.get(k) || [];
      arr.push(it);
      map.set(k, arr);
    }
    return map;
  }, [items]);

  const { cells } = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const startOffset = first.getDay(); // 0=Sun
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const out: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(new Date(cursor.y, cursor.m, d));
    while (out.length % 7 !== 0) out.push(null);
    return { cells: out };
  }, [cursor]);

  const todayKey = dayKey(today);
  const selectedItems = (itemsByDay.get(selectedKey) || []).slice().sort(
    (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime(),
  );

  const step = (delta: number) => {
    setCursor((c) => {
      const m = c.m + delta;
      const y = c.y + Math.floor(m / 12);
      const mm = ((m % 12) + 12) % 12;
      return { y, m: mm };
    });
  };

  const selDate = new Date(selectedKey + 'T00:00:00');
  const selLabel = `${MONTHS[selDate.getMonth()].slice(0, 3)} ${selDate.getDate()}`;

  return (
    <div>
      {/* Month header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => step(-1)}
          className="w-8 h-8 rounded-full neu-raised flex items-center justify-center text-crwn-text-secondary hover:text-crwn-gold"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="text-sm font-semibold text-crwn-text">
          {MONTHS[cursor.m]} {cursor.y}
        </p>
        <button
          onClick={() => step(1)}
          className="w-8 h-8 rounded-full neu-raised flex items-center justify-center text-crwn-text-secondary hover:text-crwn-gold"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="text-center text-[11px] font-medium text-crwn-text-secondary py-1">
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const k = dayKey(d);
          const dayItems = itemsByDay.get(k) || [];
          const isToday = k === todayKey;
          const isSelected = k === selectedKey;
          const hasOverdue = dayItems.some((x) => x.status === 'overdue' || x.status === 'missed');
          return (
            <button
              key={i}
              onClick={() => setSelectedKey(k)}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-sm transition-colors ${
                isSelected
                  ? 'bg-crwn-gold text-crwn-bg font-semibold'
                  : isToday
                    ? 'border border-crwn-gold/50 text-crwn-text'
                    : 'text-crwn-text hover:bg-crwn-elevated/50'
              }`}
            >
              <span className={hasOverdue && !isSelected ? 'text-crwn-error' : undefined}>{d.getDate()}</span>
              {dayItems.length > 0 && (
                <span className="flex items-center gap-0.5 h-1.5">
                  {dayItems.slice(0, 3).map((it, j) => (
                    <span
                      key={j}
                      className={`w-1 h-1 rounded-full ${isSelected ? 'bg-crwn-bg/70' : dotClass(it.status)}`}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day's items */}
      <div className="mt-5">
        <p className="text-xs font-semibold text-crwn-text-secondary uppercase tracking-wide mb-2">
          {selLabel}
        </p>
        {selectedItems.length === 0 ? (
          <div className="neu-raised rounded-xl p-6 text-center">
            <Dot className="w-8 h-8 text-crwn-gold/30 mx-auto" />
            <p className="text-sm text-crwn-text-secondary">Nothing on this day.</p>
          </div>
        ) : (
          <div className="neu-raised rounded-xl p-4">
            <div className="divide-y divide-crwn-elevated">
              {selectedItems.map((it) => {
                const done = it.status === 'completed';
                const overdue = it.status === 'overdue' || it.status === 'missed';
                const isPromise = it.sourceType === 'fulfillment_event';
                const busy = busyId === it.id;
                return (
                  <div key={it.id} className="py-3 first:pt-1 last:pb-0 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-crwn-gold/80">
                          {ITEM_TYPE_LABEL[it.type]}
                        </span>
                        <span className={`text-[11px] font-medium ${overdue ? 'text-crwn-error' : done ? 'text-green-400' : 'text-crwn-text-secondary'}`}>
                          {done ? 'Done' : formatTime(new Date(it.dueAt))}
                        </span>
                      </div>
                      <p className={`text-sm font-medium truncate mt-0.5 ${done ? 'text-crwn-text-secondary line-through' : 'text-crwn-text'}`}>
                        {it.title}
                      </p>
                      {it.subtitle && <p className="text-xs text-crwn-text-secondary truncate">{it.subtitle}</p>}
                    </div>
                    {!done && isPromise && onComplete ? (
                      <button
                        onClick={() => onComplete(it)}
                        disabled={busy}
                        className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-crwn-gold/15 text-crwn-gold hover:bg-crwn-gold/25 transition-colors disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                        Done
                      </button>
                    ) : !done && it.cta && it.href && onOpen ? (
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
        )}
      </div>
    </div>
  );
}
