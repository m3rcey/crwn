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

describe('FE-SKILL-008 a multi-sheet video holds the reveal until sheet 3 and the CTA until sheet 4', () => {
  // Founder call 2026-09-13. A video films up to three sheets in order: the hook, the middle,
  // then the reveal. The first multi-sheet pass drew the reveal on sheet 2 and a
  // "COMMENT <KEYWORD>" box on sheet 3, which spent the last third of the video on an answer the
  // viewer already had. The reveal figures come from META's Big Reveal, minus any figure the hook
  // sheet already shows (the hook may state the inputs, e.g. "1.5M LISTENERS").
  const SCRIPT_DIR = join(ROOT, 'videos', 'scripts', 'fan-economy');
  const files = existsSync(SCRIPT_DIR) ? readdirSync(SCRIPT_DIR).filter((f) => f.endsWith('.md')) : [];

  const block = (md: string, sheet: number) => {
    const marker = sheet === 1 ? '**NANO BANANA PRO PROMPT:**' : `**NANO BANANA PRO PROMPT ${sheet}:**`;
    const i = md.indexOf(marker);
    if (i === -1) return null;
    const rest = md.slice(i + marker.length);
    const end = rest.indexOf('\n---');
    return (end === -1 ? rest : rest.slice(0, end)).replace(/<!--[\s\S]*?-->/g, '');
  };
  // What the page actually letters: only quoted strings are drawn.
  const lettered = (text: string) => [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]).join(' | ');
  // "$120,000", "1.5M", "90K", "2 million", "8%" and "zero dollars" compare as values.
  const figures = (text: string) => {
    const out = new Set<number>();
    for (const m of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(k|m|thousand|million)?\b/gi)) {
      let n = parseFloat(m[1].replace(/,/g, ''));
      const unit = (m[2] ?? '').toLowerCase();
      if (unit === 'k' || unit === 'thousand') n *= 1e3;
      if (unit === 'm' || unit === 'million') n *= 1e6;
      out.add(Math.round(n));
    }
    if (/\bzero\b/i.test(text)) out.add(0);
    return out;
  };

  const multiSheet = files.filter((f) => readFileSync(join(SCRIPT_DIR, f), 'utf8').includes('**NANO BANANA PRO PROMPT 2:**'));

  for (const file of multiSheet) {
    const md = readFileSync(join(SCRIPT_DIR, file), 'utf8').replace(/\r\n/g, '\n');
    const sheet1 = lettered(block(md, 1) ?? '');
    const sheet2 = lettered(block(md, 2) ?? '');
    const sheet3Block = block(md, 3);
    const sheet3 = lettered(sheet3Block ?? '');
    const revealSegment = md.match(/Big Reveal:([^·]*)/)?.[1] ?? '';
    const hookFigures = figures(sheet1);
    const revealOnly = [...figures(revealSegment)].filter((n) => !hookFigures.has(n));

    it(`${file} keeps its reveal figures off sheet 2 and puts them on sheet 3`, () => {
      expect(sheet3Block, `${file} has a sheet 2 but no sheet 3 to reveal on`).not.toBeNull();
      expect(revealOnly.length, `${file}: no Big Reveal figure beyond the hook, so this check proves nothing`).toBeGreaterThan(0);
      const onSheet2 = [...figures(sheet2)].filter((n) => revealOnly.includes(n));
      expect(onSheet2, `${file} reveals ${onSheet2.join(', ')} on sheet 2`).toEqual([]);
      const onSheet3 = [...figures(sheet3)].filter((n) => revealOnly.includes(n));
      expect(onSheet3.length, `${file} sheet 3 never shows the reveal (${revealOnly.join(', ')})`).toBeGreaterThan(0);
    });

    it(`${file} carries no comment CTA on sheets 2 and 3`, () => {
      expect(`${sheet2} | ${sheet3}`).not.toMatch(/\bCOMMENT\b/i);
    });

    it(`${file} ends on a sheet 4 whose CTA keyword is the one the script says`, () => {
      // Founder call 2026-09-13, second pass: the CTA returns as its own closing sheet. It must
      // route to the same ManyChat keyword the voiceover asks for, or a viewer comments a word
      // nothing answers.
      const sheet4Block = block(md, 4);
      expect(sheet4Block, `${file} has sheets 2 and 3 but no CTA sheet 4`).not.toBeNull();
      const spoken = md.match(/Comment ([A-Z]+) and I'll DM/)?.[1];
      expect(spoken, `${file}: no spoken "Comment X and I'll DM" line to match`).toBeTruthy();
      expect(lettered(sheet4Block ?? '')).toMatch(new RegExp(`\\bCOMMENT '${spoken}'`));
    });
  }
});

describe('FE-SKILL-009 scripts after #9 open on one question, and a versus is about both artists', () => {
  // Founder calls 2026-09-13. (1) Every script after #9 opens with ONE sentence that is a question
  // ("which ___ has ___, ___?"), then "Let's find out.", then everything else. (2) A versus is a
  // question about BOTH artists ("whose fans pay more, A's or B's?"), and its reveal measures both
  // on one axis. Batch 04 shipped nine versus posts built around one verified number for the
  // smaller artist, with the bigger artist reduced to a backdrop, because nothing checked it.
  //
  // PENDING lists are scripts known to break a rule and not yet rebuilt. They may only shrink: a
  // listed script that now complies FAILS the suite until it is removed from its list, so a fix can
  // never be silently undone later.
  const SCRIPT_DIR = join(ROOT, 'videos', 'scripts', 'fan-economy');
  const num = (f: string) => parseInt(f.match(/^(\d+)-/)?.[1] ?? '0', 10);
  const files = (existsSync(SCRIPT_DIR) ? readdirSync(SCRIPT_DIR) : []).filter((f) => f.endsWith('.md') && num(f) >= 10);

  const PENDING_OPENING = new Set(
    [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35,
      36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 53, 54, 55, 56, 57, 58, 59, 60]
  );
  const PENDING_ONE_SIDED = new Set([18, 19, 20, 28, 48, 49, 51, 53, 54, 55, 56, 57, 58, 59]);

  const scriptLines = (md: string) => {
    const s = md.indexOf('**SCRIPT:**');
    const body = md.slice(s + '**SCRIPT:**'.length);
    return body.slice(0, body.indexOf('\n---')).split('\n').map((l) => l.trim()).filter(Boolean);
  };
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, '');
  const key = (side: string) =>
    norm(side).split(' ').filter((w) => w !== 'the').sort((a, b) => b.length - a.length)[0] ?? '';

  const opensRight = (md: string) => {
    const [first = '', second = ''] = scriptLines(md);
    const oneQuestion = first.endsWith('?') && !/[.!?](\s|$)/.test(first.slice(0, -1));
    return oneQuestion && /^Let[’']s find out\.$/.test(second);
  };
  const versus = (md: string) => {
    const title = md.split('\n')[0].replace(/^#\s*/, '').split(':')[0];
    const m = title.match(/^(.+?) vs (.+)$/i);
    return m ? [m[1], m[2]] : null;
  };
  const bothSided = (md: string, sides: string[]) => {
    const hook = norm(scriptLines(md)[0] ?? '');
    const asksAboutBoth = sides.every((s) => hook.includes(key(s))) && /\b(which|who|whose)\b/.test(hook) && / or /.test(hook);
    const reveal = md.match(/Big Reveal:([^·]*)/)?.[1] ?? '';
    const measuresBoth = /\b(against|versus|vs)\b|≈|=|\bdouble\b|\bhalf\b|\bworth about\b|\btimes\b/i.test(reveal);
    return asksAboutBoth && measuresBoth;
  };

  for (const file of files) {
    const md = readFileSync(join(SCRIPT_DIR, file), 'utf8').replace(/\r\n/g, '\n');
    const n = num(file);

    it(`${file} opens on one question sentence, then "Let's find out."`, () => {
      if (PENDING_OPENING.has(n)) {
        expect(opensRight(md), `${file} now opens correctly: remove ${n} from PENDING_OPENING`).toBe(false);
        return;
      }
      const [first, second] = scriptLines(md);
      expect(opensRight(md), `${file} opens "${first}" / "${second}"`).toBe(true);
    });

    const sides = versus(md);
    if (sides) {
      it(`${file} is a versus about both artists`, () => {
        if (PENDING_ONE_SIDED.has(n) || PENDING_OPENING.has(n)) {
          if (PENDING_ONE_SIDED.has(n)) {
            expect(bothSided(md, sides), `${file} is now two-sided: remove ${n} from PENDING_ONE_SIDED`).toBe(false);
          }
          return;
        }
        expect(bothSided(md, sides), `${file}: the hook must ask which/who/whose about ${sides.join(' and ')}, and the Big Reveal must measure both`).toBe(true);
      });
    }
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
