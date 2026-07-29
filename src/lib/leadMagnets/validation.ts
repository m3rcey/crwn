// Shared, dependency-free validation for lead-magnet inputs. Used by the wizard to
// gate "Continue" and by review before generating a result.

import type {
  LeadMagnetConfig,
  LeadMagnetInputDefinition,
  LeadMagnetInputValues,
  LeadMagnetVisibilityRule,
} from './types';

const URL_RE = /^https?:\/\/.+/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ruleHolds(rule: LeadMagnetVisibilityRule, values: LeadMagnetInputValues): boolean {
  if (rule.all && !rule.all.every((r) => ruleHolds(r, values))) return false;
  if (!rule.key) return true;
  const actual = values[rule.key];
  if (rule.equals !== undefined && actual !== rule.equals) return false;
  if (rule.oneOf && !rule.oneOf.includes(actual as string | boolean)) return false;
  if (rule.notOneOf && rule.notOneOf.includes(actual as string | boolean)) return false;
  return true;
}

export function isInputVisible(def: LeadMagnetInputDefinition, values: LeadMagnetInputValues): boolean {
  if (!def.dependsOn) return true;
  return ruleHolds(def.dependsOn, values);
}

/**
 * Steps whose every input is hidden by a `dependsOn` branch. The wizard skips these outright, so a
 * branched-away question never renders as an empty screen with a Continue button.
 */
export function isStepVisible(config: LeadMagnetConfig, stepId: string, values: LeadMagnetInputValues): boolean {
  if (stepId === 'review') return true;
  const onStep = config.inputs.filter((d) => d.step === stepId);
  if (onStep.length === 0) return true; // an intentionally copy-only step
  return onStep.some((d) => isInputVisible(d, values));
}

export function validateInput(def: LeadMagnetInputDefinition, value: unknown): string | null {
  const empty = value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
  if (empty) return def.required ? 'This is required' : null;

  switch (def.type) {
    case 'number':
    case 'currency':
    case 'percentage': {
      const n = Number(value);
      if (!Number.isFinite(n)) return 'Enter a number';
      if (def.min != null && n < def.min) return `Must be at least ${def.min}`;
      if (def.max != null && n > def.max) return `Must be ${def.max} or less`;
      return null;
    }
    case 'url':
      return URL_RE.test(String(value)) ? null : 'Enter a valid URL starting with http';
    case 'email':
      return EMAIL_RE.test(String(value)) ? null : 'Enter a valid email';
    case 'text':
    case 'textarea':
      if (def.maxLength && String(value).length > def.maxLength) return `Keep it under ${def.maxLength} characters`;
      return null;
    default:
      return null;
  }
}

// Errors for every visible input on a given step. Empty object = step is valid.
export function validateStep(config: LeadMagnetConfig, stepId: string, values: LeadMagnetInputValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const def of config.inputs) {
    if (def.step !== stepId) continue;
    if (!isInputVisible(def, values)) continue;
    const err = validateInput(def, values[def.key]);
    if (err) errors[def.key] = err;
  }
  return errors;
}

export function validateAll(config: LeadMagnetConfig, values: LeadMagnetInputValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const def of config.inputs) {
    if (!isInputVisible(def, values)) continue;
    const err = validateInput(def, values[def.key]);
    if (err) errors[def.key] = err;
  }
  return errors;
}
