'use client';

// "What do fans get?" The tier benefit picker, in fan language.
//
// Replaced the 16-item checkbox grid of technical labels on 2026-09-03. Every card now reads as
// an OUTCOME (Hear music only members get, Help make creative decisions), and states four
// things from the registry: what fans get, how CRWN delivers it, what it will cost the artist,
// and whether it recurs. Three sections make the operational truth visible:
//
//   CRWN handles the delivery   supported benefits (recommended first, then More options)
//   You deliver this yourself   manual promises, and the artist's own lines
//   No longer supported         retired keys, shown only if this tier already carries one
//
// Inheritance: a benefit a cheaper tier already carries renders as "Included from <tier>",
// not as a second checkbox. Cadence is a second, opt-in question, default No fixed schedule;
// saving a benefit with that default writes NO frequency key, so selecting it alone never
// puts anything on the Promise Calendar (see tierObligations.ts).
//
// The write contract is unchanged: onChange receives the same {benefit_type, config,
// sort_order} rows /api/tier-benefits and TierManager always wrote.

import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { OptionSelect } from '@/components/ui/OptionSelect';
import {
  BENEFIT_REGISTRY,
  PILLAR_ORDER,
  PILLAR_COPY,
  effortLabel,
  recommendedBenefits,
  type BenefitDelivery,
  type BenefitPillar,
  type BenefitType,
  type ConfigField,
} from '@/lib/benefitRegistry';
import { getBenefitDisplayText } from '@/lib/benefitCatalog';

interface SelectedBenefit {
  benefit_type: BenefitType;
  config: Record<string, any>;
  sort_order: number;
}

/** A benefit a cheaper tier on this ladder already carries. */
export interface InheritedBenefit {
  benefit_type: string;
  fromTierName: string;
}

interface TierBenefitsSelectorProps {
  tierId?: string;
  initialBenefits?: SelectedBenefit[];
  onChange: (benefits: SelectedBenefit[]) => void;
  readOnly?: boolean;
  /** Benefits carried by tiers priced below the one being edited. */
  inherited?: InheritedBenefit[];
  /**
   * The pillar to list first (Rise Mode Guided Setup: the artist named the kind of experience
   * on the previous screen). Ordering only; every pillar still renders.
   */
  pillarFirst?: BenefitPillar | null;
}

const RECOMMENDED = recommendedBenefits();
const ADDITIONAL = BENEFIT_REGISTRY.filter((b) => b.support === 'additional');
const MANUAL = BENEFIT_REGISTRY.filter((b) => b.support === 'manual');
const RETIRED = BENEFIT_REGISTRY.filter((b) => b.support === 'retired');

/** Config defaults. An empty-string default (No fixed schedule, Decided per release) writes nothing. */
function defaultConfig(def: BenefitDelivery): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of def.configFields ?? []) {
    if (f.default !== '') out[f.key] = f.default;
  }
  return out;
}

export function TierBenefitsSelector({
  initialBenefits = [],
  onChange,
  readOnly = false,
  inherited = [],
  pillarFirst = null,
}: TierBenefitsSelectorProps) {
  const [selected, setSelected] = useState<Record<string, SelectedBenefit>>({});
  const [showMore, setShowMore] = useState(false);
  const pillarOrder = useMemo<readonly BenefitPillar[]>(
    () => (pillarFirst ? [pillarFirst, ...PILLAR_ORDER.filter((p) => p !== pillarFirst)] : PILLAR_ORDER),
    [pillarFirst],
  );

  useEffect(() => {
    const map: Record<string, SelectedBenefit> = {};
    initialBenefits.forEach((b, i) => {
      map[b.benefit_type] = { ...b, config: b.config ?? {}, sort_order: b.sort_order ?? i };
    });
    setSelected(map);
    if (initialBenefits.some((b) => ADDITIONAL.some((a) => a.key === b.benefit_type))) setShowMore(true);
  }, [initialBenefits]);

  const inheritedByKey = useMemo(() => new Map(inherited.map((i) => [i.benefit_type, i.fromTierName])), [inherited]);

  const emit = (next: Record<string, SelectedBenefit>) => {
    setSelected(next);
    onChange(Object.values(next).sort((a, b) => a.sort_order - b.sort_order));
  };

  const toggle = (def: BenefitDelivery) => {
    if (readOnly) return;
    const next = { ...selected };
    if (next[def.key]) {
      delete next[def.key];
    } else {
      next[def.key] = { benefit_type: def.key, config: defaultConfig(def), sort_order: Object.keys(next).length };
    }
    emit(next);
  };

  const setConfig = (key: BenefitType, field: string, value: unknown) => {
    if (readOnly || !selected[key]) return;
    const config = { ...selected[key].config };
    // An empty choice means "no promise": the key is REMOVED, never stored as ''.
    if (value === '' || value === null || value === undefined) delete config[field];
    else config[field] = value;
    emit({ ...selected, [key]: { ...selected[key], config } });
  };

  const renderField = (def: BenefitDelivery, field: ConfigField) => {
    const current = selected[def.key]?.config?.[field.key];
    if (field.type === 'select') {
      const options = (field.options ?? []).map((o) => ({ value: String(o.value), label: o.label }));
      const value = current === undefined || current === null ? String(field.default) : String(current);
      return (
        <div key={field.key} className="mt-3">
          <p className="text-xs text-crwn-text-secondary mb-1">{field.label}</p>
          <OptionSelect
            options={options}
            value={value}
            onChange={(v) => {
              const opt = (field.options ?? []).find((o) => String(o.value) === v);
              setConfig(def.key, field.key, opt ? opt.value : v);
            }}
          />
        </div>
      );
    }
    if (field.type === 'number') {
      return (
        <div key={field.key} className="mt-3">
          <label className="block text-xs text-crwn-text-secondary mb-1">{field.label}</label>
          <input
            type="number"
            min={field.min}
            max={field.max}
            value={current ?? field.default}
            onChange={(e) => setConfig(def.key, field.key, parseInt(e.target.value) || 0)}
            className="w-full bg-crwn-bg border border-crwn-elevated rounded-lg px-3 py-2 text-sm text-crwn-text"
            disabled={readOnly}
          />
        </div>
      );
    }
    return (
      <div key={field.key} className="mt-3">
        <label className="block text-xs text-crwn-text-secondary mb-1">{field.label}</label>
        <input
          type="text"
          maxLength={field.maxLength}
          value={current ?? ''}
          onChange={(e) => setConfig(def.key, field.key, e.target.value)}
          placeholder={field.label}
          className="w-full bg-crwn-bg border border-crwn-elevated rounded-lg px-3 py-2 text-sm text-crwn-text"
          disabled={readOnly}
        />
      </div>
    );
  };

  const card = (def: BenefitDelivery) => {
    const isSelected = !!selected[def.key];
    const inheritedFrom = inheritedByKey.get(def.key);
    const config = selected[def.key]?.config ?? {};
    const preview = getBenefitDisplayText(def.key, config);

    if (inheritedFrom && !isSelected) {
      return (
        <div key={def.key} className="border border-crwn-elevated/60 rounded-xl p-3 opacity-80">
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 rounded border-2 border-crwn-gold/50 bg-crwn-gold/20 flex items-center justify-center mt-0.5 shrink-0">
              <Check className="w-3 h-3 text-crwn-gold" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg leading-none">{def.icon}</span>
                <span className="font-medium text-crwn-text text-sm">{def.label}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-crwn-gold/15 text-crwn-gold">Included from {inheritedFrom}</span>
              </div>
              <p className="text-xs text-crwn-text-secondary mt-0.5">
                Members of this tier already get this. Nothing to add again.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        key={def.key}
        className={`border rounded-xl p-3 transition-colors ${
          isSelected ? 'border-crwn-gold bg-crwn-gold/5' : 'border-crwn-elevated hover:border-crwn-gold/30'
        }`}
      >
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={isSelected} onChange={() => toggle(def)} disabled={readOnly} className="sr-only" />
          <div
            className={`w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 shrink-0 ${
              isSelected ? 'bg-crwn-gold border-crwn-gold' : 'border-crwn-elevated bg-crwn-bg'
            }`}
          >
            {isSelected && <Check className="w-3 h-3 text-crwn-bg" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg leading-none">{def.icon}</span>
              <span className="font-medium text-crwn-text text-sm">{def.label}</span>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full ${
                  def.support === 'manual' ? 'bg-crwn-elevated text-crwn-text-secondary' : 'bg-crwn-gold/15 text-crwn-gold'
                }`}
              >
                {def.support === 'manual' ? 'You deliver this' : 'CRWN delivers'}
              </span>
            </div>
            <p className="text-xs text-crwn-text-secondary mt-0.5">{def.fanMeaning}</p>
            <p className="text-[11px] text-crwn-text-secondary/80 mt-1">
              {def.delivery} <span className="text-crwn-text-secondary">{effortLabel(def, config)}.</span>
            </p>
          </div>
        </label>

        {isSelected && (
          <div className="ml-8">
            {def.configFields?.map((f) => renderField(def, f))}
            {def.disclaimer && <p className="text-[11px] text-crwn-text-secondary/80 mt-2">{def.disclaimer}</p>}
            <p className="text-[11px] text-crwn-text-secondary mt-2">
              On your tier card: <span className="text-crwn-text">{preview}</span>
            </p>
          </div>
        )}
      </div>
    );
  };

  if (readOnly && Object.keys(selected).length === 0) {
    return <p className="text-crwn-text-secondary text-sm italic">No benefits selected for this tier.</p>;
  }

  if (readOnly) {
    const chosen = BENEFIT_REGISTRY.filter((b) => selected[b.key]);
    return <div className="space-y-2">{chosen.map(card)}</div>;
  }

  const retiredHere = RETIRED.filter((b) => selected[b.key]);

  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-sm font-semibold text-crwn-text">CRWN handles the delivery</h4>
        <p className="text-xs text-crwn-text-secondary mt-0.5 mb-3">
          Pick a promise and CRWN connects it to the place you keep it, tells you when it is ready,
          and puts you one tap from delivering it.
        </p>
        <div className="space-y-4">
          {pillarOrder.map((pillar) => {
            const defs = RECOMMENDED.filter((b) => b.pillar === pillar);
            if (defs.length === 0) return null;
            return (
              <div key={pillar}>
                <p className="text-[11px] uppercase tracking-wide text-crwn-text-secondary mb-1.5">
                  {PILLAR_COPY[pillar].title} <span className="normal-case tracking-normal">· {PILLAR_COPY[pillar].line}</span>
                </p>
                <div className="space-y-2">{defs.map(card)}</div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="mt-3 text-sm text-crwn-gold hover:underline"
        >
          {showMore ? 'Hide more options' : 'More options'}
        </button>
        {showMore && (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-crwn-text-secondary">
              Real and enforced, but not part of the recommended ladder.
            </p>
            {ADDITIONAL.map(card)}
          </div>
        )}
      </div>

      <div>
        <h4 className="text-sm font-semibold text-crwn-text">You deliver this yourself</h4>
        <p className="text-xs text-crwn-text-secondary mt-0.5 mb-3">
          CRWN prints these on your card and cannot check or deliver them. Only promise what you
          can keep by hand.
        </p>
        <div className="space-y-2">{MANUAL.map(card)}</div>
      </div>

      {retiredHere.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-crwn-text">No longer supported</h4>
          <p className="text-xs text-crwn-text-secondary mt-0.5 mb-3">
            This tier still carries a benefit CRWN no longer offers. Nothing in CRWN delivers it:
            untick it, or replace it with a supported one above.
          </p>
          <div className="space-y-2">{retiredHere.map(card)}</div>
        </div>
      )}
    </div>
  );
}

export { getBenefitDisplayText };
export type { SelectedBenefit };
