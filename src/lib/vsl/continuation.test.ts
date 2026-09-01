import { describe, it, expect } from 'vitest';
import {
  vslContinuation,
  watchUrlFor,
  isKnownTool,
  VSL_FALLBACK_HREF,
  VSL_FALLBACK_LABEL,
} from './continuation';
import { VSLS } from './catalog';
import { buildContinueUrl, continueCtaFor } from '@/lib/leadMagnets/continuationCta';

const TOKEN = 'pub_tok_abc123';

describe('a VSL viewer continues the calculator they already finished', () => {
  it('sends a Streaming Loss lead onward without offering Streaming Loss again', () => {
    const c = vslContinuation('worth', TOKEN);
    expect(c.resolved).toBe(true);
    // The canonical handoff, not a calculator.
    expect(c.href).toBe(buildContinueUrl('worth', TOKEN));
    expect(c.href.startsWith('/signup?')).toBe(true);
    expect(c.href).not.toMatch(/^\/worth\b/);
  });

  it('keeps a non-Streaming-Loss lead in their own calculator context', () => {
    const c = vslContinuation('vault-revenue-planner', TOKEN);
    expect(c.href).toContain('tool=vault-revenue-planner');
    // The bug being fixed: this lead must never be handed the Streaming Loss calculator.
    expect(c.href).not.toContain('tool=worth');
    expect(c.href).not.toMatch(/^\/worth\b/);
    expect(c.label).toBe(continueCtaFor('vault-revenue-planner'));
  });

  it('carries the saved result token, which is what restores the plan after signup', () => {
    // signup stores this server-side as pending_result_token and auto-claim binds the saved result
    // to the new account. Losing it here is what would force the artist to re-enter the calculator.
    expect(vslContinuation('worth', TOKEN).href).toContain(`result=${TOKEN}`);
  });

  it('still continues when the result was never persisted, just without a token', () => {
    const c = vslContinuation('worth', null);
    expect(c.resolved).toBe(true);
    expect(c.href).toBe(buildContinueUrl('worth', null));
    expect(c.href).not.toContain('result=');
  });

  it('preserves the lead-magnet attribution the signup flow reads', () => {
    const c = vslContinuation('own-your-fans-calculator', TOKEN);
    expect(c.href).toContain('tool=own-your-fans-calculator');
    expect(c.href).toContain('ref=lead-magnet');
    expect(c.href).toContain(`result=${TOKEN}`);
  });
});

describe('the video being watched is never a routing input', () => {
  it('gives the same destination whichever of the four VSLs the lead is on', () => {
    // The four are one shared series. A lead who arrived through the Vault planner continues into
    // the Vault whether they clicked from video 1 or video 4.
    const hrefs = VSLS.map(
      (v) => watchUrlFor(v.slug, { tool: 'vault-revenue-planner', resultToken: TOKEN }),
    );
    expect(new Set(hrefs).size).toBe(4); // each link points at its own video
    for (const h of hrefs) {
      // ...but every one of them carries the SAME originating calculator forward.
      expect(h).toContain('tool=vault-revenue-planner');
      expect(h).toContain(`result=${TOKEN}`);
    }
    // And the continuation itself depends only on the tool, never on the slug.
    expect(vslContinuation('vault-revenue-planner', TOKEN)).toEqual(
      vslContinuation('vault-revenue-planner', TOKEN),
    );
  });

  it('builds a watch link for every catalogued video', () => {
    for (const v of VSLS) {
      expect(watchUrlFor(v.slug), v.slug).toContain(`/watch/${v.slug}`);
    }
  });
});

describe('missing or hostile context', () => {
  it('falls back to account creation, never to a calculator', () => {
    for (const bad of [null, undefined, '', '   ', 'not-a-tool']) {
      const c = vslContinuation(bad as string | null, TOKEN);
      expect(c.resolved, String(bad)).toBe(false);
      expect(c.href).toBe(VSL_FALLBACK_HREF);
      expect(c.label).toBe(VSL_FALLBACK_LABEL);
      // The whole point: an unknown viewer is not silently relabelled as a Streaming Loss lead.
      expect(c.href).not.toMatch(/^\/worth\b/);
      expect(c.href).not.toContain('tool=');
    }
  });

  it('drops an unrecognised tool from the watch link rather than propagating it', () => {
    const h = watchUrlFor('vsl-1-fan-worth', { tool: 'made-up', resultToken: TOKEN });
    expect(h).toBe('/watch/vsl-1-fan-worth');
    expect(h).not.toContain('made-up');
    // A token with no valid tool is meaningless, so it does not travel either.
    expect(h).not.toContain(TOKEN);
  });

  it('opens no redirect: every destination stays on this origin', () => {
    const hostile = [
      'https://evil.example.com',
      '//evil.example.com',
      '/\\evil.example.com',
      'javascript:alert(1)',
      '../../etc/passwd',
    ];
    for (const h of hostile) {
      // As the tool: rejected by the registry check, so it cannot reach the URL at all.
      const c = vslContinuation(h, TOKEN);
      expect(c.href, h).toBe(VSL_FALLBACK_HREF);

      // As the result token on a VALID tool: it can only ever be a query VALUE on a fixed
      // relative /signup path, and URLSearchParams encodes it.
      const withToken = vslContinuation('worth', h);
      expect(withToken.href.startsWith('/signup?'), h).toBe(true);
      expect(withToken.href).not.toContain('://');
      expect(withToken.href).not.toMatch(/^\/\//);

      // And as the tool on a watch link.
      expect(watchUrlFor('vsl-1-fan-worth', { tool: h })).toBe('/watch/vsl-1-fan-worth');
    }
  });

  it('takes only the first value when a param is repeated', () => {
    // Mirrors the page's `one()` reader: an array from a duplicated query param must not become
    // "a,b" and quietly widen what reaches the registry check.
    expect(isKnownTool('worth')).toBe(true);
    expect(isKnownTool('worth,vault-revenue-planner')).toBe(false);
  });
});
