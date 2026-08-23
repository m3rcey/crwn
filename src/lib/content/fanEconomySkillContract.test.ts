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
import { readFileSync, existsSync, readdirSync } from 'node:fs';
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
    'THE HOOK-REVEAL CONTRACT',
    'Social proof (founder decision, 2026-08-20)',
    'Earned contrast and natural sentence length',
  ];
  for (const a of anchors) {
    it(`still carries: ${a}`, () => {
      expect(flatSkill.includes(a)).toBe(true);
    });
  }

  it('the /crwn-shortform voice reference still carries the canonical AI-tell pass', () => {
    // This skill delegates sentence-length and contrast judgement to /crwn-shortform rather than
    // keeping a second copy. If that section is edited out over there, this skill silently loses
    // the rule and the staccato/forced-negation output comes straight back.
    const shortform = readFileSync(join(ROOT, '.claude', 'commands', 'crwn-shortform.md'), 'utf8');
    expect(
      shortform.includes('Natural Sentence Length and Earned Contrast'),
      '/crwn-shortform lost the canonical AI-tell section that /crwn-fan-economy points at'
    ).toBe(true);
    expect(skill).toContain("`/crwn-shortform`'s **\"Natural Sentence Length and Earned Contrast");
  });

  it('the eval doc still carries all ten fixtures', () => {
    for (let i = 1; i <= 10; i++) {
      expect(evalDoc.includes(`## ${i}.`), `EVAL.md lost fixture ${i}`).toBe(true);
    }
  });

  it('the Hook-Reveal Contract still documents all three tests and the META field', () => {
    // The contract is only enforceable if its checks survive. Losing Test C is how the
    // mid-script reveal question creeps back in, which is exactly the Money Man failure.
    for (const t of ['Test A', 'Test B', 'Test C', 'Hook promise:']) {
      expect(skill.includes(t), `the Hook-Reveal Contract lost ${t}`).toBe(true);
    }
  });
});

describe('FE-SKILL-006 every saved script declares its hook promise', () => {
  // The written half of the Hook-Reveal Contract. A script whose META cannot state what its
  // opening made the viewer wait for is a script whose reveal probably answers something else,
  // which shipped three times on 2026-08-16 before this gate existed.
  const SCRIPT_DIR = join(ROOT, 'videos', 'scripts', 'fan-economy');
  const scripts = existsSync(SCRIPT_DIR)
    ? readdirSync(SCRIPT_DIR).filter((f) => f.endsWith('.md'))
    : [];

  it('the script library exists and is non-empty', () => {
    expect(scripts.length, 'no fan-economy scripts found; the folder moved or emptied').toBeGreaterThan(0);
  });

  // The 2026-08-23 slide-1 rules apply from script 51 onward. A file with no leading
  // number is treated as new, so a future rename cannot silently opt out of them.
  const RULE_0823_EXEMPT = (f: string) => {
    const n = parseInt(f.match(/^(\d+)-/)?.[1] ?? '', 10);
    return Number.isFinite(n) && n < 51;
  };

  for (const file of scripts) {
    it(`${file} carries a Hook promise and a Big Reveal in its META`, () => {
      const body = readFileSync(join(SCRIPT_DIR, file), 'utf8');
      expect(body.includes('**META:**'), `${file} has no META line`).toBe(true);
      expect(
        /Hook promise:\s*\S+/.test(body),
        `${file} does not declare a "Hook promise:" in its META, so its Hook-Reveal Contract was never written down`
      ).toBe(true);
      expect(/Big Reveal:\s*\S+/.test(body), `${file} does not declare a "Big Reveal:"`).toBe(true);
    });

    it(`${file} keeps the large takeaway OFF slide 1`, () => {
      // Founder call 2026-08-23. The sheet prompt IS carousel slide 1, and its job is to open
      // the gap, not to summarise it. Every batch 04 sheet ended with two big bottom lines and
      // all ten were stripped. Slide 2 and slide 3 keep theirs; they are read after the reveal.
      // SCOPED FORWARD from script 51: the founder scoped the change "moving forward", and 30
      // of scripts 1-50 carry one. Enforcing backwards would re-render forty sheets nobody
      // asked to change.
      if (RULE_0823_EXEMPT(file)) return;
      const body = readFileSync(join(SCRIPT_DIR, file), 'utf8');
      expect(
        /Across the very bottom of the page[^.]*hand-letter exactly TWO short notes in larger capitals/i.test(body),
        `${file} still ends its sheet prompt with a large bottom takeaway; slide 1 does not carry one`
      ).toBe(false);
    });

    it(`${file} never sells a fan-chosen price`, () => {
      // Founder decision 2026-08-23: CRWN's model is the ARTIST setting the rungs and the fan
      // choosing which to join. Pay-what-you-want is a different product and is not ours. A Run
      // the Jewels case study built on buyer-chosen tiers was retired rather than edited.
      // SCOPED FORWARD from script 51, same reason as above: script 17 is a LaRussell case
      // study whose entire subject is pay-what-you-want, written before the rule existed.
      if (RULE_0823_EXEMPT(file)) return;
      const body = readFileSync(join(SCRIPT_DIR, file), 'utf8');
      const banned = [
        /pay what you want/i,
        /name your (own )?price/i,
        /choose the price/i,
        /(fans?|they|buyers?) (choose|chose|pick|picked) (the|their) price/i,
      ];
      const hit = banned.find((re) => re.test(body));
      expect(
        hit,
        `${file} frames the FAN as choosing the price, which is a retired concept`
      ).toBeUndefined();
    });

    it(`${file} says the market-FOR-fans signature line`, () => {
      // Founder decision 2026-08-16: the series thesis appears in every script, inside the
      // sidenote. Three approved variants, so this matches the invariant half of the sentence.
      const body = readFileSync(join(SCRIPT_DIR, file), 'utf8');
      expect(
        /market FOR fans/i.test(body),
        `${file} never says the signature line ("...you need a market FOR fans")`
      ).toBe(true);
    });
  }
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

describe('FE-SKILL-007 the connective machinery varies across the script corpus', () => {
  // Companion to FE-CAR-004 on the caption side. The carousel captions collapsed to ONE turn line
  // and ONE wow entry across 21 posts before anyone noticed, and a carousel is a re-cut of one of
  // these scripts, so the same phrase reaching both surfaces hits a viewer twice. This is a
  // REGRESSION guard, not a demand: it passes at the corpus's current spread and fails if the
  // machinery collapses toward one phrase. It asserts diversity, never a banned word.
  const SCRIPT_DIR = join(ROOT, 'videos', 'scripts', 'fan-economy');
  const bodies = (existsSync(SCRIPT_DIR) ? readdirSync(SCRIPT_DIR).filter((f) => f.endsWith('.md')) : [])
    .map((f) => readFileSync(join(SCRIPT_DIR, f), 'utf8'))
    .map((t) => {
      if (!t.includes('**SCRIPT:**')) return '';
      let r = t.slice(t.indexOf('**SCRIPT:**') + '**SCRIPT:**'.length);
      for (const stop of ['**NANO BANANA', '**META']) {
        const j = r.indexOf(stop);
        if (j > 0) r = r.slice(0, j);
      }
      return r; // the sheet prompt is boilerplate by design and would swamp the count
    })
    .filter(Boolean);

  // Repeats that are SUPPOSED to be identical: the signature line and its ratified rotations, the
  // series anchor, and the one-CTA close.
  const RATIFIED = [
    /market FOR fans/i,
    /market(?:ing)? to fans/i,
    /^ANYWAY/,
    /^Comment /,
    /free .*(Calculator|Planner|Builder|Test)/i,
    /^128/, // the silent end-card signature, required in every script
  ];

  it('no connective sentence appears in more than half the scripts', () => {
    if (bodies.length < 5) return;
    const counts = new Map<string, number>();
    for (const b of bodies) {
      const seen = new Set<string>();
      for (const raw of b.split(/(?<=[.?!])\s+|\n/)) {
        const x = raw.trim();
        if (x.split(/\s+/).length < 6) continue; // short lines are spoken beats, not machinery
        if (RATIFIED.some((re) => re.test(x))) continue;
        seen.add(x);
      }
      for (const x of seen) counts.set(x, (counts.get(x) ?? 0) + 1);
    }
    const worst = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!worst) return;
    const [sentence, n] = worst;
    expect(
      n / bodies.length,
      `"${sentence.slice(0, 70)}" is in ${n}/${bodies.length} scripts. Vary the bookends per the skill's Batch surface variation section.`
    ).toBeLessThanOrEqual(0.5);
  });
});
