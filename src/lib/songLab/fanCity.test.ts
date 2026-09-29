import { describe, it, expect } from 'vitest';
import { cleanCity, cityHintFromHeaders } from './fanCity';

const headers = (h: Record<string, string>) => (n: string) => h[n] ?? null;

describe('cleanCity', () => {
  it('keeps a plain place name and tidies spacing', () => {
    expect(cleanCity('  Chicago,   IL ')).toBe('Chicago, IL');
  });
  it('strips markup and control characters, and refuses near-empty input', () => {
    expect(cleanCity('<b>Gary</b>')).toBe('bGary/b');
    expect(cleanCity('St. Louis\u0000')).toBe('St. Louis');
    expect(cleanCity(' ')).toBeNull();
    expect(cleanCity('x')).toBeNull();
    expect(cleanCity(42)).toBeNull();
  });
  it('caps the length', () => {
    expect(cleanCity('a'.repeat(200))!.length).toBe(80);
  });
});

describe('cityHintFromHeaders', () => {
  it('reads a US city with its state from Vercel headers', () => {
    expect(cityHintFromHeaders(headers({ 'x-vercel-ip-city': 'Chicago', 'x-vercel-ip-country': 'US', 'x-vercel-ip-country-region': 'IL' }))).toBe('Chicago, IL');
  });
  it('decodes URL-encoded city names', () => {
    expect(cityHintFromHeaders(headers({ 'x-vercel-ip-city': 'St.%20Louis', 'x-vercel-ip-country': 'US', 'x-vercel-ip-country-region': 'MO' }))).toBe('St. Louis, MO');
  });
  it('uses the country outside the US', () => {
    expect(cityHintFromHeaders(headers({ 'x-vercel-ip-city': 'London', 'x-vercel-ip-country': 'GB', 'x-vercel-ip-country-region': 'ENG' }))).toBe('London, GB');
  });
  it('returns nothing when there is no location (local dev, unknown IP)', () => {
    expect(cityHintFromHeaders(headers({}))).toBeNull();
  });
});
