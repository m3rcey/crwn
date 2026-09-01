import { describe, it, expect } from 'vitest';
import { checkoutReturnUrls } from './returnPath';

const BASE = 'https://thecrwn.app';
const call = (r: unknown) => checkoutReturnUrls(BASE, r, 'gb-the-g1ft');

describe('checkout return destinations stay on CRWN', () => {
  it('accepts a plain internal path', () => {
    expect(call('/drop/abc123').successUrl).toBe('https://thecrwn.app/drop/abc123?subscription=success');
  });

  it('preserves a safe query string, because funnel state rides it', () => {
    const r = call('/drop/abc123?offer=primary&utm_campaign=boxing_v1');
    expect(r.successUrl).toBe('https://thecrwn.app/drop/abc123?offer=primary&utm_campaign=boxing_v1&subscription=success');
    expect(r.cancelUrl).toContain('subscription=canceled');
  });

  it('REJECTS an external absolute url', () => {
    expect(call('https://evil.example/phish').successUrl).toBe('https://thecrwn.app/gb-the-g1ft?subscription=success');
  });

  it('REJECTS protocol-relative and backslash hosts', () => {
    const BS = String.fromCharCode(92); // one literal backslash, immune to escaping layers
    for (const bad of ['//evil.example', '/' + BS + 'evil.example', BS + BS + 'evil.example']) {
      expect(call(bad).successUrl).toBe('https://thecrwn.app/gb-the-g1ft?subscription=success');
    }
  });

  it('REJECTS javascript: and data: schemes', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:x']) {
      expect(call(bad).successUrl).toBe('https://thecrwn.app/gb-the-g1ft?subscription=success');
    }
  });

  it('REJECTS the userinfo host-confusion form', () => {
    // `https://thecrwn.app@evil.com` reads as thecrwn.app to a person and evil.com to the
    // parser. As a returnUrl it arrives as `@evil.com`, which is not a /-prefixed path.
    expect(call('@evil.example').successUrl).toBe('https://thecrwn.app/gb-the-g1ft?subscription=success');
  });

  it('REJECTS an encoded scheme smuggled past a naive check', () => {
    expect(call('/%09/evil.example').successUrl).toContain('thecrwn.app');
    expect(call('%2F%2Fevil.example').successUrl).toBe('https://thecrwn.app/gb-the-g1ft?subscription=success');
  });

  it('falls back to the artist page rather than failing the purchase', () => {
    for (const bad of [null, undefined, '', 42, {}, 'not-a-path']) {
      expect(call(bad).successUrl).toBe('https://thecrwn.app/gb-the-g1ft?subscription=success');
    }
  });

  it('both destinations always share one validated path', () => {
    const r = call('https://evil.example');
    expect(new URL(r.successUrl).origin).toBe(BASE);
    expect(new URL(r.cancelUrl).origin).toBe(BASE);
  });
});
