'use client';

import { Lock, Check } from 'lucide-react';
import type { GeneratedResult, LeadMagnetConfig, ResultSection } from '@/lib/leadMagnets/types';
import { EstimateDisclaimer } from './EstimateDisclaimer';

// Renders a generated result. In `preview` mode, only sections listed in
// config.publicPreviewSections are shown in full; the rest are shown locked
// (title + honest "unlock" prompt, never a deceptive blur).
export function LeadMagnetResult({
  config,
  result,
  mode,
}: {
  config: LeadMagnetConfig;
  result: GeneratedResult;
  mode: 'preview' | 'full';
}) {
  const previewKeys = new Set(config.publicPreviewSections);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-crwn-text">{result.headline}</h2>
        <p className="text-sm text-crwn-text-secondary mt-1">{result.summary}</p>
      </div>

      {config.resultSections.map((sectionDef) => {
        const section = result.sections.find((s) => s.key === sectionDef.key);
        if (!section) return null;
        const locked = mode === 'preview' && !previewKeys.has(section.key);
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
        <div className="space-y-2.5">
          {(section.metrics || []).map((m, i) => (
            <div key={i}>
              <div className="flex justify-between text-sm">
                <span className="text-crwn-text-secondary">{m.label}</span>
                <span className="text-crwn-text font-semibold">{m.value}</span>
              </div>
              {m.note && <p className="text-xs text-crwn-text-secondary">{m.note}</p>}
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

    default:
      return null;
  }
}
