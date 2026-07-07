'use client';

import { useState, useEffect } from 'react';
import { Users, TrendingUp, MapPin } from 'lucide-react';

interface MovementStatsData {
  supporters: number;
  newThisWeek: number;
  topCity: string | null;
}

/**
 * Proof of Movement — the public aggregate stat row on the Movement tab.
 * Reads /api/artist/movement-stats (counts + top city only; no revenue,
 * no PII). Hides itself entirely when there is nothing to show yet.
 */
export function MovementStats({ artistId }: { artistId: string }) {
  const [stats, setStats] = useState<MovementStatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/artist/movement-stats?artistId=${encodeURIComponent(artistId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (typeof data?.supporters === 'number') {
          setStats({
            supporters: data.supporters,
            newThisWeek: data.newThisWeek || 0,
            topCity: data.topCity ?? null,
          });
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [artistId]);

  if (loading) {
    return (
      <section>
        <h2 className="text-lg font-semibold text-crwn-text mb-3">Proof of Movement</h2>
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-crwn-elevated bg-[#1a1a1a] p-4 animate-pulse">
              <div className="h-4 w-4 rounded bg-crwn-elevated mb-2" />
              <div className="h-5 w-10 rounded bg-crwn-elevated mb-1" />
              <div className="h-3 w-16 rounded bg-crwn-elevated" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  // Nothing to prove yet — hide the row instead of showing a wall of zeros.
  if (!stats || (stats.supporters === 0 && stats.newThisWeek === 0 && !stats.topCity)) {
    return null;
  }

  const tiles = [
    {
      icon: Users,
      label: 'Supporters',
      value: stats.supporters.toLocaleString(),
      accent: 'text-crwn-gold',
    },
    {
      icon: TrendingUp,
      label: 'New this week',
      value: `+${stats.newThisWeek.toLocaleString()}`,
      accent: 'text-green-400',
    },
    // Top city tile hides itself when we have no city data yet.
    ...(stats.topCity
      ? [{ icon: MapPin, label: 'Top city', value: stats.topCity, accent: 'text-crwn-gold' }]
      : []),
  ];

  return (
    <section>
      <h2 className="text-lg font-semibold text-crwn-text mb-3">Proof of Movement</h2>
      <div className={`grid gap-3 ${tiles.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-crwn-elevated bg-[#1a1a1a] p-4 min-w-0">
            <t.icon className={`w-4 h-4 ${t.accent} mb-2`} />
            <p className="text-lg font-semibold text-crwn-text truncate">{t.value}</p>
            <p className="text-xs text-crwn-text-secondary truncate">{t.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
