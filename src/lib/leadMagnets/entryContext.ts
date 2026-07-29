// Entry context: which video or keyword brought this artist here.
//
// The individual calculators keep their own acquisition role, so a Vault video, a Share-to-Earn
// video and a Streaming Loss video all still have somewhere specific to land. When one of them
// points at the unified calculator instead, the visitor must not be met with a generic
// questionnaire that ignores what they clicked. This module reorders the wizard so the questions
// their video was about come first.
//
// It is deliberately ONLY a reordering. Adding or dropping questions per entry point would mean
// different entries produce different models off different inputs, and the whole reason this
// calculator exists is that there is one model.

import type { LeadMagnetConfig, LeadMagnetWizardStep } from './types';

/** Read the entry context from a query string. Returns null when there is no declared match. */
export function resolveEntryContext(config: LeadMagnetConfig, from: string | null | undefined): string | null {
  if (!from || !config.entryContexts) return null;
  const key = from.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(config.entryContexts, key) ? key : null;
}

/**
 * Steps in the order this entry context should ask them: the context's priority steps first (in
 * the order it declares), then everything else in the config's own order, with `review` last.
 */
export function orderStepsForEntry(config: LeadMagnetConfig, entryKey: string | null): LeadMagnetWizardStep[] {
  const steps = config.wizardSteps;
  const ctx = entryKey ? config.entryContexts?.[entryKey] : undefined;
  if (!ctx) return steps;

  const byId = new Map(steps.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const ordered: LeadMagnetWizardStep[] = [];

  for (const id of ctx.priorityStepIds) {
    const step = byId.get(id);
    if (step && id !== 'review' && !seen.has(id)) {
      ordered.push(step);
      seen.add(id);
    }
  }
  for (const step of steps) {
    if (step.id === 'review' || seen.has(step.id)) continue;
    ordered.push(step);
    seen.add(step.id);
  }
  const review = steps.find((s) => s.id === 'review');
  if (review) ordered.push(review);
  return ordered;
}

/** The one-line note shown above the wizard so the artist sees we know why they came. */
export function entryNote(config: LeadMagnetConfig, entryKey: string | null): string | null {
  if (!entryKey) return null;
  return config.entryContexts?.[entryKey]?.note ?? null;
}
