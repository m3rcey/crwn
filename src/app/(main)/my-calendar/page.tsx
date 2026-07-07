'use client';

// My CRWN Calendar — the fan's view of everything they get, can attend, can earn
// from, and owe (billing). Phase 1 projects existing artist deadlines + the fan's
// renewals; reminders / Google sync come later.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import {
  Loader2, CalendarHeart, Radio, Flag, DollarSign, CreditCard, ArrowRight, Sparkles,
} from 'lucide-react';
import {
  type CalendarItem,
  type CalendarItemType,
  ITEM_TYPE_LABEL,
  relativeDueLabel,
} from '@/lib/calendar';

type FanTab = 'upcoming' | 'events' | 'missions' | 'earnings' | 'billing';

const TABS: { id: FanTab; label: string; match: (t: CalendarItemType) => boolean }[] = [
  { id: 'upcoming', label: 'Upcoming', match: () => true },
  { id: 'events', label: 'Events', match: (t) => t === 'livestream' },
  { id: 'missions', label: 'Missions', match: (t) => t === 'mission' || t === 'proof_of_demand' || t === 'city_unlock' },
  { id: 'earnings', label: 'Earnings', match: (t) => t === 'bounty' },
  { id: 'billing', label: 'Billing', match: (t) => t === 'renewal' },
];

const TYPE_ICON: Record<CalendarItemType, typeof Radio> = {
  promise: Sparkles,
  campaign: Flag,
  mission: Flag,
  city_unlock: Flag,
  bounty: DollarSign,
  proof_of_demand: Flag,
  livestream: Radio,
  renewal: CreditCard,
};

export default function MyCalendarPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<FanTab>('upcoming');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    fetch('/api/my-calendar')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.items)) setItems(d.items);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [user, authLoading, router]);

  const activeTab = TABS.find((t) => t.id === tab)!;
  const visible = useMemo(
    () => items.filter((it) => it.status !== 'completed' && activeTab.match(it.type)),
    [items, activeTab],
  );
  const next = items.find((it) => it.status !== 'completed');

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto page-fade-in">
      <div className="mb-1 flex items-center gap-2">
        <CalendarHeart className="w-5 h-5 text-crwn-gold" />
        <h1 className="text-2xl font-bold text-crwn-text">My CRWN Calendar</h1>
      </div>
      <p className="text-sm text-crwn-text-secondary mb-6">
        Everything you get, can attend, can earn from, and when it&apos;s happening.
      </p>

      {items.length === 0 ? (
        <div className="neu-raised rounded-xl p-8 text-center">
          <CalendarHeart className="w-12 h-12 text-crwn-gold/30 mx-auto mb-3" />
          <p className="text-crwn-text font-medium">Nothing on your calendar yet</p>
          <p className="text-sm text-crwn-text-secondary mt-2 max-w-sm mx-auto">
            Subscribe to an artist and their lives, drops, missions and earning windows
            show up here so you never miss what you paid for.
          </p>
          <button
            onClick={() => router.push('/explore')}
            className="mt-4 inline-flex items-center gap-1.5 bg-crwn-gold text-crwn-bg text-sm font-semibold px-5 py-2 rounded-full hover:bg-crwn-gold/90 transition-colors"
          >
            Explore artists
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Next up hero */}
          {next && (
            <div className="neu-raised rounded-xl p-5 border border-crwn-gold/20">
              <p className="text-xs font-semibold text-crwn-gold uppercase tracking-wide mb-2">
                Next up
              </p>
              <p className="text-lg font-bold text-crwn-text">{next.title}</p>
              <p className="text-sm text-crwn-text-secondary mt-1">
                {next.subtitle ? `${next.subtitle} · ` : ''}{relativeDueLabel(next.dueAt)}
              </p>
              {next.cta && next.href && (
                <button
                  onClick={() => router.push(next.href!)}
                  className="mt-4 inline-flex items-center gap-1.5 bg-crwn-gold text-crwn-bg text-sm font-semibold px-5 py-2 rounded-full hover:bg-crwn-gold/90 transition-colors"
                >
                  {next.cta}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-5 border-b border-crwn-elevated overflow-x-auto">
            {TABS.map((t) => {
              const count = items.filter((it) => it.status !== 'completed' && t.match(it.type)).length;
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

          {/* Item list */}
          {visible.length === 0 ? (
            <div className="neu-raised rounded-xl p-8 text-center">
              <p className="text-sm text-crwn-text-secondary">Nothing here right now.</p>
            </div>
          ) : (
            <div className="neu-raised rounded-xl p-4">
              <div className="divide-y divide-crwn-elevated">
                {visible.map((it) => {
                  const Icon = TYPE_ICON[it.type];
                  const overdue = it.status === 'overdue';
                  return (
                    <div key={it.id} className="py-3 first:pt-1 last:pb-0 flex items-center justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-crwn-gold/10 flex items-center justify-center shrink-0 mt-0.5">
                          <Icon className="w-4 h-4 text-crwn-gold" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-crwn-gold/80">
                              {ITEM_TYPE_LABEL[it.type]}
                            </span>
                            <span className={`text-[11px] font-medium ${overdue ? 'text-crwn-error' : 'text-crwn-text-secondary'}`}>
                              {relativeDueLabel(it.dueAt)}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-crwn-text truncate mt-0.5">{it.title}</p>
                          {it.subtitle && (
                            <p className="text-xs text-crwn-text-secondary truncate">{it.subtitle}</p>
                          )}
                          {it.reward && (
                            <p className="text-xs text-green-400 font-semibold mt-0.5">{it.reward}</p>
                          )}
                        </div>
                      </div>
                      {it.cta && it.href && (
                        <button
                          onClick={() => router.push(it.href!)}
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
          )}
        </div>
      )}
    </div>
  );
}
