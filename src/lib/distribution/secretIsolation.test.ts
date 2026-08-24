// Provider-secret isolation for the Artist Distribution Finder.
// APIFY_API_TOKEN must stay server-side: only the Apify adapter reads it, and
// no client-bundled code may import the adapter or the service-role store.
// MUTATION-TESTED 2026-08-24: a line reading `process.env.APIFY_API_TOKEN` and
// importing `@/lib/distribution/store` was added to
// src/components/admin/DistributionFinder.tsx (grep-verified applied), BOTH
// assertions below failed for exactly those reasons, the line was reverted
// (grep-verified gone), and the clean suite passed 32/32.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const ALLOWED_TOKEN_READERS = [
  path.join('src', 'lib', 'distribution', 'apifyProvider.ts'),
];

describe('APIFY_API_TOKEN never reaches client code', () => {
  it('is read only by the server-side Apify adapter', () => {
    const offenders: string[] = [];
    for (const file of walk(path.join(ROOT, 'src'))) {
      const rel = path.relative(ROOT, file);
      if (rel.endsWith('.test.ts')) continue;
      const text = fs.readFileSync(file, 'utf8');
      if (text.includes('APIFY_API_TOKEN') && !ALLOWED_TOKEN_READERS.some((a) => rel === a)) {
        // The admin UI may NAME the variable in setup copy, but must never read it.
        if (text.includes('process.env.APIFY_API_TOKEN')) offenders.push(rel);
      }
    }
    expect(offenders, 'APIFY_API_TOKEN must be read only inside apifyProvider.ts').toEqual([]);
  });

  it('no component imports the Apify adapter or the service-role store', () => {
    const offenders: string[] = [];
    for (const file of walk(path.join(ROOT, 'src', 'components'))) {
      const text = fs.readFileSync(file, 'utf8');
      if (/distribution\/(apifyProvider|store)/.test(text)) offenders.push(path.relative(ROOT, file));
    }
    expect(offenders, 'components must talk to /api/admin/distribution/*, never to the provider').toEqual([]);
  });

  it('the secret is never NEXT_PUBLIC_', () => {
    for (const file of walk(path.join(ROOT, 'src'))) {
      if (file.endsWith('.test.ts')) continue; // this file names the needle
      const text = fs.readFileSync(file, 'utf8');
      expect(text.includes('NEXT_PUBLIC_APIFY'), `${path.relative(ROOT, file)} exposes the Apify token to the bundle`).toBe(false);
    }
  });
});
