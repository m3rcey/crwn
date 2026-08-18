'use client';

import type { ReactNode } from 'react';
import { Lock, Check, ArrowDown } from 'lucide-react';
import type { GeneratedResult, LeadMagnetConfig, ResultSection } from '@/lib/leadMagnets/types';
import { EstimateDisclaimer } from './EstimateDisclaimer';

// Renders a generated result. In `preview` mode, only sections listed in
// config.publicPreviewSections are shown in full; the rest are shown locked
// (title + honest "unlock" prompt, never a deceptive blur).
export function LeadMagnetResult({
  config,
  result,
  mode,
  afterHero,
}: {
  config: LeadMagnetConfig;
  result: GeneratedResult;
  mode: 'preview' | 'full';
  /** Rendered directly under the hero, above the fold (e.g. email + signup CTAs). */
  afterHero?: ReactNode;
}) {
  const previewKeys = new Set(config.publicPreviewSections);
  // Loss-engine tools carry their sections on the RESULT itself (config.resultSections is empty)
  // and are never gated. The four legacy tools drive their section list and preview gating from
  // the config. Render whichever list applies, in order.
  const orderedSections: ResultSection[] = config.usesLossEngine
    ? result.sections
    : config.resultSections
        .map((d) => result.sections.find((s) => s.key === d.key))
        .filter((s): s is ResultSection => !!s);
  // Worth-style hero: pull the estimate tiles INTO the big-number card so the number and its
  // breakdown read as one unit at the very top.
  const heroTiles = result.heroValue ? orderedSections.find((s) => s.kind === 'projection') : undefined;
  const bodySections = heroTiles ? orderedSections.filter((s) => s !== heroTiles) : orderedSections;
  return (
    <div className="space-y-4">
      {result.heroValue ? (
        <div className="bg-gradient-to-b from-crwn-gold/10 to-crwn-surface border border-crwn-gold/30 rounded-2xl p-6 sm:p-8">
          <div className="text-center">
            {result.heroEyebrow && (
              <div className="text-xs uppercase tracking-wide text-crwn-text-secondary mb-2">{result.heroEyebrow}</div>
            )}
            <div className="text-5xl sm:text-6xl font-bold text-crwn-gold leading-none">
              {result.heroValue}
              <span className="text-2xl sm:text-3xl font-bold">{result.heroSuffix}</span>
            </div>
            {result.summary && (
              <p className="text-sm text-crwn-text-secondary mt-3 leading-relaxed max-w-md mx-auto">{result.summary}</p>
            )}
          </div>

          {/* PRIMARY CTA, inside the hero: holy-grail number, one sentence, then the action. The
              supporting metric tiles come AFTER it so the CTA stays in the first viewport. */}
          {afterHero && <div className="mt-5">{afterHero}</div>}

          {heroTiles?.metrics && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-6">
              {heroTiles.metrics.map((m, i) => (
                <div key={i} className="rounded-xl bg-crwn-bg/40 border border-crwn-elevated p-3">
                  <p className="text-lg font-bold text-crwn-gold leading-tight">{m.value}</p>
                  <p className="text-xs text-crwn-text-secondary mt-0.5 leading-tight">{m.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <h2 className="text-2xl font-bold text-crwn-text">{result.headline}</h2>
          <p className="text-sm text-crwn-text-secondary mt-1">{result.summary}</p>
          {afterHero && <div className="mt-5">{afterHero}</div>}
        </div>
      )}

      {bodySections.map((section) => {
        // Assumptions collapse behind a click so they never wall the page.
        if (section.kind === 'assumptions') {
          return (
            <details key={section.key} className="rounded-2xl bg-crwn-surface border border-crwn-elevated p-4">
              <summary className="text-sm font-semibold text-crwn-text cursor-pointer select-none">{section.title}</summary>
              <div className="mt-3">
                <SectionBody section={section} />
              </div>
            </details>
          );
        }
        const locked = mode === 'preview' && !config.usesLossEngine && !previewKeys.has(section.key);
        return (
          <div key={section.key} className="rounded-2xl bg-crwn-surface border border-crwn-elevated p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-crwn-text">{section.title}</h3>
              {locked && <Lock className="w-4 h-4 text-crwn-text-secondary" />}
            </div>
            {locked ? (
              <p className="text-sm text-crwn-text-secondary">Unlock your full result to see this.</p>
            ) : (
              <SectionBody section={section} />
            )}
          </div>
        );
      })}

      {config.requiresEstimateDisclaimer && <EstimateDisclaimer legal={config.requiresLegalDisclaimer} />}
    </div>
  );
}

function SectionBody({ section }: { section: ResultSection }) {
  switch (section.kind) {
    case 'score':
      return (
        <div>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold text-crwn-gold">{section.score}</span>
            <span className="text-crwn-text-secondary mb-1">/ {section.scoreMax}</span>
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-crwn-elevated overflow-hidden">
            <div className="h-full rounded-full bg-crwn-gold" style={{ width: `${((section.score || 0) / (section.scoreMax || 100)) * 100}%` }} />
          </div>
          {section.scoreLabel && <p className="text-sm text-crwn-text mt-2">{section.scoreLabel}</p>}
        </div>
      );

    case 'summary':
      return <p className="text-sm text-crwn-text leading-relaxed whitespace-pre-line">{section.text}</p>;

    case 'copy':
      return (
        <pre className="text-sm text-crwn-text leading-relaxed whitespace-pre-wrap font-sans bg-crwn-elevated/40 rounded-xl p-3">{section.text}</pre>
      );

    case 'list':
      return (
        <ul className="space-y-1.5">
          {(section.items || []).map((it, i) => (
            <li key={i} className="text-sm text-crwn-text flex gap-2">
              <span className="text-crwn-gold">•</span>
              <span>{it}</span>
            </li>
          ))}
        </ul>
      );

    case 'checklist':
    case 'nextSteps':
      return (
        <ul className="space-y-2">
          {(section.items || []).map((it, i) => (
            <li key={i} className="text-sm text-crwn-text flex gap-2 items-start">
              <Check className="w-4 h-4 text-crwn-gold shrink-0 mt-0.5" />
              <span>{it}</span>
            </li>
          ))}
        </ul>
      );

    case 'schedule':
      return (
        <div className="space-y-2">
          {(section.rows || []).map((r, i) => (
            <div key={i} className="flex gap-3 text-sm">
              <span className="text-crwn-gold font-medium shrink-0 w-16">{r.when}</span>
              <span className="text-crwn-text">{r.what}</span>
            </div>
          ))}
        </div>
      );

    case 'projection':
      return (
        <div className="grid grid-cols-2 gap-2">
          {(section.metrics || []).map((m, i) => (
            <div key={i} className="rounded-xl bg-crwn-elevated/40 border border-crwn-elevated p-3">
              <p className="text-xl font-bold text-crwn-gold leading-tight">{m.value}</p>
              <p className="text-xs text-crwn-text-secondary mt-0.5 leading-tight">{m.label}</p>
              {m.note && <p className="text-[10px] text-crwn-text-secondary/70 mt-0.5 leading-tight">{m.note}</p>}
            </div>
          ))}
        </div>
      );

    case 'assumptions':
      return (
        <ul className="space-y-1.5">
          {(section.items || []).map((it, i) => (
            <li key={i} className="text-xs text-crwn-text-secondary flex gap-2">
              <span className="text-crwn-text-secondary">•</span>
              <span>{it}</span>
            </li>
          ))}
        </ul>
      );

    // "How we get to the number": read the math in one glance, arrows down, total in gold.
    case 'derivation':
      return (
        <div className="space-y-1.5">
          {(section.metrics || []).map((m, i, arr) => {
            const last = i === arr.length - 1;
            return (
              <div key={i}>
                <div
                  className={`rounded-xl px-3 py-2.5 flex items-center justify-between gap-3 ${
                    last ? 'bg-crwn-gold/10 border border-crwn-gold/30' : 'bg-crwn-elevated/40 border border-crwn-elevated'
                  }`}
                >
                  <div className="min-w-0">
                    <p className={`text-sm leading-tight ${last ? 'text-crwn-gold font-medium' : 'text-crwn-text-secondary'}`}>{m.label}</p>
                    {m.note && <p className="text-[11px] text-crwn-text-secondary/70 mt-0.5 leading-tight">{m.note}</p>}
                  </div>
                  <p className={`font-bold whitespace-nowrap ${last ? 'text-xl text-crwn-gold' : 'text-lg text-crwn-text'}`}>{m.value}</p>
                </div>
                {!last && (
                  <div className="flex justify-center py-0.5">
                    <ArrowDown className="w-4 h-4 text-crwn-gold/50" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );

    case 'scenarios':
      return (
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
          {(section.metrics || []).map((m, i) => {
            const mid = i === 1;
            return (
              <div
                key={i}
                // `min-w-0` lets a grid item shrink below its content. Without it the track is
                // forced wider than the column and the money values spill into each other.
                className={`min-w-0 rounded-xl p-2 sm:p-3 text-center ${
                  mid ? 'bg-crwn-gold/10 border border-crwn-gold/30' : 'bg-crwn-elevated/40 border border-crwn-elevated'
                }`}
              >
                <p className="text-[9px] sm:text-[10px] uppercase tracking-wide text-crwn-text-secondary mb-1 leading-tight">{m.label}</p>
                <p className={`font-bold leading-tight break-words ${mid ? 'text-base sm:text-lg text-crwn-gold' : 'text-sm sm:text-base text-crwn-text'}`}>{m.value}</p>
                {m.note && <p className="text-[9px] sm:text-[10px] text-crwn-text-secondary mt-1 leading-tight">{m.note}</p>}
              </div>
            );
          })}
        </div>
      );

    case 'fanLoss': {
      const chips = (section.text || '')
        .replace(/^your fans miss\s*/i, '')
        .replace(/\.$/, '')
        .split(/,\s*(?:and\s+)?/)
        .map((s) => s.trim())
        .filter(Boolean);
      return (
        <div className="flex flex-wrap gap-2">
          {chips.map((c, i) => (
            <span key={i} className="text-xs text-crwn-text bg-crwn-elevated/60 border border-crwn-elevated rounded-full px-3 py-1.5">
              {c}
            </span>
          ))}
        </div>
      );
    }

    case 'flow':
      return (
        <div className="space-y-1.5">
          {(section.items || []).map((node, i, arr) => {
            const last = i === arr.length - 1;
            return (
              <div key={i}>
                <div
                  className={`rounded-xl px-3 py-2.5 text-center text-sm ${
                    last
                      ? 'bg-crwn-gold/10 border border-crwn-gold/30 text-crwn-gold font-semibold'
                      : 'bg-crwn-elevated/40 border border-crwn-elevated text-crwn-text'
                  }`}
                >
                  {node}
                </div>
                {!last && (
                  <div className="flex justify-center py-0.5">
                    <ArrowDown className="w-4 h-4 text-crwn-gold/50" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );

    default:
      return null;
  }
}
