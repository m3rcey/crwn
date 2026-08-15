// Two jobs, deliberately in one file.
//
// 1. ALWAYS: assert every touch renders cleanly. This is a real gate, not scaffolding: it is the
//    only thing that reads all 16 emails end to end the way an inbox would.
// 2. WITH `PREVIEW_EMAILS=1`: also WRITE `nurture-preview.html` so a human can look at them.
//
// Writing is opt-in so `npm test` never litters the repo. Run the preview with:
//   npm run preview:emails

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { renderAllTouches, buildPreviewPage } from './emailPreview';
import { PROSPECT_NURTURE_SEQUENCE } from './sequence';

const APP = process.env.PREVIEW_APP_URL || 'https://thecrwn.app';

describe('every nurture touch renders for review', () => {
  const touches = renderAllTouches({ appUrl: APP });

  it('covers the day-0 transactional email plus every nurture email', () => {
    expect(touches).toHaveLength(PROSPECT_NURTURE_SEQUENCE.emails.length + 1);
    expect(touches[0].day).toBe(0);
    expect(touches[0].id).toBe('transactional.result');
  });

  it('produces a subject, a CTA and a destination for every touch', () => {
    for (const t of touches) {
      expect(t.subject.length, `day ${t.day} subject`).toBeGreaterThan(5);
      expect(t.ctaLabel.length, `day ${t.day} cta`).toBeGreaterThan(2);
      expect(t.ctaUrl, `day ${t.day} url`).toMatch(/^https?:\/\//);
      expect(t.html, `day ${t.day} html`).toContain('<!doctype html>');
    }
  });

  it('leaves no unresolved token or literal undefined in anything a lead can read', () => {
    for (const variant of [{}, { withoutNumber: true }, { qualified: true }]) {
      for (const t of renderAllTouches({ appUrl: APP, ...variant })) {
        for (const s of [t.subject, t.preview, t.html, t.text]) {
          expect(s, `day ${t.day} ${JSON.stringify(variant)}`).not.toMatch(/\{\{\w+\}\}/);
          expect(s, `day ${t.day} ${JSON.stringify(variant)}`).not.toMatch(/undefined/);
        }
      }
    }
  });

  it('resolves the qualified branch to the hand-raiser only where that surface exists', () => {
    const self = renderAllTouches({ appUrl: APP, toolSlug: 'opportunity-calculator' });
    const qual = renderAllTouches({ appUrl: APP, toolSlug: 'opportunity-calculator', qualified: true });
    const changed = qual.filter((t, i) => t.ctaUrl !== self[i].ctaUrl);
    expect(changed.length, 'qualified leads should see at least one assisted CTA').toBeGreaterThan(0);
    for (const t of changed) expect(t.ctaUrl).toContain('#crwn-launch-call');
    // A non-hand-raiser tool must never branch, however qualified the lead is.
    const vault = renderAllTouches({ appUrl: APP, toolSlug: 'vault-revenue-planner', qualified: true });
    for (const t of vault) expect(t.ctaUrl).not.toContain('#crwn-launch-call');
  });

  it('writes the browsable preview when asked', () => {
    if (process.env.PREVIEW_EMAILS !== '1') return;
    const out = path.resolve('nurture-preview.html');
    fs.writeFileSync(out, buildPreviewPage(touches, APP));
    // eslint-disable-next-line no-console
    console.log(`\n  Wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${touches.length} touches)\n`);
    expect(fs.existsSync(out)).toBe(true);
  });
});
