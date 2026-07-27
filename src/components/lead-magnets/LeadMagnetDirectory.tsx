'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Search } from 'lucide-react';
import { LEAD_MAGNETS, EXTERNAL_TOOLS } from '@/lib/leadMagnets/registry';
import { LM_EVENTS, trackLeadMagnet } from '@/lib/leadMagnets/analytics';
import { getFunnelByToolKey } from '@/lib/opportunityFunnels/registry';

// Shared searchable directory. `basePath` = '/tools' (public) or '/artist/tools' (artist).
export function LeadMagnetDirectory({ basePath, context }: { basePath: string; context: 'public' | 'artist' }) {
  const router = useRouter();
  const [q, setQ] = useState('');

  useEffect(() => {
    trackLeadMagnet(LM_EVENTS.directoryViewed, { toolSlug: 'directory', context });
  }, [context]);

  // Wizard-driven tools and standalone-page tools (e.g. /worth) render through one path. Each is
  // enriched from the Opportunity Funnel layer with its lifecycle + promotion, so the directory
  // hides unpublished funnels and leads with the promoted ones. Defaults keep today's set intact:
  // every current tool is active + public, so nothing is hidden and only the ORDER changes.
  const allTools = useMemo(
    () =>
      [
        ...LEAD_MAGNETS.map((m) => ({
          key: m.slug,
          name: m.name,
          description: m.description,
          category: m.category,
          featureName: m.featureName,
          timeToComplete: m.timeToComplete,
          image: m.hero.image,
          imageAlt: m.hero.imageAlt,
          href: `${basePath}/${m.slug}`,
        })),
        ...EXTERNAL_TOOLS.map((t) => ({
          key: t.key,
          name: t.name,
          description: t.description,
          category: t.category,
          featureName: t.featureName,
          timeToComplete: t.timeToComplete,
          image: t.image,
          imageAlt: t.imageAlt,
          href: t.href,
        })),
      ]
        .map((m) => {
          const f = getFunnelByToolKey(m.key);
          return { ...m, promotionRank: f?.promotionRank ?? 100, funnel: f };
        })
        // Never surface a draft/internal/paused/archived or unsupported funnel; on the public
        // directory also require anonymous availability. Unknown keys default visible (fail open).
        .filter((m) => {
          if (!m.funnel) return true;
          const visible = m.funnel.lifecycle === 'active' && m.funnel.supported;
          return context === 'public' ? visible && m.funnel.anonymousAvailable : visible;
        }),
    [basePath, context],
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return allTools;
    return allTools.filter((m) => `${m.name} ${m.description} ${m.featureName} ${m.category}`.toLowerCase().includes(s));
  }, [q, allTools]);

  const categories = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const m of filtered) {
      const arr = map.get(m.category) || [];
      arr.push(m);
      map.set(m.category, arr);
    }
    // Within a category, promoted funnels (lower rank) lead. Categories are ordered by their most
    // promoted tool, so the primary funnel's category sits first without hardcoding any tier.
    const entries = Array.from(map.entries());
    for (const [, tools] of entries) {
      tools.sort((a, b) => a.promotionRank - b.promotionRank || a.name.localeCompare(b.name));
    }
    entries.sort(
      ([, a], [, b]) => Math.min(...a.map((t) => t.promotionRank)) - Math.min(...b.map((t) => t.promotionRank)),
    );
    return entries;
  }, [filtered]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-crwn-text">{context === 'artist' ? 'Artist tools' : 'CRWN artist tools'}</h1>
        <p className="text-sm text-crwn-text-secondary mt-1">
          Free tools that show you what you are leaving on the table. See the gap, then close it inside CRWN.
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
                key={m.key}
                onClick={() => router.push(m.href)}
                className="w-full flex items-center gap-4 rounded-2xl bg-crwn-surface border border-crwn-elevated p-4 text-left hover:border-crwn-gold/40"
              >
                <span className="relative w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-xl overflow-hidden border border-crwn-elevated">
                  <Image
                    src={m.image}
                    alt={m.imageAlt}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                </span>
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
