'use client';

// Compact "Upcoming for You" card for the fan Command Center. Self-fetches the
// fan calendar and shows the next few items with a link to the full My CRWN
// Calendar. Renders nothing while empty so it never clutters a brand-new fan.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarHeart, ArrowRight } from 'lucide-react';
import { type CalendarItem, ITEM_TYPE_LABEL, relativeDueLabel } from '@/lib/calendar';

export function UpcomingCalendarCard() {
  const router = useRouter();
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/my-calendar')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.items)) setItems(d.items.filter((i: CalendarItem) => i.status !== 'completed'));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  // Don't render anything until we know there's something to show.
  if (!loaded || items.length === 0) return null;

  const top = items.slice(0, 3);

  return (
    <div className="neu-raised rounded-xl p-4">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <CalendarHeart className="w-4 h-4 text-crwn-gold" />
          <p className="text-sm text-crwn-text font-medium">Upcoming for you</p>
        </div>
        <button
          onClick={() => router.push('/my-calendar')}
          className="text-xs font-semibold text-crwn-gold hover:text-crwn-gold/80 transition-colors flex items-center gap-1"
        >
          Calendar
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
      <div className="divide-y divide-crwn-elevated">
        {top.map((it) => (
          <button
            key={it.id}
            onClick={() => router.push(it.href || '/my-calendar')}
            className="w-full text-left py-3 first:pt-2 last:pb-0 flex items-center justify-between gap-3 hover:opacity-90"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-crwn-gold/80">
                  {ITEM_TYPE_LABEL[it.type]}
                </span>
                <span className={`text-[11px] font-medium ${it.status === 'overdue' ? 'text-crwn-error' : 'text-crwn-text-secondary'}`}>
                  {relativeDueLabel(it.dueAt)}
                </span>
              </div>
              <p className="text-sm font-medium text-crwn-text truncate mt-0.5">{it.title}</p>
              {it.subtitle && <p className="text-xs text-crwn-text-secondary truncate">{it.subtitle}</p>}
            </div>
            <ArrowRight className="w-4 h-4 text-crwn-text-secondary shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
