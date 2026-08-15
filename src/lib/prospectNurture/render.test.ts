// Pure-unit tests for the prospect-nurture content layer: renderer, tokens, sequence, modules.
// No database, no mail provider. These lock the guarantees the email layer must never break:
// deterministic numbers (never recomputed), graceful fallback, HTML escaping, and full calculator
// coverage.

import { describe, expect, it } from 'vitest';
import { LEAD_MAGNET_SLUGS } from '@/lib/leadMagnets/registry';
import { PROSPECT_NURTURE_SEQUENCE, nextEmailAfter } from './sequence';
import { moduleFor } from './calculatorModules';
import { buildNurtureTokens } from './tokens';
import { formatCentsDisplay, renderNurtureEmail, resolveTokens } from './render';
import type { NurtureTokens } from './types';

function tokens(over: Partial<NurtureTokens> = {}): NurtureTokens {
  return {
    first_name: 'Mercey',
    artist_name: 'M3RCEY',
    tool_name: 'Vault Revenue Planner',
    feature_name: 'Artist Vault',
    hero_value: '$1,240',
    monthly_value: '$1,240 a month',
    annual_value: '$14,880 a year',
    result_url: 'https://thecrwn.app/tools/vault-revenue-planner?result=abc',
    signup_url: 'https://thecrwn.app/signup?tool=vault-revenue-planner&result=abc&ref=nurture',
    cta_label: 'Build My Vault',
    unsubscribe_url: 'https://thecrwn.app/api/prospect-nurture/unsubscribe/tok',
    ...over,
  };
}

describe('formatCentsDisplay', () => {
  it('formats whole dollars with thousands separators', () => {
    expect(formatCentsDisplay(124000)).toBe('$1,240');
    expect(formatCentsDisplay(99)).toBe('$1');
  });
  it('returns empty string for missing or non-positive values', () => {
    expect(formatCentsDisplay(0)).toBe('');
    expect(formatCentsDisplay(null)).toBe('');
    expect(formatCentsDisplay(undefined)).toBe('');
    expect(formatCentsDisplay(-500)).toBe('');
  });
});

describe('resolveTokens', () => {
  it('replaces known tokens and blanks unknown ones (never prints undefined)', () => {
    expect(resolveTokens('Hey {{first_name}}, your {{feature_name}}', tokens())).toBe('Hey Mercey, your Artist Vault');
    expect(resolveTokens('x {{nope}} y', tokens())).toBe('x  y');
  });
});

describe('buildNurtureTokens', () => {
  const base = {
    slug: 'vault-revenue-planner',
    toolName: 'Vault Revenue Planner',
    featureName: 'Artist Vault',
    publicRoute: '/tools/vault-revenue-planner',
    appUrl: 'https://thecrwn.app',
    unsubToken: 'tok',
    ctaLabel: 'Build My Vault',
  };

  it('reads money from result_data and never recomputes it', () => {
    const { tokens: t, hasNumber } = buildNurtureTokens({
      ...base,
      artistName: 'M3RCEY',
      resultData: { heroValue: '$1,240', estimatedMonthlyCents: 124000, estimatedAnnualCents: 1488000 },
      publicToken: 'abc',
    });
    expect(hasNumber).toBe(true);
    expect(t.hero_value).toBe('$1,240');
    expect(t.monthly_value).toBe('$1,240 a month');
    expect(t.annual_value).toBe('$14,880 a year');
    expect(t.signup_url).toContain('result=abc');
    expect(t.result_url).toContain('result=abc');
  });

  it('falls back cleanly for a score-only tool with no dollar figure', () => {
    const { tokens: t, hasNumber } = buildNurtureTokens({
      ...base,
      slug: 'royalty-readiness-check',
      toolName: 'Royalty Readiness Check',
      featureName: 'Royalty Readiness',
      artistName: null,
      resultData: {},
      publicToken: null,
    });
    expect(hasNumber).toBe(false);
    expect(t.hero_value).toBe('');
    expect(t.monthly_value).toBe('');
    expect(t.first_name).toBe('there'); // graceful name fallback
    expect(t.signup_url).not.toContain('result=');
  });
});

describe('renderNurtureEmail', () => {
  const email = PROSPECT_NURTURE_SEQUENCE.emails[0];

  it('escapes interpolated values so a lead cannot inject markup', () => {
    const rendered = renderNurtureEmail({
      email,
      tokens: tokens({ tool_name: '<script>x</script>', first_name: 'A&B' }),
      module: moduleFor('vault-revenue-planner'),
      hasNumber: true,
      appUrl: 'https://thecrwn.app',
    });
    expect(rendered.html).not.toContain('<script>x</script>');
    expect(rendered.html).toContain('&lt;script&gt;');
    expect(rendered.html).toContain('A&amp;B');
  });

  it('uses the with-number line when a figure exists and the fallback when it does not', () => {
    const withNum = renderNurtureEmail({ email, tokens: tokens(), module: moduleFor('vault-revenue-planner'), hasNumber: true, appUrl: 'https://thecrwn.app' });
    const noNum = renderNurtureEmail({
      email,
      tokens: tokens({ monthly_value: '', hero_value: '', annual_value: '' }),
      module: moduleFor('royalty-readiness-check'),
      hasNumber: false,
      appUrl: 'https://thecrwn.app',
    });
    expect(withNum.text).toContain('$1,240 a month');
    expect(noNum.text).not.toContain('a month');
    expect(noNum.text).not.toContain('undefined');
    expect(noNum.text).not.toContain('{{');
  });

  it('always includes an unsubscribe link', () => {
    const rendered = renderNurtureEmail({ email, tokens: tokens(), module: moduleFor('vault-revenue-planner'), hasNumber: true, appUrl: 'https://thecrwn.app' });
    expect(rendered.html).toContain('/api/prospect-nurture/unsubscribe/tok');
    expect(rendered.text).toContain('Unsubscribe:');
  });
});

describe('sequence integrity', () => {
  it('has strictly non-decreasing cadence and unique ids', () => {
    const emails = PROSPECT_NURTURE_SEQUENCE.emails;
    const ids = new Set(emails.map((e) => e.id));
    expect(ids.size).toBe(emails.length);
    for (let i = 1; i < emails.length; i++) {
      expect(emails[i].dayOffset).toBeGreaterThanOrEqual(emails[i - 1].dayOffset);
    }
  });

  it('nextEmailAfter walks the list and stops at the end', () => {
    expect(nextEmailAfter(0)?.email.id).toBe(PROSPECT_NURTURE_SEQUENCE.emails[0].id);
    expect(nextEmailAfter(PROSPECT_NURTURE_SEQUENCE.emails.length)).toBeNull();
  });
});

describe('calculator coverage', () => {
  it('gives every registry calculator a usable module with a real destination', () => {
    for (const slug of LEAD_MAGNET_SLUGS) {
      const m = moduleFor(slug);
      expect(m.featureName.length).toBeGreaterThan(0);
      expect(m.quickWin.length).toBeGreaterThan(0);
      expect(m.useCase.length).toBeGreaterThan(0);
      expect(m.destinationRoute.startsWith('/')).toBe(true);
    }
  });

  it('derives a fallback module for an unknown slug rather than throwing', () => {
    const m = moduleFor('some-future-calculator');
    expect(m.slug).toBe('some-future-calculator');
    expect(m.destinationRoute.startsWith('/')).toBe(true);
  });
});
