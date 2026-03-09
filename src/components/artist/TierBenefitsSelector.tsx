'use client';

import { useState, useEffect } from 'react';
import { 
  BENEFIT_CATALOG, 
  BENEFIT_CATEGORIES, 
  BenefitType, 
  BenefitDefinition,
  ConfigField,
  getBenefitDisplayText 
} from '@/lib/benefitCatalog';
import { Check } from 'lucide-react';

interface SelectedBenefit {
  benefit_type: BenefitType;
  config: Record<string, any>;
  sort_order: number;
}

interface TierBenefitsSelectorProps {
  tierId?: string;
  initialBenefits?: SelectedBenefit[];
  onChange: (benefits: SelectedBenefit[]) => void;
  readOnly?: boolean;
}

export function TierBenefitsSelector({ 
  tierId, 
  initialBenefits = [], 
  onChange,
  readOnly = false 
}: TierBenefitsSelectorProps) {
  const [selectedBenefits, setSelectedBenefits] = useState<Record<string, SelectedBenefit>>({});
  const [expandedCategory, setExpandedCategory] = useState<string | null>('music');

  // Initialize from initialBenefits
  useEffect(() => {
    const benefitMap: Record<string, SelectedBenefit> = {};
    initialBenefits.forEach((benefit, index) => {
      benefitMap[benefit.benefit_type] = {
        ...benefit,
        sort_order: benefit.sort_order ?? index
      };
    });
    setSelectedBenefits(benefitMap);
  }, [initialBenefits]);

  const toggleBenefit = (benefitType: BenefitType) => {
    if (readOnly) return;

    const newSelected = { ...selectedBenefits };
    
    if (newSelected[benefitType]) {
      delete newSelected[benefitType];
    } else {
      const definition = BENEFIT_CATALOG.find(b => b.type === benefitType);
      const defaultConfig: Record<string, any> = {};
      
      // Set default values for config fields
      definition?.configFields?.forEach(field => {
        defaultConfig[field.key] = field.default;
      });
      
      newSelected[benefitType] = {
        benefit_type: benefitType,
        config: defaultConfig,
        sort_order: Object.keys(newSelected).length
      };
    }
    
    setSelectedBenefits(newSelected);
    onChange(Object.values(newSelected));
  };

  const updateBenefitConfig = (benefitType: BenefitType, key: string, value: any) => {
    if (readOnly) return;

    const newSelected = {
      ...selectedBenefits,
      [benefitType]: {
        ...selectedBenefits[benefitType],
        config: {
          ...selectedBenefits[benefitType].config,
          [key]: value
        }
      }
    };
    
    setSelectedBenefits(newSelected);
    onChange(Object.values(newSelected));
  };

  const renderConfigField = (benefitType: BenefitType, field: ConfigField) => {
    const benefit = selectedBenefits[benefitType];
    if (!benefit) return null;

    const value = benefit.config[field.key] ?? field.default;

    switch (field.type) {
      case 'select':
        return (
          <div key={field.key} className="mt-2 ml-7">
            <label className="block text-xs text-crwn-text-secondary mb-1">
              {field.label}
            </label>
            <select
              value={value}
              onChange={(e) => updateBenefitConfig(benefitType, field.key, 
                field.options?.[0]?.value === 'number' 
                  ? parseInt(e.target.value) 
                  : e.target.value
              )}
              className="w-full bg-crwn-bg border border-crwn-elevated rounded-lg px-3 py-2 text-sm text-crwn-text"
              disabled={readOnly}
            >
              {field.options?.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        );
      
      case 'number':
        return (
          <div key={field.key} className="mt-2 ml-7">
            <label className="block text-xs text-crwn-text-secondary mb-1">
              {field.label}
            </label>
            <input
              type="number"
              min={field.min}
              max={field.max}
              value={value}
              onChange={(e) => updateBenefitConfig(benefitType, field.key, parseInt(e.target.value) || 0)}
              className="w-full bg-crwn-bg border border-crwn-elevated rounded-lg px-3 py-2 text-sm text-crwn-text"
              disabled={readOnly}
            />
          </div>
        );
      
      case 'text':
        return (
          <div key={field.key} className="mt-2 ml-7">
            <label className="block text-xs text-crwn-text-secondary mb-1">
              {field.label}
            </label>
            <input
              type="text"
              maxLength={field.maxLength}
              value={value}
              onChange={(e) => updateBenefitConfig(benefitType, field.key, e.target.value)}
              placeholder={field.label}
              className="w-full bg-crwn-bg border border-crwn-elevated rounded-lg px-3 py-2 text-sm text-crwn-text"
              disabled={readOnly}
            />
          </div>
        );
      
      default:
        return null;
    }
  };

  const renderBenefitItem = (benefit: BenefitDefinition) => {
    const isSelected = !!selectedBenefits[benefit.type];
    const isAvailable = benefit.available;

    return (
      <div 
        key={benefit.type}
        className={`border rounded-lg p-3 transition-all ${
          isSelected 
            ? 'border-crwn-gold bg-crwn-gold/5' 
            : 'border-crwn-elevated hover:border-crwn-gold/30'
        } ${!isAvailable ? 'opacity-50' : ''}`}
      >
        <label className="flex items-start gap-3 cursor-pointer">
          <div className="relative flex-shrink-0 mt-0.5">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleBenefit(benefit.type)}
              disabled={readOnly || !isAvailable}
              className="sr-only"
            />
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              isSelected 
                ? 'bg-crwn-gold border-crwn-gold' 
                : 'border-crwn-elevated bg-crwn-bg'
            }`}>
              {isSelected && <Check className="w-3 h-3 text-crwn-bg" />}
            </div>
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-lg">{benefit.icon}</span>
              <span className="font-medium text-crwn-text text-sm">
                {benefit.label}
              </span>
              {!isAvailable && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-crwn-elevated text-crwn-text-secondary">
                  Coming Soon
                </span>
              )}
            </div>
            <p className="text-xs text-crwn-text-secondary mt-0.5">
              {benefit.description}
            </p>
          </div>
        </label>

        {/* Config fields */}
        {isSelected && benefit.configFields?.map(field => renderConfigField(benefit.type, field))}
      </div>
    );
  };

  if (readOnly && Object.keys(selectedBenefits).length === 0) {
    return (
      <p className="text-crwn-text-secondary text-sm italic">
        No benefits selected for this tier.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {BENEFIT_CATEGORIES.map(category => {
        const categoryBenefits = BENEFIT_CATALOG.filter(b => b.category === category.key);
        const hasSelectedInCategory = categoryBenefits.some(b => selectedBenefits[b.type]);
        
        if (readOnly) {
          // In readOnly mode, only show categories with selected benefits
          const selectedInCategory = categoryBenefits.filter(b => selectedBenefits[b.type]);
          if (selectedInCategory.length === 0) return null;
          
          return (
            <div key={category.key}>
              <h4 className="text-sm font-semibold text-crwn-gold mb-2">
                {category.label}
              </h4>
              <div className="space-y-2">
                {selectedInCategory.map(benefit => renderBenefitItem(benefit))}
              </div>
            </div>
          );
        }

        return (
          <div key={category.key} className="border border-crwn-elevated rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedCategory(
                expandedCategory === category.key ? null : category.key
              )}
              className="w-full flex items-center justify-between px-4 py-3 bg-crwn-surface hover:bg-crwn-elevated transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-crwn-text text-sm">
                  {category.label}
                </span>
                {hasSelectedInCategory && (
                  <span className="w-2 h-2 rounded-full bg-crwn-gold" />
                )}
              </div>
              <svg 
                className={`w-4 h-4 text-crwn-text-secondary transition-transform ${
                  expandedCategory === category.key ? 'rotate-180' : ''
                }`}
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {expandedCategory === category.key && (
              <div className="p-4 space-y-3 bg-crwn-bg">
                {categoryBenefits.map(benefit => renderBenefitItem(benefit))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export { getBenefitDisplayText };
export type { SelectedBenefit };
