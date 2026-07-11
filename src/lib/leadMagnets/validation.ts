// Shared, dependency-free validation for lead-magnet inputs. Used by the wizard to
// gate "Continue" and by review before generating a result.

import type { LeadMagnetConfig, LeadMagnetInputDefinition, LeadMagnetInputValues } from './types';

const URL_RE = /^https?:\/\/.+/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isInputVisible(def: LeadMagnetInputDefinition, values: LeadMagnetInputValues): boolean {
  if (!def.dependsOn) return true;
  return values[def.dependsOn.key] === def.dependsOn.equals;
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
