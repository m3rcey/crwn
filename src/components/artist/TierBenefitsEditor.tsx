'use client';

import { useState, useEffect } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { BENEFIT_CATALOG, BENEFIT_CATEGORIES, getBenefitDefinition, type BenefitType } from '@/lib/benefitCatalog';
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react';

interface TierBenefit {
  id: string;
  tier_id: string;
  benefit_type: string;
  config: Record<string, any>;
  sort_order: number;
}

interface TierBenefitsEditorProps {
  tierId: string;
  artistId: string;
  initialBenefits: TierBenefit[];
  onChange: (benefits: { benefit_type: string; config: Record<string, any>; sort_order: number }[]) => void;
  disabled?: boolean;
}

export function TierBenefitsEditor({ tierId, artistId, initialBenefits, onChange, disabled }: TierBenefitsEditorProps) {
  const supabase = createBrowserSupabaseClient();
  const [selectedBenefits, setSelectedBenefits] = useState<Map<string, Record<string, any>>>(new Map());
  const [expandedCategory, setExpandedCategory] = useState<string | null>('music');

  // Initialize from props
  useEffect(() => {
    const map = new Map<string, Record<string, any>>();
    initialBenefits.forEach(b => {
      map.set(b.benefit_type, b.config || {});
    });
    setSelectedBenefits(map);
  }, [initialBenefits]);

  // Notify parent of changes
  useEffect(() => {
    const benefits = Array.from(selectedBenefits.entries()).map(([type, config], index) => ({
      benefit_type: type,
      config,
      sort_order: index,
    }));
    onChange(benefits);
  }, [selectedBenefits, onChange]);

  const toggleBenefit = (type: BenefitType) => {
    if (disabled) return;
    
    setSelectedBenefits(prev => {
      const next = new Map(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        const def = getBenefitDefinition(type);
        // Set default config values
        const config: Record<string, any> = {};
        def?.configFields?.forEach(field => {
          config[field.key] = field.default;
        });
        next.set(type, config);
      }
      return next;
    });
  };

  const updateConfig = (type: BenefitType, key: string, value: any) => {
    if (disabled) return;
    
    setSelectedBenefits(prev => {
      const next = new Map(prev);
      const current = next.get(type) || {};
      next.set(type, { ...current, [key]: value });
      return next;
    });
  };

  const isSelected = (type: string) => selectedBenefits.has(type);
  const getConfig = (type: string) => selectedBenefits.get(type) || {};

  return (
    <div className="space-y-4">
      {BENEFIT_CATEGORIES.map(category => {
        const categoryBenefits = BENEFIT_CATALOG.filter(b => b.category === category.key);
        if (categoryBenefits.length === 0) return null;

        const isExpanded = expandedCategory === category.key;

        return (
          <div key={category.key} className="border border-crwn-elevated rounded-lg overflow-hidden">
            {/* Category Header */}
            <button
              type="button"
              onClick={() => setExpandedCategory(isExpanded ? null : category.key)}
              className="w-full flex items-center justify-between px-4 py-3 bg-crwn-bg text-sm font-medium text-[#999] uppercase tracking-wider hover:bg-crwn-elevated/30"
            >
              <span>{category.label}</span>
              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {/* Benefits List */}
            {isExpanded && (
              <div className="p-4 space-y-3 bg-crwn-surface">
                {categoryBenefits.map(benefit => {
                  const selected = isSelected(benefit.type);
                  const config = getConfig(benefit.type);
                  const comingSoon = !benefit.available;

                  return (
                    <div
                      key={benefit.type}
                      className={`${comingSoon ? 'opacity-50' : ''} ${disabled ? 'pointer-events-none' : ''}`}
                    >
                      <label className={`flex items-start gap-3 cursor-pointer ${comingSoon ? 'cursor-not-allowed' : ''}`}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => !comingSoon && toggleBenefit(benefit.type as BenefitType)}
                          disabled={disabled || comingSoon}
                          className="mt-1 w-4 h-4 rounded border-crwn-elevated bg-crwn-bg text-crwn-gold focus:ring-crwn-gold disabled:opacity-50"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{benefit.icon}</span>
                            <span className="text-crwn-text font-medium">
                              {benefit.label}
                              {comingSoon && <span className="ml-2 text-xs text-crwn-text-secondary">(Coming Soon)</span>}
                            </span>
                          </div>
                          <p className="text-xs text-crwn-text-secondary mt-0.5">{benefit.description}</p>

                          {/* Config Fields */}
                          {selected && benefit.configFields && benefit.configFields.map(field => (
                            <div key={field.key} className="mt-2 ml-6">
                              <label className="block text-xs text-crwn-text-secondary mb-1">
                                {field.label}
                              </label>
                              {field.type === 'select' && field.options && (
                                <select
                                  value={config[field.key] ?? field.default}
                                  onChange={(e) => updateConfig(benefit.type as BenefitType, field.key, e.target.value)}
                                  disabled={disabled}
                                  className="w-full neu-inset px-3 py-2 text-crwn-text text-sm"
                                >
                                  {field.options.map(opt => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              )}
                              {field.type === 'number' && (
                                <input
                                  type="number"
                                  value={config[field.key] ?? field.default}
                                  onChange={(e) => updateConfig(benefit.type as BenefitType, field.key, parseInt(e.target.value))}
                                  disabled={disabled}
                                  min={field.min}
                                  max={field.max}
                                  className="w-full neu-inset px-3 py-2 text-crwn-text text-sm"
                                />
                              )}
                              {field.type === 'text' && (
                                <input
                                  type="text"
                                  value={config[field.key] ?? field.default}
                                  onChange={(e) => updateConfig(benefit.type as BenefitType, field.key, e.target.value)}
                                  disabled={disabled}
                                  maxLength={field.maxLength}
                                  className="w-full neu-inset px-3 py-2 text-crwn-text text-sm"
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
