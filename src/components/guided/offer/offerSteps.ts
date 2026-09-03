// offerSteps.ts: the PURE step model for "Build your offer" (Rise Mode Guided Setup, 2026-09-03).
//
// The pattern is fanCaptureSteps.ts: the decisions, their visibility and the resume position
// are data and functions with no I/O, unit-tested offline, and the component only renders.
//
// What this flow builds: a paid tier that promises real things CRWN can deliver, with one
// plain-English promise line, and optionally a cheaper way in. It writes the SAME rows
// TierManager writes (subscription_tiers.description, tier_benefits through /api/tier-benefits,
// and applyTemplateTier for a new rung), so the tier editor, the Promise to Delivery panel and
// the public card all read what this flow saved. No draft table: the tier IS the draft.

import { benefitDelivery, type BenefitPillar, PILLAR_COPY } from '@/lib/benefitRegistry';
import { deriveOfferTiers } from '@/lib/fanAutomations/offerTiers';
import { estimateMonthlyWorkload, PROMISE_BENEFITS, recurrenceFromConfig, workloadLabel } from '@/lib/promisePlan';
import { TIER_TEMPLATE_MAP } from '@/lib/tierTemplate';
import type { Recurrence } from '@/lib/fulfillment';

export type OfferStepKey =
  | 'tier'
  | 'create'
  | 'pillar'
  | 'benefits'
  | 'workload'
  | 'promise'
  | 'downsell'
  | 'downsell-price'
  | 'review';

export type OfferRequirement = 'launch' | 'truth' | 'recommended' | 'optional';

export interface OfferStepDef {
  key: OfferStepKey;
  group: string;
  title: string;
  subtitle: string;
  requirement: OfferRequirement;
}

export interface OfferTierRow {
  id: string;
  name: string;
  /** Integer cents. */
  price: number;
  description: string | null;
}

export interface DraftBenefit {
  benefit_type: string;
  config: Record<string, unknown>;
  sort_order: number;
}

export interface OfferState {
  /** The artist's ACTIVE tiers, every price. */
  tiers: OfferTierRow[];
  /** The tier this flow is building around. Null only while no paid tier exists. */
  selectedTierId: string | null;
  /** True when the pointer or the ladder answered the tier question, so it is not asked. */
  tierPreselected: boolean;
  /** Set only when the artist has no paid tier yet. */
  creating: { name: string; priceDollars: string } | null;
  pillar: BenefitPillar | null;
  benefits: DraftBenefit[];
  promise: string;
  wantsDownsell: boolean | null;
  downsell: { name: string; priceDollars: string };
  /** Plan cap: may another paid tier be created? */
  canAddPaidTier: boolean;
}

export const PROMISE_MAX = 200;
export const NAME_MAX = 40;

const paidTiers = (s: OfferState) => s.tiers.filter((t) => t.price > 0);

export function selectedTier(s: OfferState): OfferTierRow | null {
  return s.tiers.find((t) => t.id === s.selectedTierId) ?? null;
}

/** The tier the flow should build around when nothing chose one: the funnel's own derivation. */
export function defaultTierId(tiers: OfferTierRow[], pointerTierId: string | null): string | null {
  const paid = tiers.filter((t) => t.price > 0);
  if (pointerTierId && paid.some((t) => t.id === pointerTierId)) return pointerTierId;
  return deriveOfferTiers(paid.map((t) => ({ id: t.id, name: t.name, price: t.price }))).gold?.id ?? null;
}

/** Does a cheaper PAID tier already sit below the selected one? Then the downsell question is moot. */
export function hasCheaperPaidTier(s: OfferState): boolean {
  const sel = selectedTier(s);
  if (!sel) return false;
  return paidTiers(s).some((t) => t.id !== sel.id && t.price < sel.price);
}

export function priceCentsOf(dollars: string): number {
  const n = parseFloat(dollars);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
}

/** Recurring or artist-delivered work the selected benefits imply. Counts and minutes only. */
export function workloadFor(benefits: DraftBenefit[]): {
  minutes: number;
  label: string;
  manual: string[];
  recurring: { label: string; cadence: Recurrence }[];
} {
  const recurring: { label: string; cadence: Recurrence }[] = [];
  const manual: string[] = [];
  const promises: { fulfillmentType: string; recurrence: Recurrence }[] = [];
  for (const b of benefits) {
    const def = benefitDelivery(b.benefit_type);
    if (!def) continue;
    if (def.support === 'manual') manual.push(def.label);
    const cadence = recurrenceFromConfig(b.config);
    const promise = PROMISE_BENEFITS[b.benefit_type];
    if (cadence && promise) {
      recurring.push({ label: def.label, cadence });
      promises.push({ fulfillmentType: promise.fulfillmentType, recurrence: cadence });
    }
  }
  const minutes = estimateMonthlyWorkload(promises);
  return { minutes, label: workloadLabel(minutes), manual, recurring };
}

/** A promise line CRWN can suggest from what the artist already chose. Never empty. */
export function suggestPromise(s: OfferState): string {
  const sel = selectedTier(s);
  if (sel?.description?.trim()) return sel.description.trim().slice(0, PROMISE_MAX);
  const first = s.benefits.map((b) => benefitDelivery(b.benefit_type)).find((d) => !!d);
  if (first) return `${first.fanMeaning}`.slice(0, PROMISE_MAX);
  if (s.pillar) return PILLAR_COPY[s.pillar].line;
  return '';
}

/** The cheaper rung's default: the ladder's Silver, priced strictly below the primary. */
export function defaultDownsell(s: OfferState): { name: string; priceDollars: string } {
  const template = TIER_TEMPLATE_MAP.inner_circle;
  const sel = selectedTier(s);
  const primaryCents = sel ? sel.price : s.creating ? priceCentsOf(s.creating.priceDollars) : 0;
  let cents = template.priceCents;
  if (primaryCents > 0 && cents >= primaryCents) cents = Math.max(100, Math.floor(primaryCents / 2 / 100) * 100);
  const taken = s.tiers.some((t) => t.name.trim().toLowerCase() === template.name.toLowerCase());
  return { name: taken ? 'Starter' : template.name, priceDollars: String(cents / 100) };
}

export function visibleSteps(s: OfferState): OfferStepDef[] {
  const steps: OfferStepDef[] = [];
  const paid = paidTiers(s);
  if (paid.length === 0) {
    steps.push({
      key: 'create',
      group: 'The offer',
      title: 'Name your paid membership and set its price',
      subtitle: 'The tier fans pay for each month. You can change both later.',
      requirement: 'launch',
    });
  } else if (paid.length >= 2 && !s.tierPreselected) {
    steps.push({
      key: 'tier',
      group: 'The offer',
      title: 'Which paid experience are we building?',
      subtitle: 'The one your link will lead with. The others stay as they are.',
      requirement: 'launch',
    });
  }
  steps.push(
    {
      key: 'pillar',
      group: 'What fans get',
      title: 'What kind of experience should paying fans get?',
      subtitle: 'Pick the one closest to how you want fans to feel. It orders the next screen; it locks nothing.',
      requirement: 'truth',
    },
    {
      key: 'benefits',
      group: 'What fans get',
      title: 'What do fans actually get?',
      subtitle: 'Pick things you will enjoy delivering. CRWN handles the access.',
      requirement: 'launch',
    },
  );
  const w = workloadFor(s.benefits);
  if (w.minutes > 0 || w.manual.length > 0) {
    steps.push({
      key: 'workload',
      group: 'What fans get',
      title: 'Can you keep this up?',
      subtitle: 'What you just promised, as time. A promise you cannot keep costs more than one you never made.',
      requirement: 'recommended',
    });
  }
  steps.push({
    key: 'promise',
    group: 'The promise',
    title: 'In one line, what do fans get by joining?',
    subtitle: 'This is the sentence on your tier card and at the top of your sales page.',
    requirement: 'truth',
  });
  if (!hasCheaperPaidTier(s) && s.canAddPaidTier) {
    steps.push({
      key: 'downsell',
      group: 'The offer',
      title: 'Do you want a cheaper way in?',
      subtitle: 'A lower paid tier fans see when they say no to the main one. Optional.',
      requirement: 'optional',
    });
    if (s.wantsDownsell === true) {
      steps.push({
        key: 'downsell-price',
        group: 'The offer',
        title: 'Name the cheaper tier and set its price',
        subtitle: 'It must cost less than the main offer. CRWN fills it with the recommended rung; edit it any time.',
        requirement: 'optional',
      });
    }
  }
  steps.push({
    key: 'review',
    group: 'Review',
    title: 'Your offer',
    subtitle: 'Everything below is saved when you continue. Nothing is live until you turn the funnel on.',
    requirement: 'launch',
  });
  return steps;
}

export function canContinue(key: OfferStepKey, s: OfferState): boolean {
  switch (key) {
    case 'tier':
      return !!s.selectedTierId;
    case 'create':
      return !!s.creating && s.creating.name.trim().length > 0 && priceCentsOf(s.creating.priceDollars) > 0;
    case 'pillar':
      return !!s.pillar;
    case 'benefits':
      return s.benefits.some((b) => {
        const d = benefitDelivery(b.benefit_type);
        return !!d && d.support !== 'retired';
      });
    case 'promise':
      return s.promise.trim().length > 0;
    case 'downsell':
      return s.wantsDownsell !== null;
    case 'downsell-price': {
      const cents = priceCentsOf(s.downsell.priceDollars);
      const sel = selectedTier(s);
      const primaryCents = sel ? sel.price : s.creating ? priceCentsOf(s.creating.priceDollars) : 0;
      return s.downsell.name.trim().length > 0 && cents > 0 && cents < primaryCents;
    }
    default:
      return true;
  }
}

/**
 * Where to resume: the first decision the canonical rows do not already answer. Benefits and
 * the promise are read from the tier itself, so an artist who left halfway lands on the exact
 * open decision and is never asked a completed question again.
 */
export function resumeIndex(steps: OfferStepDef[], s: OfferState): number {
  const at = (k: OfferStepKey) => Math.max(0, steps.findIndex((st) => st.key === k));
  if (steps[0]?.key === 'create' || steps[0]?.key === 'tier') return 0;
  if (!canContinue('benefits', s)) return at('pillar');
  if (!s.promise.trim()) return at('promise');
  return at('review');
}
