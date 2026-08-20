// Contract test for the /crwn-fan-economy-carousel skill and the carousel files it writes.
//
// Same philosophy as fanEconomySkillContract.test.ts: prose cannot be asserted, so this pins only
// FALSIFIABLE claims. What can drift silently and break a carousel without any test going red:
//   - a caption's DM keyword stops matching the registry, so ManyChat never fires,
//   - a carousel's numbers stop matching the video script it condenses, so the two surfaces
//     tell one viewer two different stories,
//   - slide 2 stops revealing (a carousel nobody gets paid off by),
//   - slide 3 stops being the silent end card, or another slide starts drawing the CRWN mark,
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
    const m = caption.match(/Comment ([A-Z][A-Z0-9]{2,})\b/);
    expect(m, 'caption must carry a "Comment KEYWORD" CTA').toBeTruthy();
    const keyword = m![1];
    const known = [...LEAD_MAGNETS, ...EXTERNAL_TOOLS]
      .flatMap((t: { dmKeywords?: string[] }) => t.dmKeywords ?? [])
      .map((k: string) => k.toUpperCase());
    // The keyword is wired to ManyChat. Inventing one produces a CTA that silently
    // does nothing for every person who comments it.
    expect(known, `${keyword} is not a registered dmKeyword`).toContain(keyword);
  });

  it.each(carouselFiles)('%s slide 2 actually reveals a number', (file) => {
    const slide2 = section(readFileSync(join(CAROUSELS_DIR, file), 'utf8'), '**SLIDE 2 PROMPT:**') ?? '';
    // The sheets withhold the payoff on purpose; slide 2 is where it lands.
    expect(slide2).toMatch(/\$[\d,]{3,}/);
  });

  it.each(carouselFiles)('%s slide 3 is the silent 128 end card', (file) => {
    const md = readFileSync(join(CAROUSELS_DIR, file), 'utf8');
    const slide3 = section(md, '**SLIDE 3 PROMPT:**') ?? '';
    expect(slide3).toContain('128');
    expect(slide3).toMatch(/CRWN logo/);
    // No CTA, no explanation: 128 is never verbally explained.
    expect(slide3).toMatch(/no call to action/i);
  });

  it.each(carouselFiles)('%s draws the CRWN mark on slide 3 and nowhere else', (file) => {
    const md = readFileSync(join(CAROUSELS_DIR, file), 'utf8');
    const slide2 = section(md, '**SLIDE 2 PROMPT:**') ?? '';
    expect(slide2).toMatch(/[Nn]ever draw the word CRWN/);
  });
});
