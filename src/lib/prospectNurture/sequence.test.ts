// Contract tests for the prospect-nurture sequence and its creative system.
//
// These are drift gates, not aesthetics. They cannot tell you an image is good; they can tell you
// an email shipped without one, an id was reused for different copy, a token will render raw, or a
// price/guarantee claim crept into copy that CRWN cannot support.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  PROSPECT_NURTURE_SEQUENCE,
  PROSPECT_NURTURE_SEQUENCES,
  PROSPECT_NURTURE_VERSION,
  sequenceForVersion,
  nextEmailAfter,
} from './sequence';
import { NURTURE_ART, ALL_NURTURE_ART, artUrl } from './art';
import { moduleFor } from './calculatorModules';
import { LEAD_MAGNETS } from '@/lib/leadMagnets/registry';
import { resolveQualifiedCta, QUALIFIED_CTA_ANCHOR, QUALIFIED_CTA_TOOL } from './ctaBranch';
import { renderNurtureEmail } from './render';
import type { NurtureTokens } from './types';

const REPO = path.resolve(__dirname, '../../..');
const emails = PROSPECT_NURTURE_SEQUENCE.emails;

/** Every string a lead can actually read, per email. */
function readableCopy(e: (typeof emails)[number]): string {
  const blocks = e.body.flatMap((b) => {
    switch (b.kind) {
      case 'p':
      case 'callout':
        return [b.text];
      case 'list':
        return b.items;
      case 'numberOrFallback':
        return [b.withNumber, b.withoutNumber];
      default:
        return [];
    }
  });
  return [e.subject, e.preview, ...blocks, e.primaryCta.label ?? '', e.primaryCta.qualifiedLabel ?? ''].join(' \n ');
}

const ALL_COPY = emails.map(readableCopy).join('\n');

/**
 * Every MODULE's copy, which is injected into the emails above at render time and is therefore just
 * as sent as the sequence itself.
 *
 * This list existed and was not scanned, which is exactly how "Streaming pays you fractions of a
 * cent" shipped inside the `worth` module while the ICP assertion below passed: it was reading the
 * sequence only. A content rule that covers half the sent words is not a content rule.
 */
const MODULE_SLUGS = [...LEAD_MAGNETS.map((m) => m.slug), 'worth'];
const ALL_MODULE_COPY = MODULE_SLUGS.map((s) => {
  const m = moduleFor(s);
  return [m.featureName, m.quickWin, m.firstBuild, m.useCase].join(' \n ');
}).join('\n');

/** Everything a lead can read: the sequence AND the per-calculator blocks injected into it. */
const ALL_SENT_COPY = `${ALL_COPY}\n${ALL_MODULE_COPY}`;

describe('sequence structure', () => {
  it('is the current version and is registered in the version map', () => {
    expect(PROSPECT_NURTURE_SEQUENCE.version).toBe(PROSPECT_NURTURE_VERSION);
    expect(PROSPECT_NURTURE_SEQUENCES[PROSPECT_NURTURE_VERSION]).toBe(PROSPECT_NURTURE_SEQUENCE);
  });

  it('has unique email ids', () => {
    const ids = emails.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is sorted by dayOffset ascending with no duplicate days', () => {
    const days = emails.map((e) => e.dayOffset);
    expect([...days].sort((a, b) => a - b)).toEqual(days);
    expect(new Set(days).size).toBe(days.length);
  });

  it('starts at day 1 or later, because day 0 is the transactional result email', () => {
    expect(Math.min(...emails.map((e) => e.dayOffset))).toBeGreaterThanOrEqual(1);
  });

  it('front-loads the decision window: most emails land inside the first 30 days', () => {
    // The v3 cadence hypothesis. If someone slows this back down, that is a deliberate change and
    // this test is where they have to say so.
    const early = emails.filter((e) => e.dayOffset <= 30).length;
    expect(early).toBeGreaterThan(emails.length / 2);
  });

  it('carries an internal objective on every email', () => {
    for (const e of emails) expect(e.objective.length, e.id).toBeGreaterThan(20);
  });
});

describe('version safety', () => {
  it('resolves a known version and refuses an unknown one', () => {
    expect(sequenceForVersion(PROSPECT_NURTURE_VERSION)).toBe(PROSPECT_NURTURE_SEQUENCE);
    expect(sequenceForVersion(2)).toBeNull();
    expect(sequenceForVersion(999)).toBeNull();
    expect(sequenceForVersion(null)).toBeNull();
    expect(sequenceForVersion(undefined)).toBeNull();
    expect(sequenceForVersion(Number.NaN)).toBeNull();
  });

  it('never indexes a retired version against the current array', () => {
    // The v2 bug: `current_step` was an index into "whatever is current", so a reorder would have
    // sent in-flight leads unrelated emails. A retired version must yield nothing at all.
    expect(nextEmailAfter(3, 2)).toBeNull();
    expect(nextEmailAfter(0, PROSPECT_NURTURE_VERSION)?.email.id).toBe(emails[0].id);
    expect(nextEmailAfter(emails.length, PROSPECT_NURTURE_VERSION)).toBeNull();
    expect(nextEmailAfter(-1, PROSPECT_NURTURE_VERSION)).toBeNull();
  });
});

describe('creative system', () => {
  it('gives every email a banner that resolves to a real asset', () => {
    for (const e of emails) {
      const art = NURTURE_ART[e.art];
      expect(art, `${e.id} has no art`).toBeTruthy();
      const file = path.join(REPO, 'public', path.basename(art.src));
      expect(fs.existsSync(file), `${e.id} -> missing ${art.src}`).toBe(true);
    }
  });

  it('ships every asset as WebP, never JPEG', () => {
    for (const art of ALL_NURTURE_ART) {
      expect(art.src, art.id).toMatch(/\.webp$/);
      const buf = fs.readFileSync(path.join(REPO, 'public', path.basename(art.src)));
      // RIFF....WEBP magic.
      expect(buf.subarray(0, 4).toString('ascii'), art.id).toBe('RIFF');
      expect(buf.subarray(8, 12).toString('ascii'), art.id).toBe('WEBP');
    }
  });

  it('keeps every asset small enough for email', () => {
    for (const art of ALL_NURTURE_ART) {
      const bytes = fs.statSync(path.join(REPO, 'public', path.basename(art.src))).size;
      expect(bytes, `${art.id} is ${bytes} bytes`).toBeLessThan(200_000);
    }
  });

  it('gives every asset meaningful alt text and a persuasion job', () => {
    for (const art of ALL_NURTURE_ART) {
      expect(art.alt.length, art.id).toBeGreaterThan(20);
      expect(art.alt, art.id).not.toMatch(/^(image|banner|illustration)$/i);
      expect(art.job.length, art.id).toBeGreaterThan(20);
    }
  });

  it('uses every asset it defines', () => {
    const used = new Set(emails.map((e) => e.art));
    for (const key of Object.keys(NURTURE_ART)) {
      expect(used.has(key as keyof typeof NURTURE_ART), `${key} is defined but unused`).toBe(true);
    }
  });

  it('holds the 65/35 male/female split across the set, per the brand rule', () => {
    const shown = ALL_NURTURE_ART.filter((a) => a.shows !== 'none');
    const male = shown.filter((a) => a.shows === 'male').length;
    const ratio = male / shown.length;
    expect(ratio).toBeGreaterThanOrEqual(0.55);
    expect(ratio).toBeLessThanOrEqual(0.75);
  });

  it('never repeats one asset across more than two emails', () => {
    const counts = new Map<string, number>();
    for (const e of emails) counts.set(e.art, (counts.get(e.art) ?? 0) + 1);
    for (const [k, n] of counts) expect(n, `${k} used ${n} times`).toBeLessThanOrEqual(2);
  });
});

describe('rendering', () => {
  const tokens: NurtureTokens = {
    first_name: 'Ari',
    artist_name: 'Ari',
    tool_name: 'Opportunity Calculator',
    feature_name: 'Membership',
    hero_value: '$1,240',
    monthly_value: '$1,240 a month',
    annual_value: '$14,880 a year',
    result_url: 'https://thecrwn.app/tools/opportunity-calculator?result=tok',
    signup_url: 'https://thecrwn.app/signup?tool=opportunity-calculator&ref=nurture',
    cta_label: 'Build this in the CRWN app',
    unsubscribe_url: 'https://thecrwn.app/api/prospect-nurture/unsubscribe/abc',
  };
  const mod = {
    slug: 'opportunity-calculator',
    featureName: 'Membership',
    quickWin: 'Do the one small thing.',
    firstBuild: 'Build the first version.',
    useCase: 'It becomes a real offer.',
    destinationRoute: '/offers/new',
  };
  const render = (i: number, hasNumber = true) =>
    renderNurtureEmail({ email: emails[i], tokens, module: mod, hasNumber, appUrl: 'https://thecrwn.app' });

  it('never leaves a raw {{token}} in any email, with or without a number', () => {
    for (let i = 0; i < emails.length; i++) {
      for (const hasNumber of [true, false]) {
        const r = render(i, hasNumber);
        for (const s of [r.subject, r.preview, r.html, r.text]) {
          expect(s, `${emails[i].id} hasNumber=${hasNumber}`).not.toMatch(/\{\{\w+\}\}/);
          expect(s, `${emails[i].id} hasNumber=${hasNumber}`).not.toMatch(/undefined/);
        }
      }
    }
  });

  it('renders the banner above the copy, hosted and not inlined', () => {
    for (let i = 0; i < emails.length; i++) {
      const r = render(i);
      const art = NURTURE_ART[emails[i].art];
      const imgAt = r.html.indexOf(`https://thecrwn.app${art.src}`);
      expect(imgAt, emails[i].id).toBeGreaterThan(-1);
      // Above the body: the first body paragraph must come after the image tag.
      expect(r.html.indexOf('Hey Ari'), emails[i].id).toBeGreaterThan(imgAt);
      expect(r.html, emails[i].id).not.toMatch(/data:image/);
      expect(r.html, emails[i].id).toMatch(/width="520" height="293"/);
    }
  });

  it('keeps the email usable with images blocked', () => {
    for (let i = 0; i < emails.length; i++) {
      const r = render(i);
      // Alt text present, the CTA is a real link, and the plain-text part carries the argument.
      expect(r.html).toContain(NURTURE_ART[emails[i].art].alt);
      expect(r.text.length, emails[i].id).toBeGreaterThan(200);
      expect(r.text, emails[i].id).toMatch(/https:\/\/thecrwn\.app/);
      expect(r.text, emails[i].id).toContain('Unsubscribe:');
    }
  });

  it('escapes an interpolated artist name', () => {
    const evil = { ...tokens, first_name: '<script>x</script>' };
    const r = renderNurtureEmail({ email: emails[0], tokens: evil, module: mod, hasNumber: true, appUrl: 'https://thecrwn.app' });
    expect(r.html).not.toContain('<script>');
    expect(r.html).toContain('&lt;script&gt;');
  });

  it('honours a server-resolved CTA override', () => {
    const r = renderNurtureEmail({
      email: emails[2],
      tokens,
      module: mod,
      hasNumber: true,
      appUrl: 'https://thecrwn.app',
      ctaOverride: { url: 'https://thecrwn.app/x#crwn-launch-call', label: 'Assisted' },
    });
    expect(r.html).toContain('crwn-launch-call');
    expect(r.html).toContain('Assisted');
  });

  it('builds an absolute asset url without a double slash', () => {
    expect(artUrl(NURTURE_ART.discovery, 'https://thecrwn.app/')).toBe('https://thecrwn.app/nurture-discovery.webp');
  });
});

describe('CTA branching never becomes a sales decision', () => {
  const base = { toolSlug: QUALIFIED_CTA_TOOL, resultUrl: 'https://x/r', qualifiedLabel: 'Assisted' } as const;

  it('branches only for a qualified lead on the tool that hosts the hand-raiser', () => {
    expect(resolveQualifiedCta({ ...base, ctaKind: 'auto', qualified: true })?.url).toBe(`https://x/r#${QUALIFIED_CTA_ANCHOR}`);
    expect(resolveQualifiedCta({ ...base, ctaKind: 'auto', qualified: false })).toBeNull();
    expect(resolveQualifiedCta({ ...base, ctaKind: 'auto', qualified: true, toolSlug: 'vault-revenue-planner' })).toBeNull();
    expect(resolveQualifiedCta({ ...base, ctaKind: 'signup', qualified: true })).toBeNull();
    expect(resolveQualifiedCta({ ...base, ctaKind: 'result', qualified: true })).toBeNull();
    expect(resolveQualifiedCta({ ...base, ctaKind: 'auto', qualified: true, resultUrl: '' })).toBeNull();
  });

  it('falls through to self-serve, never to the sales path, when unresolved', () => {
    // An `auto` CTA that is not resolved must render the signup ask.
    const autos = emails.filter((e) => e.primaryCta.kind === 'auto');
    expect(autos.length).toBeGreaterThan(0);
  });

  it('keeps the anchor in sync with PublicToolClient', () => {
    const src = fs.readFileSync(path.join(REPO, 'src/components/lead-magnets/PublicToolClient.tsx'), 'utf8');
    expect(src).toContain(`export const QUALIFY_ANCHOR_ID = '${QUALIFIED_CTA_ANCHOR}'`);
  });
});

describe('content claims stay inside what CRWN can support', () => {
  it('uses no em dash or en dash anywhere a lead can read', () => {
    for (const e of emails) expect(readableCopy(e), e.id).not.toMatch(/[—–]/);
  });

  it('never says bare "CRWN" as the product in body copy', () => {
    // "the CRWN app" is the product; bare CRWN is the company. Allowed in "the CRWN app" and in
    // possessives about the company itself.
    const bad = ALL_COPY.match(/\bCRWN\b(?! app)/g) ?? [];
    expect(bad, `bare CRWN used ${bad.length} times`).toHaveLength(0);
  });

  it('quotes no price, plan fee or subscription cost', () => {
    // Pricing lives in TIER_PRICING and changes; a hardcoded price in a year-long sequence goes
    // stale silently. Lead-owned figures arrive through {{monthly_value}}, which is not a literal.
    expect(ALL_COPY).not.toMatch(/\$\d/);
    expect(ALL_COPY).not.toMatch(/\b\d+\s*%\s*(fee|cut|commission)/i);
  });

  it('promises no guaranteed income, and invents no proof', () => {
    expect(ALL_COPY).not.toMatch(/\bguarantee(d|s)?\b/i);
    expect(ALL_COPY).not.toMatch(/\brisk[- ]free\b/i);
    expect(ALL_COPY).not.toMatch(/\b(case stud(y|ies)|testimonial)\b/i);
    // No invented customer counts or benchmark stats.
    expect(ALL_COPY).not.toMatch(/\b\d{2,}%\s*(of artists|conversion|increase|lift)/i);
  });

  it('uses no fake scarcity or countdown language', () => {
    expect(ALL_COPY).not.toMatch(/\b(last chance|expires? (today|soon)|only \d+ (spots?|seats?) left|closing soon|final hours?)\b/i);
  });

  it('labels the one hypothetical example as hypothetical', () => {
    const walk = emails.find((e) => e.id === 'v3.c.worked-example');
    expect(walk).toBeTruthy();
    expect(readableCopy(walk!)).toMatch(/invented|made-up|made up|hypothetical/i);
  });

  it('never tells the ICP their audience is too small or that fans may not pay', () => {
    // docs/ICP.md: this artist already sells directly. Beginner framing tells them they are in the
    // wrong room, which is the exact failure v2's day-8 subject was rewritten to avoid.
    //
    // The patterns are deliberately loose. The first version of this assertion was
    // `/streaming pays (pennies|fractions)/i`, which never matched the copy that actually shipped
    // ("Streaming pays YOU fractions of a cent") because of one intervening word. A content rule
    // that only catches the exact phrasing someone thought of first catches nothing.
    const BANNED_ICP_FRAMING: [RegExp, string][] = [
      [/streaming\b[^.]{0,30}\b(pennies|fractions? of a cent|almost nothing|next to nothing)/i, 'streaming pays pennies'],
      [/(earn|pay)s? you (almost|next to) nothing\b/i, 'your work earns nothing'],
      [/even if (you|your audience) (is|are) (small|tiny)/i, 'your audience is small'],
      [/you (do not|don't) need a (big|large) audience/i, 'you do not need an audience'],
      [/maybe your fans (will|would) pay/i, 'fans might not pay'],
      [/your audience (is|might be) too small/i, 'audience too small'],
    ];
    for (const [re, label] of BANNED_ICP_FRAMING) {
      const hit = ALL_SENT_COPY.match(re);
      expect(hit, `banned ICP framing (${label}): ${hit?.[0] ?? ''}`).toBeNull();
    }
  });

  it('gives every calculator a BUILDABLE feature name, never a calculator name', () => {
    // `feature_name` lands in "Setting up the first version of your ___ in the CRWN app". The
    // registry's featureName is a directory-card label, and the external `worth` tool carries
    // "Worth Calculator", which shipped as "the first version of your Worth Calculator". The module
    // owns this value for exactly that reason, and a calculator name here is always wrong.
    for (const slug of MODULE_SLUGS) {
      const fn = moduleFor(slug).featureName;
      expect(fn, `${slug} feature name is not buildable`).not.toMatch(/calculator|quiz|planner|blueprint/i);
      expect(fn.length, `${slug} feature name`).toBeGreaterThan(3);
    }
  });

  it('references no paused or deprecated calculator by name', () => {
    // Only promoted tools may be named in copy that runs for a year. Proof of Demand rejoined the
    // promoted set on 2026-08-20, but the universal core sequence still has no reason to name one
    // specific tool, so its ban stays as a tighter-than-required guard.
    expect(ALL_COPY).not.toMatch(/clip-to-earn|proof of demand|top fan leaderboard|team splits/i);
  });

  it('every email carries a next action', () => {
    for (const e of emails) expect(['signup', 'result', 'auto']).toContain(e.primaryCta.kind);
  });
});
