import { describe, it, expect } from 'vitest';
import {
  CALL_CONSENT_TEXT,
  CALL_CONSENT_VERSION,
  QUALIFIED_BAND,
  approxCount,
  buildFounderSmsBody,
  decideCallRequest,
  normalizeCallbackPhone,
  sanitizeCalculatorInputs,
  type CalculatorInputDef,
} from './callRequest';
import { getLeadMagnet } from '@/lib/leadMagnets/registry';

const DEFS: CalculatorInputDef[] = [
  { key: 'social_followers', type: 'number' },
  { key: 'monthly_listeners', type: 'number' },
  { key: 'owned_contacts', type: 'number' },
  { key: 'direct_fan_revenue_cents', type: 'currency' },
  {
    key: 'monetization_status',
    type: 'option',
    options: [
      { value: 'direct_established' },
      { value: 'direct_some' },
      { value: 'merch_only' },
      { value: 'streaming_only' },
      { value: 'none' },
    ],
  },
];

describe('sanitizeCalculatorInputs', () => {
  it('allowlists against the definitions and drops unknown keys', () => {
    const out = sanitizeCalculatorInputs(DEFS, {
      social_followers: 500_000,
      email: 'evil@example.com',
      phone: '5551234567',
      __proto__: 'x',
    });
    expect(out).toEqual({ social_followers: 500_000 });
  });

  it('converts currency from wizard dollars to cents', () => {
    const out = sanitizeCalculatorInputs(DEFS, { direct_fan_revenue_cents: 2000 });
    expect(out.direct_fan_revenue_cents).toBe(200_000);
  });

  it('validates option values against the allowed list', () => {
    expect(sanitizeCalculatorInputs(DEFS, { monetization_status: 'direct_established' }).monetization_status).toBe(
      'direct_established',
    );
    expect(sanitizeCalculatorInputs(DEFS, { monetization_status: 'DROP TABLE' })).toEqual({});
  });

  it('clamps negatives to zero and rejects non-numeric noise', () => {
    const out = sanitizeCalculatorInputs(DEFS, { social_followers: -5, monthly_listeners: 'abc' });
    expect(out.social_followers).toBe(0);
    expect(out).not.toHaveProperty('monthly_listeners');
  });

  it('works against the REAL unified calculator definitions, including the monetization question', () => {
    const config = getLeadMagnet('opportunity-calculator');
    expect(config).toBeTruthy();
    expect(config!.inputs.some((i) => i.key === 'monetization_status')).toBe(true);
    const out = sanitizeCalculatorInputs(config!.inputs, {
      social_followers: 400_000,
      monthly_listeners: 150_000,
      monetization_status: 'direct_some',
      fans_promote: 'already',
    });
    expect(out.social_followers).toBe(400_000);
    expect(out.monetization_status).toBe('direct_some');
    expect(out.fans_promote).toBe('already');
  });
});

describe('normalizeCallbackPhone', () => {
  it('normalizes a bare 10-digit US number', () => {
    expect(normalizeCallbackPhone('(404) 555-0123')).toBe('+14045550123');
  });
  it('accepts 11 digits starting with 1', () => {
    expect(normalizeCallbackPhone('1 404 555 0123')).toBe('+14045550123');
  });
  it('accepts international numbers with a leading plus', () => {
    expect(normalizeCallbackPhone('+44 20 7946 0958')).toBe('+442079460958');
  });
  it('rejects garbage, letters, and too-short numbers', () => {
    expect(normalizeCallbackPhone('call me')).toBeNull();
    expect(normalizeCallbackPhone('12345')).toBeNull();
    expect(normalizeCallbackPhone('')).toBeNull();
    expect(normalizeCallbackPhone(undefined)).toBeNull();
    expect(normalizeCallbackPhone('+123')).toBeNull();
  });
});

describe('decideCallRequest (server-side qualification through the canonical scorer)', () => {
  it('qualifies a Tier 1 audience with established direct sales', () => {
    const d = decideCallRequest({ social_followers: 500_000, monetization_status: 'direct_established' });
    expect(d.qualified).toBe(true);
    expect(d.band).toBe(QUALIFIED_BAND);
  });

  it('qualifies a Tier 1 audience on reported direct revenue alone', () => {
    const d = decideCallRequest({ social_followers: 300_000, direct_fan_revenue_cents: 50_000 });
    expect(d.qualified).toBe(true);
  });

  it('does not qualify a small audience even with revenue', () => {
    const d = decideCallRequest({ social_followers: 20_000, direct_fan_revenue_cents: 50_000 });
    expect(d.qualified).toBe(false);
  });

  it('does not qualify big reach with zero monetization evidence (the avatar red flag)', () => {
    const d = decideCallRequest({ social_followers: 900_000, monetization_status: 'none' });
    expect(d.qualified).toBe(false);
  });

  it('does not qualify when monetization is simply unknown', () => {
    const d = decideCallRequest({ social_followers: 900_000 });
    expect(d.qualified).toBe(false);
  });

  it('ignores any attempt to smuggle a band or score through the inputs', () => {
    const d = decideCallRequest({
      social_followers: 100,
      // These keys are not calculator inputs; sanitize drops them before this call in the
      // route, but even raw they are not read by the scorer mapping.
      score_band: 'sales_priority',
      lead_score: 100,
    } as unknown as Record<string, number | string>);
    expect(d.qualified).toBe(false);
  });
});

describe('the founder SMS body', () => {
  it('contains the minimum useful context and the callback number', () => {
    const body = buildFounderSmsBody({
      phone: '+14045550123',
      artistName: 'Nova',
      followers: 480_000,
      listeners: 150_000,
      directRevenueCents: 200_000,
      planSummary: '$4,200 to $9,800/mo system',
      band: 'sales_priority',
      score: 78,
      adminUrl: 'https://thecrwn.app/admin?tab=acquisition',
    });
    expect(body).toContain('+14045550123');
    expect(body).toContain('~480k followers');
    expect(body).toContain('~150k monthly listeners');
    expect(body).toContain('$2,000/mo direct today');
    expect(body).toContain('sales_priority');
    expect(body).toContain('https://thecrwn.app/admin?tab=acquisition');
    // House copy rule: never an em or en dash, anywhere.
    expect(body).not.toMatch(/[—–]/);
  });

  it('handles unknown numbers without inventing precision', () => {
    expect(approxCount(null)).toBe('unknown');
    expect(approxCount(1_250_000)).toBe('~1.3M');
    expect(approxCount(900)).toBe('~900');
  });
});

describe('the consent contract', () => {
  it('pins a version so a stored consent record is auditable against its exact text', () => {
    expect(CALL_CONSENT_VERSION).toMatch(/^call-consent-\d{4}-\d{2}-\d{2}\.v\d+$/);
    expect(CALL_CONSENT_TEXT.length).toBeGreaterThan(20);
    expect(CALL_CONSENT_TEXT).not.toMatch(/[—–]/);
  });
});
