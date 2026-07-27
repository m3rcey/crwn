// Build the fully-resolved, fallback-safe personalization tokens for a prospect-nurture email.
//
// Pure: DB rows in, strings out, no I/O. Every token is a string, so a missing value renders as an
// empty string, never "undefined". Financial values come straight from the stored result's
// result_data (the deterministic calculator output); this file formats, it never calculates.

import { formatCentsDisplay } from './render';
import type { NurtureTokens } from './types';

export interface BuildTokensInput {
  slug: string;
  toolName: string;
  featureName: string;
  artistName: string | null;
  resultData: Record<string, unknown> | null;
  publicToken: string | null;
  publicRoute: string; // e.g. "/tools/vault-revenue-planner" or "/worth"
  appUrl: string;
  unsubToken: string;
  ctaLabel: string; // continueCtaFor(slug)
}

function firstNameFrom(artistName: string | null): string {
  const n = (artistName || '').trim();
  if (!n) return 'there';
  const first = n.split(/\s+/)[0];
  return first || 'there';
}

export function buildNurtureTokens(input: BuildTokensInput): { tokens: NurtureTokens; hasNumber: boolean } {
  const rd = input.resultData || {};
  const heroValueRaw = typeof rd.heroValue === 'string' ? rd.heroValue.trim() : '';
  const monthlyCents = typeof rd.estimatedMonthlyCents === 'number' ? rd.estimatedMonthlyCents : null;
  const annualCents = typeof rd.estimatedAnnualCents === 'number' ? rd.estimatedAnnualCents : null;

  const monthlyDisplay = heroValueRaw || formatCentsDisplay(monthlyCents);
  const annualDisplay = formatCentsDisplay(annualCents);
  const hasNumber = !!monthlyDisplay || !!annualDisplay;

  const tokenParam = input.publicToken ? `&result=${encodeURIComponent(input.publicToken)}` : '';
  const resultQuery = input.publicToken ? `?result=${encodeURIComponent(input.publicToken)}` : '';

  const tokens: NurtureTokens = {
    first_name: firstNameFrom(input.artistName),
    artist_name: (input.artistName || '').trim(),
    tool_name: input.toolName,
    feature_name: input.featureName,
    hero_value: monthlyDisplay,
    monthly_value: monthlyDisplay ? `${monthlyDisplay} a month` : '',
    annual_value: annualDisplay ? `${annualDisplay} a year` : '',
    result_url: `${input.appUrl}${input.publicRoute}${resultQuery}`,
    signup_url: `${input.appUrl}/signup?tool=${encodeURIComponent(input.slug)}${tokenParam}&ref=nurture`,
    cta_label: input.ctaLabel,
    unsubscribe_url: `${input.appUrl}/api/prospect-nurture/unsubscribe/${encodeURIComponent(input.unsubToken)}`,
  };

  return { tokens, hasNumber };
}
