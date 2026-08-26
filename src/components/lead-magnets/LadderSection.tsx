import { Check } from 'lucide-react';
import { RECOMMENDED_LADDER } from '@/lib/tierTemplate';

// "The ladder that holds it": the four recommended rungs, personalized with the calculator's
// own modeled numbers where it produced them.
//
// This section lived inline on /worth only, below the builder, while the other tier-modeling
// calculators (the all-in-one Opportunity Calculator, Between-Tour) showed the artist a ladder
// number with no ladder. One component now serves every surface that has a modeled ladder
// (founder decision 2026-08-25): the calculator pages render it directly under the result, and
// the tokenized ManyChat result pages render the same section in the same position.
//
// Names, prices and perk lines come from RECOMMENDED_LADDER (`src/lib/tierTemplate.ts`), the
// single source of truth for the recommended ladder, so this section can never advertise a
// tier the setup wizard will not build. The modeled overlay (price, projected fans) is matched
// by rung name including legacy names; a modeled list that matches nothing falls back to
// covering the paid rungs in order. Projections render only when the calculator produced them,
// and a zero projection renders nothing rather than "0 fans".
//
// Pure presentation, no hooks: usable from both client funnels and the server-rendered
// tokenized result page.

export interface ModeledLadderRung {
  name?: string;
  priceCents?: number;
  projectedSubs?: number;
}

const fmtCount = (n: number) => Math.floor(n).toLocaleString('en-US');
const norm = (s: string) => s.trim().toLowerCase().replace(/^the\s+/, '');
const fmtPrice = (cents: number) => (cents === 0 ? 'Free' : `$${Math.round(cents / 100)}/mo`);

export function LadderSection({ modeled = [] }: { modeled?: ModeledLadderRung[] }) {
  const list = Array.isArray(modeled) ? modeled.filter((m) => m && typeof m === 'object') : [];

  const byRung = new Map<string, ModeledLadderRung>();
  for (const def of RECOMMENDED_LADDER) {
    const names = [def.name, ...def.legacyNames].map(norm);
    const hit = list.find((m) => typeof m.name === 'string' && names.includes(norm(m.name)));
    if (hit) byRung.set(def.key, hit);
  }
  if (byRung.size === 0 && list.length > 0) {
    const paid = RECOMMENDED_LADDER.filter((d) => d.priceCents > 0);
    list.slice(0, paid.length).forEach((m, i) => byRung.set(paid[i].key, m));
  }

  const totalProjected = [...byRung.values()].reduce(
    (sum, m) => sum + (typeof m.projectedSubs === 'number' && Number.isFinite(m.projectedSubs) && m.projectedSubs > 0 ? m.projectedSubs : 0),
    0,
  );

  return (
    <section>
      <h2 className="text-2xl sm:text-3xl font-bold mb-2 text-center">The ladder that holds it</h2>
      <p className="text-crwn-text-secondary text-lg mb-5 max-w-2xl mx-auto text-center">
        A free front door to identify everyone, then paid levels for your most committed fans. The
        smallest group carries the most money, which is why one flat tier stalls well short of your
        number.
        {totalProjected > 0 ? ` Here is how your ~${fmtCount(totalProjected)} paying fans split across them:` : ''}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {RECOMMENDED_LADDER.map((def) => {
          const m = byRung.get(def.key);
          const cents = typeof m?.priceCents === 'number' && m.priceCents > 0 ? m.priceCents : def.priceCents;
          const fans = typeof m?.projectedSubs === 'number' && Number.isFinite(m.projectedSubs) && m.projectedSubs > 0 ? Math.floor(m.projectedSubs) : null;
          const accent = def.key === 'vault';
          return (
            <div
              key={def.key}
              className={`rounded-2xl p-5 border text-left ${
                accent ? 'border-crwn-gold/50 bg-crwn-gold/5' : 'border-crwn-elevated bg-crwn-surface'
              }`}
            >
              <div className="font-semibold">{m?.name || def.name}</div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-crwn-gold text-lg font-bold">{fmtPrice(cents)}</span>
                {fans !== null && (
                  <span className="text-xs text-crwn-text-secondary">{fans.toLocaleString('en-US')} fans</span>
                )}
              </div>
              <ul className="space-y-1.5">
                {def.benefits.slice(0, 5).map((b) => (
                  <li key={b.label} className="text-sm text-crwn-text-secondary flex items-start gap-2">
                    <Check className="w-4 h-4 text-crwn-gold shrink-0 mt-0.5" /> {b.label}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
