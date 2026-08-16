// Contract test for the /crwn-fan-economy skill (.claude/commands/crwn-fan-economy.md).
//
// Same philosophy as agentContracts.test.ts: prose cannot be usefully asserted, so this pins only
// FALSIFIABLE OPERATIONAL CLAIMS. The skill's behavioral quality (curiosity-gap execution, reveal
// ordering in a generated script, artist research) is graded by the fixtures in
// videos/fan-economy/EVAL.md, which require generation and cannot run here. What CAN drift
// silently and break the skill without any test going red:
//   - the calculator slugs/keywords it routes CTAs to stop existing in the registry,
//   - the docs it names as sources of truth move or get deleted,
//   - a megastar creeps into the artist pool (the hard ICP pivot becomes absurd),
//   - the load-bearing gates (curiosity-gap rule, reveal ordering, 128 rules) get edited out,
//   - an em dash lands in copy that gets pasted into user-facing scripts.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { LEAD_MAGNETS, EXTERNAL_TOOLS } from '@/lib/leadMagnets/registry';

const ROOT = process.cwd();
const SKILL_PATH = join(ROOT, '.claude', 'commands', 'crwn-fan-economy.md');
const POOL_PATH = join(ROOT, 'videos', 'fan-economy', 'ARTIST_POOL.md');
const EVAL_PATH = join(ROOT, 'videos', 'fan-economy', 'EVAL.md');

const skill = readFileSync(SKILL_PATH, 'utf8');
const pool = readFileSync(POOL_PATH, 'utf8');
const evalDoc = readFileSync(EVAL_PATH, 'utf8');

describe('FE-SKILL-001 the skill file is intact and invocable', () => {
  it('exists and ends with the $ARGUMENTS block every command in this repo uses', () => {
    expect(skill.trimEnd().endsWith('$ARGUMENTS')).toBe(true);
  });

  it('its companion reference files exist where the skill points', () => {
    expect(existsSync(POOL_PATH)).toBe(true);
    expect(existsSync(EVAL_PATH)).toBe(true);
  });

  it('every repo doc it names as a source of truth exists', () => {
    const docs = [
      'docs/ICP.md',
      'docs/POSITIONING.md',
      'docs/crwn-brain/29-COMPLETE-FEATURE-INVENTORY.md',
      'docs/crwn-brain/13-CURRENT-STATE.md',
      'docs/crwn-brain/22-VIRALITY-ENGINE-ARCHITECTURE.md',
      'docs/crwn-brain/15-AI-AGENT-INSTRUCTIONS.md',
      'src/lib/leadMagnets/registry.ts',
    ];
    for (const d of docs) {
      expect(skill.includes(d), `skill no longer cites ${d}; if it moved, update the skill`).toBe(true);
      expect(existsSync(join(ROOT, d)), `${d} is cited by the skill but does not exist`).toBe(true);
    }
  });
});

describe('FE-SKILL-002 the CTA routing only names real calculators and real keywords', () => {
  const knownKeys = new Set([...LEAD_MAGNETS.map((m) => m.slug), ...EXTERNAL_TOOLS.map((t) => t.key)]);
  // Every backticked slug in the mapping table's tool column.
  const mappedSlugs = [...skill.matchAll(/\|\s*`([a-z0-9-]+)`[^|]*\|\s*[A-Z]+\s*\|/g)].map((m) => m[1]);

  it('the mapping table names at least the six promoted doors', () => {
    expect(mappedSlugs.length).toBeGreaterThanOrEqual(6);
  });

  it('every mapped slug is a registered tool', () => {
    for (const slug of mappedSlugs) {
      expect(knownKeys.has(slug), `skill routes a CTA to '${slug}', which is not in LEAD_MAGNETS or EXTERNAL_TOOLS`).toBe(true);
    }
  });

  it('every mapped comment keyword is a registered dmKeyword for its slug (worth is external and exempt)', () => {
    const rows = [...skill.matchAll(/\|\s*`([a-z0-9-]+)`[^|]*\|\s*([A-Z]+)\s*\|/g)];
    expect(rows.length).toBeGreaterThanOrEqual(6);
    for (const [, slug, keyword] of rows) {
      if (slug === 'worth') continue; // external tool: keyword WORTH is pinned by the ManyChat funnel, not dmKeywords
      const magnet = LEAD_MAGNETS.find((m) => m.slug === slug);
      expect(magnet, `no magnet for ${slug}`).toBeTruthy();
      expect(
        magnet!.dmKeywords.includes(keyword.toLowerCase()),
        `skill tells viewers to comment '${keyword}' for ${slug}, but its dmKeywords are [${magnet!.dmKeywords.join(', ')}]`
      ).toBe(true);
    }
  });
});

describe('FE-SKILL-003 the load-bearing gates cannot be silently edited out', () => {
  // These are the rules whose absence produces plausible-looking but broken output. Presence of
  // the section heading is the falsifiable claim; the prose stays free to evolve.
  const flatSkill = skill.replace(/\s+/g, ' ');
  const anchors = [
    'CURIOSITY-GAP MATH RULE',
    'Big Reveal never before the CRWN sidenote',
    'Wow Factor never before the Big Reveal',
    'HARD ICP PIVOT',
    'Product-truth safeguard',
    'Never use a megastar',
    'NEVER manufacture 128 mechanics',
    'Awareness-ladder validation',
    'Batch surface variation',
    'Voice (founder correction, 2026-08-16)',
  ];
  for (const a of anchors) {
    it(`still carries: ${a}`, () => {
      expect(flatSkill.includes(a)).toBe(true);
    });
  }

  it('the eval doc still carries all eight fixtures', () => {
    for (let i = 1; i <= 8; i++) {
      expect(evalDoc.includes(`## ${i}.`), `EVAL.md lost fixture ${i}`).toBe(true);
    }
  });
});

describe('FE-SKILL-004 the artist pool keeps the ICP pivot sane', () => {
  it('every pool entry carries a lane and cautions', () => {
    const entries = pool.split(/^### /m).slice(1);
    expect(entries.length).toBeGreaterThanOrEqual(8);
    for (const e of entries) {
      const name = e.split('\n')[0].trim();
      expect(e.includes('lane:'), `pool entry ${name} has no lane`).toBe(true);
      expect(e.includes('cautions:'), `pool entry ${name} has no cautions line`).toBe(true);
    }
  });

  it('no megastar is a pool entry', () => {
    // The hard pivot ("independent artists operating at X's level... I'm talking to YOU") is
    // absurd at megastar scale; docs/ICP.md Tier 1 tops out at 5M followers.
    const banned = ['Drake', 'Beyonc', 'Kendrick Lamar', 'Taylor Swift', 'Kanye', 'Nicki Minaj', 'Travis Scott', 'Rihanna', 'The Weeknd'];
    const entryNames = pool.split(/^### /m).slice(1).map((e) => e.split('\n')[0].trim());
    for (const name of entryNames) {
      for (const b of banned) {
        expect(name.includes(b), `megastar '${name}' found in the Fan Economy artist pool`).toBe(false);
      }
    }
  });
});

describe('FE-SKILL-005 no em dashes in files that feed user-facing copy', () => {
  for (const [label, text] of [['skill', skill], ['pool', pool], ['eval', evalDoc]] as const) {
    it(`${label} contains no em or en dash`, () => {
      expect(/[—–]/.test(text), `${label} file contains an em/en dash`).toBe(false);
    });
  }
});
