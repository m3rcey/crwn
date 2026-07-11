'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { LEAD_MAGNETS } from '@/lib/leadMagnets/registry';
import { LM_EVENTS, trackLeadMagnet } from '@/lib/leadMagnets/analytics';

// Shared searchable directory. `basePath` = '/tools' (public) or '/artist/tools' (artist).
export function LeadMagnetDirectory({ basePath, context }: { basePath: string; context: 'public' | 'artist' }) {
  const router = useRouter();
  const [q, setQ] = useState('');

  useEffect(() => {
    trackLeadMagnet(LM_EVENTS.directoryViewed, { toolSlug: 'directory', context });
  }, [context]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return LEAD_MAGNETS;
    return LEAD_MAGNETS.filter((m) => `${m.name} ${m.description} ${m.featureName} ${m.category}`.toLowerCase().includes(s));
  }, [q]);

  const categories = useMemo(() => {
    const map = new Map<string, typeof LEAD_MAGNETS>();
    for (const m of filtered) {
      const arr = map.get(m.category) || [];
      arr.push(m);
      map.set(m.category, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-crwn-text">{context === 'artist' ? 'Artist tools' : 'CRWN artist tools'}</h1>
        <p className="text-sm text-crwn-text-secondary mt-1">
          Free tools to plan your next move. Build a result, then bring it into CRWN.
        </p>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-crwn-text-secondary" />
        <input
          className="w-full bg-crwn-surface border border-crwn-elevated rounded-xl pl-10 pr-4 py-3 text-base text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold"
          placeholder="Search tools"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {categories.map(([cat, tools]) => (
        <div key={cat} className="mb-7">
          <div className="text-xs font-semibold uppercase tracking-wide text-crwn-text-secondary mb-3">{cat}</div>
          <div className="space-y-2">
            {tools.map((m) => (
              <button
                key={m.slug}
                onClick={() => router.push(`${basePath}/${m.slug}`)}
                className="w-full flex items-start gap-3 rounded-2xl bg-crwn-surface border border-crwn-elevated p-4 text-left hover:border-crwn-gold/40"
              >
                <span className="text-2xl shrink-0">{m.icon}</span>
                <span className="min-w-0">
                  <span className="block text-base font-semibold text-crwn-text">{m.name}</span>
                  <span className="block text-sm text-crwn-text-secondary mt-0.5">{m.description}</span>
                  <span className="block text-xs text-crwn-gold mt-1.5">
                    {m.featureName} · {m.timeToComplete}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && <p className="text-sm text-crwn-text-secondary text-center py-8">No tools match that search.</p>}
    </div>
  );
}
