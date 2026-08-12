import { describe, it, expect } from 'vitest';
import nextConfig from '../../../next.config';

/**
 * Security-header and image-host contract.
 *
 * Two properties are pinned here, both of which were real findings in the
 * 2026-08-12 cybersecurity audit and both of which are one careless edit from
 * coming back:
 *
 *  1. The CSP allows NO third-party script origin. CRWN loads zero external
 *     scripts today (Stripe is a redirect, Calendly is an iframe), so the day a
 *     vendor snippet is pasted in, this test should be the thing that forces the
 *     conversation rather than a silent widening of the policy.
 *  2. next/image never accepts a wildcard remote host. Anything matching a
 *     remotePattern is fetched by /_next/image and decoded by sharp, so a
 *     wildcard is an unauthenticated route into sharp's libvips decoders from a
 *     host CRWN does not control.
 *
 * If you are here because this test failed: the fix is almost never to relax the
 * assertion. See docs/CYBERSECURITY_AUDIT_2026-08-12.md.
 */

type HeaderEntry = { key: string; value: string };

async function headerMap(source: string): Promise<Map<string, string>> {
  const groups = await nextConfig.headers!();
  const group = groups.find((g) => g.source === source);
  if (!group) throw new Error(`no header group for source ${source}`);
  return new Map((group.headers as HeaderEntry[]).map((h) => [h.key.toLowerCase(), h.value]));
}

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...sources] = part.split(/\s+/);
        return [name.toLowerCase(), sources] as [string, string[]];
      })
  );
}

describe('security response headers', () => {
  it('keeps the existing enforced header set intact', async () => {
    const headers = await headerMap('/(.*)');
    expect(headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(headers.get('content-security-policy')).toBe("frame-ancestors 'self'");
    expect(headers.get('x-content-type-options')).toBe('nosniff');
    expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('permissions-policy')).toContain('camera=()');
  });

  it('ships a report-only CSP that is not enforced', async () => {
    const headers = await headerMap('/(.*)');
    const reportOnly = headers.get('content-security-policy-report-only');
    expect(reportOnly, 'Report-Only CSP must be present').toBeTruthy();
    // The enforced policy stays frame-ancestors only until script-src can drop
    // 'unsafe-inline' behind a nonce. Merging them early is what breaks the app.
    expect(headers.get('content-security-policy')).not.toContain('script-src');
  });

  it('allows no third-party script origin', async () => {
    const headers = await headerMap('/(.*)');
    const scriptSrc = directives(headers.get('content-security-policy-report-only')!).get('script-src')!;
    expect(scriptSrc).toContain("'self'");
    const external = scriptSrc.filter((s) => !s.startsWith("'"));
    expect(external, `unexpected external script origin: ${external.join(', ')}`).toEqual([]);
  });

  it('locks the dangerous fallbacks the app never needs', async () => {
    const dirs = directives((await headerMap('/(.*)')).get('content-security-policy-report-only')!);
    expect(dirs.get('object-src')).toEqual(["'none'"]);
    expect(dirs.get('base-uri')).toEqual(["'self'"]);
    expect(dirs.get('frame-ancestors')).toEqual(["'self'"]);
    expect(dirs.has('default-src')).toBe(true);
  });
});

describe('next/image remote hosts', () => {
  it('has dropped the deprecated images.domains key', () => {
    expect((nextConfig.images as Record<string, unknown>).domains).toBeUndefined();
  });

  it('accepts no wildcard image host', () => {
    const patterns = nextConfig.images!.remotePatterns ?? [];
    expect(patterns.length).toBeGreaterThan(0);
    for (const p of patterns) {
      const hostname = String((p as { hostname?: string }).hostname ?? '');
      expect(
        hostname.includes('*'),
        `remotePatterns must name exact hosts; found wildcard "${hostname}". A wildcard here is an unauthenticated path into sharp via /_next/image.`
      ).toBe(false);
    }
  });

  it('never exposes localhost to the image optimizer in production', () => {
    const patterns = nextConfig.images!.remotePatterns ?? [];
    const localhost = patterns.filter((p) => (p as { hostname?: string }).hostname === 'localhost');
    if (process.env.NODE_ENV === 'production') {
      expect(localhost).toEqual([]);
    } else {
      // Dev keeps it for a local Supabase stack; the production build drops it.
      expect(localhost.every((p) => (p as { protocol?: string }).protocol === 'http')).toBe(true);
    }
  });
});
