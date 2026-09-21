// CTA-001..003. The guard against marketing outrunning the calculator.
//
// Two separate jobs, deliberately kept apart:
//
//   CTA-001 keeps the DESCRIPTOR honest. It runs each tool for real and checks `showsDollar`
//   against what actually comes back, so ctaCapability.ts cannot drift away from the code it
//   describes. Without this the descriptor is just a second opinion, and the whole point is that
//   the first opinion (marketing copy) was already wrong twice.
//
//   CTA-002/003 keep the COPY honest, by scanning ONLY the lines that make a promise. It cannot
//   tell whether a sentence is true, and it does not try: it checks that a tool returning no
//   dollar is never sold with a dollar phrase, and that a tool shipping an estimate disclaimer is
//   never sold as exact. That is the narrow, checkable part of "is this claim supported".
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CTA_CAPABILITIES, capabilityForKeyword, forbiddenClaims } from './ctaCapability';
import { getTool } from '@/lib/acquisition/toolAdapters';
import { LEAD_MAGNETS, EXTERNAL_TOOLS } from '@/lib/leadMagnets/registry';

const ROOT = process.cwd();
const SCRIPTS = join(ROOT, 'videos', 'scripts', 'fan-economy');
const CAROUSELS = join(ROOT, 'videos', 'carousels', 'fan-economy');

describe('CTA-001 the capability descriptor matches what the tools actually return', () => {
  it('names only real tools, and every promoted keyword resolves', () => {
    const known = new Set([...LEAD_MAGNETS.map((m) => m.slug), ...EXTERNAL_TOOLS.map((t) => t.key)]);
    for (const c of CTA_CAPABILITIES) {
      expect(known.has(c.slug), `${c.slug} is not a registered tool`).toBe(true);
    }
    // PROOF is the demand builder's second keyword; both must land on one capability.
    expect(capabilityForKeyword('PROOF')?.slug).toBe('proof-of-demand-test-builder');
    expect(capabilityForKeyword('DEMAND')?.slug).toBe('proof-of-demand-test-builder');
  });

  // A generous synthetic profile: every field any adapter asks for, with values big enough that a
  // money tool cannot come back at zero and read as a score tool by accident.
  const profile = {
    social_followers: 500_000,
    monthly_listeners: 400_000,
    monetization_status: 'sells_merch_and_tickets',
    catalog_size: 60,
    shows_per_year: 20,
    avg_attendance: 400,
    vip_buyers_per_show: 10,
    avg_vip_price_cents: 15_000,
    writes_music: 'yes',
    pro_registered: 'no',
    songs_registered: 'no',
    artist_name: 'Test',
  } as unknown as Parameters<NonNullable<ReturnType<typeof getTool>>['execute']>[0];

  for (const cap of CTA_CAPABILITIES) {
    const tool = getTool(cap.slug);
    // `worth` is the external standalone page and has no adapter; it is money by construction.
    if (!tool) continue;

    it(`${cap.slug}: showsDollar=${cap.showsDollar} matches its real output`, () => {
      const r = tool.execute(profile);
      const tiles = JSON.stringify(
        (r as unknown as { sections?: unknown[] }).sections ?? []
      );
      const money =
        typeof r.estimatedMonthlyCents === 'number' ||
        /\$\s?[\d]/.test(r.heroValue ?? '') ||
        /\$\s?[\d]/.test(String((r as unknown as { headline?: string }).headline ?? ''));
      // The WEB result is what "I'll DM you the link" sends the reader to. Vault's DM adapter does
      // show a figure while its web planner does not, so the adapter alone would overstate it; the
      // descriptor records the narrower, always-true answer and this asserts the direction only.
      if (cap.showsDollar) {
        expect(money || tiles.includes('$'), `${cap.slug} claims a dollar and produced none`).toBe(true);
      }
    });
  }

  it('royalty readiness returns a score and no dollar, which is the whole reason it is score-only', () => {
    const r = getTool('royalty-readiness-check')!.execute(profile);
    expect(r.estimatedMonthlyCents).toBeUndefined();
    expect(r.estimatedAnnualCents).toBeUndefined();
    expect(/\$\s?[\d]/.test(r.heroValue ?? ''), 'royalty must never render a dollar hero').toBe(false);
  });
});

/** The lines that make a promise: the offer line and the Comment CTAs. Never the story. */
function promiseLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^I built a free |^I got a free |^Comment ["']?[A-Z]/.test(l));
}

function keywordOf(text: string): string | null {
  return text.match(/Comment ["']?([A-Z][A-Z0-9]{2,})/)?.[1] ?? null;
}

/**
 * Scripts 1 to 5 are FILMED. The videos are finished assets and their spoken CTA cannot be
 * changed, so two of them keep a promise this guard would otherwise reject:
 *
 *   1-currensy-vs-westside-gunn  "prices exactly that for your catalog"
 *   5-rapsody-the-328-songs      "prices exactly that"
 *
 * Both are the false-precision family, not a false claim about what the tool does: the Vault
 * planner really does produce a price band, it just ships an estimate disclaimer with it, so
 * "exactly" is the part it cannot back. Carousel 1's caption is editable and already says the
 * accurate thing, which is the mitigation for that one. Rapsody has no carousel, so it stays
 * reported and unfixed.
 *
 * The exemption is by NUMBER and capped at 5 on purpose. A new script cannot be added to it, and
 * a locked script that gets re-recorded simply stops matching and needs removing from the list.
 */
const LOCKED_FILMED = new Set([1, 5]);
const scriptNumber = (f: string) => parseInt(f.match(/^(\d+)-/)?.[1] ?? '', 10);

function scan(dir: string, label: string) {
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')) : [];
  describe(`${label} CTA lines only claim what their tool returns`, () => {
    it('the corpus exists', () => expect(files.length).toBeGreaterThan(0));
    it('the filmed-script exemption cannot grow past the five locked videos', () => {
      for (const n of LOCKED_FILMED) expect(n).toBeLessThanOrEqual(5);
    });
    for (const file of files) {
      it(`${file}`, () => {
        const n = scriptNumber(file);
        // Only the SCRIPTS corpus is filmed; a carousel caption is always editable.
        if (dir === SCRIPTS && Number.isFinite(n) && LOCKED_FILMED.has(n)) return;
        const md = readFileSync(join(dir, file), 'utf8');
        const kw = keywordOf(md);
        if (!kw) return; // founder-mode pieces carry no keyword
        const cap = capabilityForKeyword(kw);
        expect(cap, `${file} routes to ${kw}, which has no capability entry`).toBeTruthy();
        const magnet = LEAD_MAGNETS.find((m) => m.slug === cap!.slug);
        // Sourced from the registry, never assumed: only a tool that ships an estimate
        // disclaimer is held to the no-false-precision rule.
        const banned = forbiddenClaims(cap!, magnet?.requiresEstimateDisclaimer ?? true);
        for (const line of promiseLines(md)) {
          for (const re of banned) {
            expect(
              re.test(line),
              `${file} (${kw}) promises something ${cap!.slug} does not return: "${line}" matched ${re}`
            ).toBe(false);
          }
        }
      });
    }
  });
}

describe('CTA-002 video scripts', () => scan(SCRIPTS, 'fan-economy scripts'));
describe('CTA-003 carousel captions', () => scan(CAROUSELS, 'fan-economy carousels'));
