// benefitCatalog.ts — the DISPLAY view of the benefit registry.
//
// Since 2026-09-03 the source of truth for every benefit (its identity, support class,
// delivery path, cadence policy, readiness resolver, fast action and config fields) is
// src/lib/benefitRegistry.ts. This module keeps the shape its ten existing readers expect
// (BENEFIT_CATALOG, BENEFIT_CATEGORIES, getBenefitDefinition, getBenefitDisplayText) and
// derives all of it from the registry, so a label lives in exactly one place.
//
// `available` maps to "may a NEW tier pick this": retired keys are false. Rows already in
// production under a retired key still resolve and still render on the tier card.

import {
  BENEFIT_REGISTRY,
  benefitDelivery,
  type BenefitType,
  type BenefitCategory,
  type BenefitDelivery,
  type ConfigField,
} from '@/lib/benefitRegistry';

export type { BenefitType, ConfigField };

export interface BenefitDefinition {
  type: BenefitType;
  label: string;
  description: string;
  icon: string;
  category: BenefitCategory;
  available: boolean;
  configFields?: ConfigField[];
}

function toDefinition(b: BenefitDelivery): BenefitDefinition {
  return {
    type: b.key,
    label: b.label,
    description: b.fanMeaning,
    icon: b.icon,
    category: b.category,
    available: b.support !== 'retired',
    ...(b.configFields ? { configFields: b.configFields } : {}),
  };
}

export const BENEFIT_CATALOG: BenefitDefinition[] = BENEFIT_REGISTRY.map(toDefinition);

export const BENEFIT_CATEGORIES = [
  { key: 'music', label: 'Music Access' },
  { key: 'community', label: 'Community' },
  { key: 'shop', label: 'Shop & Merch' },
  { key: 'experiences', label: 'Experiences' },
  { key: 'recognition', label: 'Recognition' },
] as const;

export function getBenefitDefinition(type: BenefitType): BenefitDefinition | undefined {
  const b = benefitDelivery(type);
  return b ? toDefinition(b) : undefined;
}

const CADENCE_WORD: Record<string, string> = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
};

function cadencePrefix(config: Record<string, unknown>): string {
  const f = config.frequency;
  return typeof f === 'string' && CADENCE_WORD[f] ? `${CADENCE_WORD[f]} ` : '';
}

function positiveDays(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The fan-facing line a tier card prints for a structured benefit row.
 *
 * The rule this encodes: a line names a schedule or a number ONLY when the artist put one in
 * the config. No frequency means no cadence word; no days_early means no day count. A
 * config-free row prints the registry's cardLine, which is an outcome, never a promise CRWN
 * made on the artist's behalf.
 */
export function getBenefitDisplayText(type: string, config: Record<string, unknown> = {}): string {
  const def = benefitDelivery(type);
  if (!def) return type;
  const cfg = config ?? {};

  switch (type) {
    case 'early_access': {
      const days = positiveDays(cfg.days_early);
      return days ? `${days}-day early access to new music` : def.cardLine;
    }
    case 'community_badge':
      return typeof cfg.badge_text === 'string' && cfg.badge_text.trim()
        ? `"${cfg.badge_text.trim()}" community badge`
        : 'Community badge';
    case 'shop_discount': {
      const pct = positiveDays(cfg.discount_percent) ?? 10;
      return `${pct}% shop discount`;
    }
    case 'credits_on_releases':
      return typeof cfg.role_label === 'string' && cfg.role_label.trim()
        ? `Credited as "${cfg.role_label.trim()}" on new releases`
        : def.cardLine;
    case 'one_on_one_call':
      return `${cadencePrefix(cfg)}1-on-1 video call`;
    case 'group_live_qa': {
      const title = typeof cfg.obligation_title === 'string' && cfg.obligation_title.trim() ? cfg.obligation_title.trim() : null;
      const prefix = cadencePrefix(cfg);
      if (title) return prefix ? `${prefix}${title.charAt(0).toLowerCase()}${title.slice(1)}` : title;
      return prefix ? `${prefix}group live session` : def.cardLine;
    }
    case 'exclusive_posts': {
      const title = typeof cfg.obligation_title === 'string' && cfg.obligation_title.trim() ? cfg.obligation_title.trim() : null;
      const prefix = cadencePrefix(cfg);
      if (title) return title;
      return prefix ? `${prefix}behind-the-scenes posts` : def.cardLine;
    }
    case 'creative_voting': {
      const prefix = cadencePrefix(cfg);
      return prefix ? `${prefix}creative votes` : def.cardLine;
    }
    case 'monthly_merch': {
      const prefix = cadencePrefix(cfg);
      return prefix ? `${prefix}merch drop` : def.cardLine;
    }
    case 'custom_experience':
      return typeof cfg.experience_text === 'string' && cfg.experience_text.trim() ? cfg.experience_text.trim() : def.cardLine;
    default:
      return def.cardLine;
  }
}
