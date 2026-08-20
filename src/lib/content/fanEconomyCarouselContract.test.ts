// Contract test for the /crwn-fan-economy-carousel skill and the carousel files it writes.
//
// Same philosophy as fanEconomySkillContract.test.ts: prose cannot be asserted, so this pins only
// FALSIFIABLE claims. What can drift silently and break a carousel without any test going red:
//   - a caption's DM keyword stops matching the registry, so ManyChat never fires,
//   - a carousel's numbers stop matching the video script it condenses, so the two surfaces
//     tell one viewer two different stories,
//   - slide 2 stops revealing (a carousel nobody gets paid off by),
//   - slide 3 stops being a numberless takeaway and turns back into a second reveal,
//   - the shared 128 end card starts getting re-rendered per carousel instead of copied,
//   - an em dash lands in a caption that gets pasted straight into Instagram.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { LEAD_MAGNETS, EXTERNAL_TOOLS } from '@/lib/leadMagnets/registry';

const ROOT = process.cwd();
const SKILL_PATH = join(ROOT, '.claude', 'commands', 'crwn-fan-economy-carousel.md');
const GENERATOR_PATH = join(ROOT, 'generate-fan-economy-carousel.mjs');
const CAROUSELS_DIR = join(ROOT, 'videos', 'carousels', 'fan-economy');
const SCRIPTS_DIR = join(ROOT, 'videos', 'scripts', 'fan-economy');

const skill = readFileSync(SKILL_PATH, 'utf8');

const carouselFiles = existsSync(CAROUSELS_DIR)
  ? readdirSync(CAROUSELS_DIR).filter((f) => /^\d+-.*\.md$/.test(f)).sort()
  : [];

const section = (md: string, marker: string): string | null => {
  const i = md.indexOf(marker);
  if (i === -1) return null;
  let rest = md.slice(i + marker.length);
  const end = rest.indexOf('\n---');
  if (end !== -1) rest = rest.slice(0, end);
  return rest.trim();
};

describe('FE-CAR-001 the skill file is intact and invocable', () => {
  it('ends with the $ARGUMENTS block every command in this repo uses', () => {
    expect(skill.trimEnd().endsWith('$ARGUMENTS')).toBe(true);
  });

  it('the generator it tells you to run actually exists', () => {
    expect(existsSync(GENERATOR_PATH)).toBe(true);
  });

  it('keeps the load-bearing structural rules that make a carousel a carousel', () => {
    // Slide 2 inverting slide 1's withholding is the whole reason this is not just
    // three sheets: an unpaid carousel is a carousel people leave.
    expect(skill).toContain('INVERTS');
    // 128 is a silent signature. If this rule is edited out, slide 3 starts explaining it.
    expect(skill).toMatch(/silent/i);
    // Slide 1 is copied, never re-rendered, or the carousel opens on different art
    // than the video it condenses.
    expect(skill).toMatch(/COPIED, not written/i);
    // Slide 4 is one shared asset. If this turns back into a per-carousel prompt, every
    // post spends a call redrawing an identical page and they stop matching each other.
    expect(skill).toMatch(/fixed asset you never write a prompt for/i);
    expect(skill).toContain('128-end-card.jpg');
  });
});

describe('FE-CAR-002 the generator renders what the skill promises', () => {
  const gen = readFileSync(GENERATOR_PATH, 'utf8');

  it('renders 3:4, not the 1:1 that generate-carousel.mjs hardcodes', () => {
    expect(gen).toContain('aspectRatio: "3:4"');
  });

  it('attaches the CRWN logo only when a prompt names CRWN', () => {
    expect(gen).toContain('CRWN_LOGO');
    expect(gen).toMatch(/\/CRWN\|crwn logo\/\.test\(prompt\)/);
  });

  it('keeps the colour-intrusion check, since the person refs are colour photos', () => {
    expect(gen).toContain('countColouredPixels');
  });

  it('renders four slides and copies the shared end card rather than redrawing it', () => {
    expect(gen).toContain('[1, 2, 3, 4]');
    expect(gen).toContain('END_CARD');
    expect(gen).toMatch(/copyFileSync\(END_CARD, outPath\)/);
  });
});

describe.runIf(carouselFiles.length > 0)('FE-CAR-003 every carousel file is well formed', () => {
  it.each(carouselFiles)('%s has a caption and slide 2 and slide 3 prompts', (file) => {
    const md = readFileSync(join(CAROUSELS_DIR, file), 'utf8');
    expect(section(md, '**CAPTION:**')).toBeTruthy();
    expect(section(md, '**SLIDE 2 PROMPT:**')).toBeTruthy();
    expect(section(md, '**SLIDE 3 PROMPT:**')).toBeTruthy();
  });

  it.each(carouselFiles)('%s condenses a video script that exists', (file) => {
    expect(existsSync(join(SCRIPTS_DIR, file))).toBe(true);
  });

  it.each(carouselFiles)('%s uses no em or en dash anywhere', (file) => {
    const md = readFileSync(join(CAROUSELS_DIR, file), 'utf8');
    expect(md).not.toContain('—');
    expect(md).not.toContain('–');
  });

  it.each(carouselFiles)('%s routes its CTA to a real calculator keyword', (file) => {
    const caption = section(readFileSync(join(CAROUSELS_DIR, file), 'utf8'), '**CAPTION:**') ?? '';
    const all = [...caption.matchAll(/Comment "?([A-Z][A-Z0-9]{2,})"?/g)];
    expect(all.length, 'caption must carry a "Comment KEYWORD" CTA').toBeGreaterThan(0);
    // The CTA runs at the top AND the bottom: most readers never expand past the fold,
    // so a bottom-only CTA is one most of the audience never sees.
    expect(all.length, 'CTA must appear at the top and again at the end').toBeGreaterThanOrEqual(2);
    const keywords = new Set(all.map((m) => m[1]));
    expect(keywords.size, `both CTAs must use ONE keyword, found ${[...keywords].join(', ')}`).toBe(1);
    const firstLine = caption.trimStart().split('\n')[0];
    expect(firstLine, 'the caption must OPEN with the CTA').toMatch(/^Comment "?[A-Z]/);
    const keyword = all[0][1];
    // The annotation goes on the ACCESS, not the parameter. Annotating the parameter as
    // `{ dmKeywords?: string[] }` failed to type check, because the array element is the
    // union `LeadMagnetConfig | ExternalTool` and a callback parameter has to accept it.
    const known = [...LEAD_MAGNETS, ...EXTERNAL_TOOLS]
      .flatMap((t) => (t as { dmKeywords?: string[] }).dmKeywords ?? [])
      .map((k: string) => k.toUpperCase());
    // The keyword is wired to ManyChat. Inventing one produces a CTA that silently
    // does nothing for every person who comments it.
    expect(known, `${keyword} is not a registered dmKeyword`).toContain(keyword);
  });

  it.each(carouselFiles)('%s caption carries no hashtags', (file) => {
    const caption = section(readFileSync(join(CAROUSELS_DIR, file), 'utf8'), '**CAPTION:**') ?? '';
    const tags = caption.match(/#\w+/g) ?? [];
    expect(tags, `captions carry no hashtags, found ${tags.join(' ')}`).toHaveLength(0);
  });

  it.each(carouselFiles)('%s caption keeps the withholding beats, not a summary', (file) => {
    const caption = section(readFileSync(join(CAROUSELS_DIR, file), 'utf8'), '**CAPTION:**') ?? '';
    // A summary states the setup then the answer, closing the gap on the way past it.
    // These beats are what keep the caption a re-cut of the script instead.
    expect(caption, 'caption must hold the belief mid-post').toMatch(/Hold that thought/i);
    expect(caption, 'caption must carry the ANYWAY turn').toMatch(/ANYWAY/);
    // The re-ask is a founder correction carried from /crwn-fan-economy: ask the hook
    // question again immediately before the payoff. Its absence shipped once already.
    const after = caption.slice(caption.search(/ANYWAY/));
    expect(after, 're-ask beat must follow ANYWAY and precede the reveal').toMatch(/\?/);
  });

  it.each(carouselFiles)('%s slide 2 actually reveals a number', (file) => {
    const slide2 = section(readFileSync(join(CAROUSELS_DIR, file), 'utf8'), '**SLIDE 2 PROMPT:**') ?? '';
    // The sheets withhold the payoff on purpose; slide 2 is where it lands.
    expect(slide2).toMatch(/\$[\d,]{3,}/);
  });

  it.each(carouselFiles)('%s slide 3 is a takeaway carrying no number', (file) => {
    const md = readFileSync(join(CAROUSELS_DIR, file), 'utf8');
    const slide3 = section(md, '**SLIDE 3 PROMPT:**') ?? '';
    expect(slide3).toMatch(/TAKEAWAY/);
    // Slide 2 owns the math. A figure repeated here makes the two slides read as one
    // slide split in half, and the takeaway stops surviving a lone screenshot.
    const quoted = slide3.match(/"[^"]*"/g) ?? [];
    const withMoney = quoted.filter((q) => /\$\s?[\d,]/.test(q));
    expect(withMoney, `slide 3 must quote no dollar figure, found ${withMoney.join(', ')}`)
      .toHaveLength(0);
  });

  it.each(carouselFiles)('%s never writes its own slide 4 prompt', (file) => {
    const md = readFileSync(join(CAROUSELS_DIR, file), 'utf8');
    // The end card is one shared asset copied by the generator.
    expect(md).not.toContain('**SLIDE 4 PROMPT:**');
  });

  it.each(carouselFiles)('%s draws no CRWN mark on any rendered slide', (file) => {
    const md = readFileSync(join(CAROUSELS_DIR, file), 'utf8');
    for (const marker of ['**SLIDE 2 PROMPT:**', '**SLIDE 3 PROMPT:**']) {
      const body = section(md, marker) ?? '';
      expect(body, `${marker} must forbid the CRWN mark`).toMatch(/[Nn]ever draw the word CRWN/);
    }
  });
});
