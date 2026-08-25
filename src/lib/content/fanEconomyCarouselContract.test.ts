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
    // A caption is read, not performed. Without this rule every beat ships as its own one-line
    // paragraph, which is what a stack of AI punchlines looks like on a phone (carousel 1).
    expect(skill).toContain('A paragraph is a THOUGHT');
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
    // The opening CTA sits ABOVE the story, so the reader has no idea what the tool is
    // called yet. It must promise an OUTCOME, never a product name.
    const productNames = [...LEAD_MAGNETS, ...EXTERNAL_TOOLS]
      .map((t: { name?: string }) => t.name)
      .filter((n): n is string => Boolean(n && n.length > 4));
    const named = productNames.filter((n) => firstLine.includes(n));
    expect(named, `the opening CTA must name a benefit, not the product (found ${named.join(', ')})`)
      .toHaveLength(0);
    // ...and it must actually promise something after "for".
    expect(firstLine, 'the opening CTA must say what the artist gets').toMatch(/\bfor\s+\S+/);
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

  it.each(carouselFiles)('%s never upgrades a follow into an endorsement', (file) => {
    const caption = section(readFileSync(join(CAROUSELS_DIR, file), 'utf8'), '**CAPTION:**') ?? '';
    // A follow is a follow. Writing "LL Cool J uses CRWN" when he follows the account is
    // a fabricated claim and breaks product-truth the same way an invented feature does.
    const upgrades = [
      /\buses CRWN\b/i,
      /\bpartnered with\b/i,
      /\bbacked by\b/i,
      /\bsigned up (?:with|to) CRWN\b/i,
      /\bendorsed by\b/i,
      // Following is not agreeing. Nobody asked them and nobody can check it, which puts
      // "they agree with" in the same class as an invented feature.
      /follow CRWN[^.]*\.\s*They agree\b/i,
      /\bThey agree with (?:previous |my )?posts\b/i,
    ];
    const hits = upgrades.filter((re) => re.test(caption)).map((re) => re.source);
    expect(hits, `a follow may not be upgraded (found ${hits.join(', ')})`).toHaveLength(0);
    // A like is never evidence, so it is never cited as a credential.
    expect(caption, 'a like is not a credential').not.toMatch(/\bliked (?:one of )?(?:my|the) post/i);
  });

  it.each(carouselFiles)('%s proof line certifies the argument, not just the founder', (file) => {
    const caption = section(readFileSync(join(CAROUSELS_DIR, file), 'utf8'), '**CAPTION:**') ?? '';
    const para = caption.split(/\n\s*\n/).find((b) => /follow CRWN|reposted|cosigned/i.test(b));
    if (!para) return; // proof is optional and rationed
    // A bare list of names certifies the FOUNDER and reads as a flex. The second
    // sentence is what makes those names corroborate the ARGUMENT instead.
    const sentences = para.split(/(?<=\.)\s+/).filter((x) => x.trim().length > 0);
    expect(sentences.length, `proof needs EVIDENCE then MEANING, got one sentence: ${para}`)
      .toBeGreaterThanOrEqual(2);
  });

  it.each(carouselFiles)('%s puts any proof line AFTER the hook question', (file) => {
    const caption = section(readFileSync(join(CAROUSELS_DIR, file), 'utf8'), '**CAPTION:**') ?? '';
    // Detect the PROOF LINE by its own phrasing, not by a name. Searching for
    // "Snoop" matched a post whose SUBJECT is Snoop, where his name is in the
    // hook itself and legitimately precedes the question.
    const proofAt = caption.search(/follow the CRWN app|reposted (?:one of these|a video|my|the)/i);
    if (proofAt === -1) return; // proof is optional and rationed
    const questionAt = caption.indexOf('?');
    expect(questionAt, 'caption must ask the hook question').toBeGreaterThan(-1);
    // The gap opens before any credential, on every surface.
    expect(proofAt, 'social proof must follow the hook question, never precede it')
      .toBeGreaterThan(questionAt);
  });

  it.each(carouselFiles)('%s sidenote names CRWN, not just the belief', (file) => {
    const caption = section(readFileSync(join(CAROUSELS_DIR, file), 'utf8'), '**CAPTION:**') ?? '';
    const holder = caption.search(/Hold that thought/i);
    const anyway = caption.search(/ANYWAY/);
    expect(holder, 'caption must carry the sidenote holder').toBeGreaterThan(-1);
    expect(anyway, 'caption must carry the ANYWAY turn').toBeGreaterThan(holder);
    const sidenote = caption.slice(holder, anyway);
    // It is the CRWN SIDENOTE. Dropping the product turns it into a belief sidenote and
    // removes the only place in the caption where the app is named. Carousel 1 shipped
    // that way once.
    // The product is 'the CRWN app', never bare CRWN: bare CRWN reads as a brand
    // asserting something, the app is a thing the reader can picture opening. Bare CRWN
    // stays correct only where the referent is the company or the account, as in
    // 'follow CRWN', because you follow an account and not an app.
    expect(sidenote, 'the sidenote must name the CRWN app, not only the belief')
      .toMatch(/the CRWN app/i);
    expect(sidenote, 'the sidenote must carry the signature line').toMatch(/market FOR fans/i);
  });

  it.each(carouselFiles)('%s turns into the Wow Factor with an entry phrase', (file) => {
    const caption = section(readFileSync(join(CAROUSELS_DIR, file), 'utf8'), '**CAPTION:**') ?? '';
    const afterAnyway = caption.slice(caption.search(/ANYWAY/));
    // Without a turn line the wow reads as one more number in the reveal, and the most
    // repostable line in the post gets buried in arithmetic.
    expect(afterAnyway, 'the Wow Factor needs an entry phrase after the reveal')
      .toMatch(/here'?s the crazy part|ain'?t even the wild part|here'?s what got me|it gets worse|part that got me/i);
  });

  it.each(carouselFiles)('%s frames BOTH CTAs around a loss', (file) => {
    // Founder call 2026-08-25, and the standing copy rule in CLAUDE.md: lead with what the
    // artist LOSES, never what they gain. This is a COVERAGE proxy, not a judge of copy. It
    // cannot tell a sharp loss frame from a clumsy one. What it reliably catches is the thing
    // that actually went wrong: converting one batch and silently leaving 21 others gain-framed.
    const caption = section(readFileSync(join(CAROUSELS_DIR, file), 'utf8'), '**CAPTION:**') ?? '';
    const LOSS =
      /\b(lose|loses|losing|lost|costs?|costing|never|nobody|nothing|no longer|give up|takes|stops|stopped|before|without|unreachable|signed away|leaving|would have)\b/i;

    const lines = caption.split('\n').map((l) => l.trim()).filter(Boolean);

    const opening = lines[0];
    expect(LOSS.test(opening), `the opening CTA is gain-framed: ${opening}`).toBe(true);

    const offer = caption.match(/I built a free [^\n]*/)?.[0] ?? '';
    expect(LOSS.test(offer), `the offer line is gain-framed: ${offer}`).toBe(true);

    // The ask carries its loss as a CLAUSE, not a word, so the lexicon is the wrong instrument.
    // The old gain-framed ask had no clause at all, which is an exact structural tell.
    const ask = lines[lines.length - 1];
    expect(
      /^Comment "[A-Z0-9]+" and I'll DM you the link\.$/.test(ask),
      `the closing ask carries no loss clause: ${ask}`
    ).toBe(false);
  });

  it.each(carouselFiles)('%s closes on an OFFER line then the ask, never collapsed', (file) => {
    const caption = section(readFileSync(join(CAROUSELS_DIR, file), 'utf8'), '**CAPTION:**') ?? '';
    // "I built a free X that Y" does three jobs the collapsed one-liner cannot: a person
    // built it, "free" lands before the ask, and "that ..." bridges to the reader's own
    // situation. Collapsing them buries the tool behind the ask.
    const offer = caption.match(/I built a free (.+?) that (.+?)[.\n]/);
    expect(offer, 'caption needs an "I built a free X that Y" offer line').toBeTruthy();
    expect(offer![1].trim().length, 'the offer must name the tool').toBeGreaterThan(3);
    expect(offer![2].trim().length, 'the offer must say what it does').toBeGreaterThan(10);
    // The ask closes the caption, and comes after the offer.
    const offerAt = caption.indexOf('I built a free');
    const askAt = caption.lastIndexOf('Comment "');
    expect(askAt, 'the ask must follow the offer line').toBeGreaterThan(offerAt);
    expect(caption.trimEnd(), 'the caption ends on the ask').toMatch(/DM you the link\.$/);
  });

  it.each(carouselFiles)('%s never writes bare CRWN in the caption', (file) => {
    const caption = section(readFileSync(join(CAROUSELS_DIR, file), 'utf8'), '**CAPTION:**') ?? '';
    // Every mention is "the CRWN app", with no exception, including the follow line:
    // the Instagram handle IS the CRWN app, so naming it is accurate rather than clumsy.
    // Bare CRWN in a product sentence reads as a brand asserting something.
    // Case-insensitive: a sentence that OPENS on "The CRWN app" is correct copy, and the
    // case-sensitive split counted it as a bare mention. The banned thing is bare CRWN, which
    // this still catches, because only the full "the CRWN app" phrase is removed first.
    const leftover = caption.replace(/the CRWN app/gi, '');
    const bare = leftover.match(/\bCRWN\b/g) ?? [];
    expect(bare, `every caption mention must be "the CRWN app", found ${bare.length} bare`)
      .toHaveLength(0);
  });

  it.each(carouselFiles)('%s never states the First Paid Member Guarantee', (file) => {
    const caption = section(readFileSync(join(CAROUSELS_DIR, file), 'utf8'), '**CAPTION:**') ?? '';
    // The guarantee is REAL but CONDITIONAL: launch-partner cohort, 100 imported
    // contacts or 40 proven buyers, and every required action completed
    // (src/lib/launchPartner.ts). None of that survives a one-line plug, and a
    // guarantee stripped of its conditions is a promise CRWN has not made.
    const promises = [
      /\bguarantee/i,
      /\bpaid member within\b/i,
      /\b30 days\b/i,
      /\bor we rebuild\b/i,
      /\brelaunch(?:es)? (?:the|your) offer\b/i,
    ];
    const hits = promises.filter((re) => re.test(caption)).map((re) => re.source);
    expect(hits, `the offer belongs after the DM, not in the post (found ${hits.join(', ')})`)
      .toHaveLength(0);
  });

  it.each(carouselFiles)('%s states the fee honestly if it mentions cost at all', (file) => {
    const caption = section(readFileSync(join(CAROUSELS_DIR, file), 'utf8'), '**CAPTION:**') ?? '';
    // "only makes money when you make money" is true on the free Launch plan and
    // FALSE for a Pro ($49/mo) or Scale ($199/mo) subscriber, so the unqualified
    // form may not ship. "Free to start" plus a cut on earnings is the true version.
    expect(caption, 'the unqualified alignment claim is false on the paid plans')
      .not.toMatch(/only makes? money when you make money/i);
  });

  it.each(carouselFiles)('%s never states the First Paid Member Guarantee', (file) => {
    const caption = section(readFileSync(join(CAROUSELS_DIR, file), 'utf8'), '**CAPTION:**') ?? '';
    // The guarantee is REAL but CONDITIONAL: launch-partner cohort, 100 imported
    // contacts or 40 proven buyers, and every required action completed
    // (src/lib/launchPartner.ts). None of that survives a one-line plug, and a
    // guarantee stripped of its conditions is a promise CRWN has not made.
    const promises = [
      /\bguarantee/i,
      /\bpaid member within\b/i,
      /\b30 days\b/i,
      /\bor we rebuild\b/i,
      /\brelaunch(?:es)? (?:the|your) offer\b/i,
    ];
    const hits = promises.filter((re) => re.test(caption)).map((re) => re.source);
    expect(hits, `the offer belongs after the DM, not in the post (found ${hits.join(', ')})`)
      .toHaveLength(0);
  });

  it.each(carouselFiles)('%s states the fee honestly if it mentions cost at all', (file) => {
    const caption = section(readFileSync(join(CAROUSELS_DIR, file), 'utf8'), '**CAPTION:**') ?? '';
    // "only makes money when you make money" is true on the free Launch plan and
    // FALSE for a Pro ($49/mo) or Scale ($199/mo) subscriber, so the unqualified
    // form may not ship. "Free to start" plus a cut on earnings is the true version.
    expect(caption, 'the unqualified alignment claim is false on the paid plans')
      .not.toMatch(/only makes? money when you make money/i);
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
    // The sheets withhold the payoff on purpose; slide 2 is where it lands. The payoff is
    // not always money and not always large: Rapsody's was 328 songs, SAULT's is 5 days,
    // Noname's is 24 chapters. A digit floor of any size was the wrong rule. What actually
    // matters is that a QUOTED line, meaning something that gets drawn on the page, states
    // a figure at all.
    const quoted = slide2.match(/"[^"]*"/g) ?? [];
    const withNumber = quoted.filter((q) => /\d/.test(q));
    expect(withNumber, 'slide 2 must state its number in a line that actually gets drawn')
      .not.toHaveLength(0);
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

  it.each(carouselFiles)('%s slide 3 carries the benefit CTA on one keyword', (file) => {
    const md = readFileSync(join(CAROUSELS_DIR, file), 'utf8');
    const slide3 = section(md, '**SLIDE 3 PROMPT:**') ?? '';
    const caption = section(md, '**CAPTION:**') ?? '';
    // Slide 3 is the slide most likely to be screenshotted alone, so the ask has to
    // travel with it.
    const onSlide = slide3.match(/COMMENT ['"]?([A-Z][A-Z0-9]{2,})['"]?/i);
    expect(onSlide, 'slide 3 must carry a COMMENT KEYWORD CTA').toBeTruthy();
    const inCaption = caption.match(/Comment "?([A-Z][A-Z0-9]{2,})"?/);
    expect(onSlide![1].toUpperCase(), 'slide 3 and the caption must use ONE keyword')
      .toBe(inCaption![1].toUpperCase());
    // Same rule as the caption's opening CTA: promise an outcome, never a product name.
    const productNames = [...LEAD_MAGNETS, ...EXTERNAL_TOOLS]
      .map((t: { name?: string }) => t.name)
      .filter((n): n is string => Boolean(n && n.length > 4));
    const named = productNames.filter((n) => slide3.toUpperCase().includes(n.toUpperCase()));
    expect(named, `slide 3's CTA must name a benefit, not the product (found ${named.join(', ')})`)
      .toHaveLength(0);
    // Slide 4 stays silent: the 128 card never carries an ask.
    const slide4Text = md.slice(md.indexOf('**SLIDE 4'));
    expect(slide4Text).not.toMatch(/COMMENT ['"]/i);
  });

  it.each(carouselFiles)('%s slide 1 headline asks a question and names the artist', (file) => {
    // Slide 1 IS the video sheet, so its headline lives in the source script's prompt.
    const script = readFileSync(join(SCRIPTS_DIR, file), 'utf8');
    const prompt = script.split('**NANO BANANA PRO PROMPT:**')[1] ?? '';
    const m = prompt.match(/with "([^"]+)" on the first line and "([^"]+)" on the second line/);
    expect(m, 'the sheet prompt must set a two-line headline').toBeTruthy();
    const headline = `${m![1]} ${m![2]}`.trim();

    // A statement closes the gap on the opening slide, which is the one slide whose only
    // job is opening it. Four shipped as statements ("HE GAVE 40,000 FANS HIS REAL PHONE
    // NUMBER.") before this was checked.
    expect(headline, `slide 1 headline must be a QUESTION: "${headline}"`).toMatch(/\?$/);

    // And it must name the subject. "HE PRESSED ONE ALBUM HOW MANY WAYS?" is a question
    // about nobody; the name is what makes a scroller stop.
    const artistLine = script.match(/Artist:\s*([^\n·]+)/);
    expect(artistLine, 'the script META must name its artist').toBeTruthy();
    const STOP = new Set(['THE', 'AND', 'GOD', 'VS']);
    const names = artistLine![1]
      .split(/\s+vs\s+/i)
      .flatMap((a) => a.split(/[^A-Za-z0-9$]+/))
      .map((t) => t.toUpperCase())
      .filter((t) => t.length > 2 && !STOP.has(t));
    const upper = headline.toUpperCase();
    expect(
      names.some((t) => upper.includes(t)),
      `slide 1 headline must name the artist (${names.join('/')}): "${headline}"`
    ).toBe(true);
  });

  it.each(carouselFiles)('%s never writes its own slide 4 prompt', (file) => {
    const md = readFileSync(join(CAROUSELS_DIR, file), 'utf8');
    // The end card is one shared asset copied by the generator.
    expect(md).not.toContain('**SLIDE 4 PROMPT:**');
  });

  it.each(carouselFiles)('%s draws no CRWN mark on any rendered slide', (file) => {
    const md = readFileSync(join(CAROUSELS_DIR, file), 'utf8');
    // Slide 2 is the payoff and never names the product: a plug there interrupts the reveal.
    const slide2 = section(md, '**SLIDE 2 PROMPT:**') ?? '';
    expect(slide2, 'slide 2 must forbid the CRWN mark').toMatch(/[Nn]ever draw the word CRWN/);

    // Slide 3 NAMES the app (ratified 2026-08-21 after a three-carousel pilot). Required,
    // not optional: before this, no slide in any carousel named the app at all, because
    // the plug lived only in the caption and the 128 card is silent.
    const slide3 = section(md, '**SLIDE 3 PROMPT:**') ?? '';
    expect(slide3, 'slide 3 must carry the CRWN plug line')
      .toMatch(/THAT'S WHAT THE CRWN APP IS BUILT FOR\./);
    // The plug names the app; the crown MARK stays exclusive to the 128 end card.
    expect(slide3, 'slide 3 must still ban the crown symbol')
      .toMatch(/Do NOT draw a crown symbol/);
    expect(slide3, 'the plug must be the ONLY place the letters CRWN appear')
      .toMatch(/ONLY inside the one quoted plug line/);
  });
});

describe.runIf(carouselFiles.length > 1)('FE-CAR-004 the connective machinery varies across the corpus', () => {
  // The skill already TOLD writers to rotate the wow entry ("at most once per batch") and it was
  // ignored 21 times out of 21, alongside a turn line and a framing skeleton that were also
  // verbatim across unrelated posts. An instruction that is disobeyed corpus-wide needs a check,
  // not more prose. These assert DIVERSITY, never a banned word: any single phrase is fine, a
  // phrase in most of the corpus is the template showing through.
  const captions = carouselFiles.map(
    (f) => section(readFileSync(join(CAROUSELS_DIR, f), 'utf8'), '**CAPTION:**') ?? ''
  );

  // Repeats that are SUPPOSED to be identical: the ratified signature line, the series anchors,
  // and the offer/ask pair, which is one fixed two-line form per tool by design.
  const RATIFIED = [
    /market FOR fans/,
    /don'?t need to market to fans/,
    /^ANYWAY/,
    /^Hold that thought/,
    /^I built a free /,
    /^Comment ["']/,
  ];

  it('no single wow entry phrase dominates the set', () => {
    const counts = new Map<string, number>();
    for (const c of captions) {
      const m = c.match(/here'?s the crazy part|ain'?t even the wild part|here'?s what got me|it gets worse|part that got me/i);
      const k = (m?.[0] ?? 'MISSING').toLowerCase();
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    expect(counts.size, `the wow entry must rotate, found only ${[...counts.keys()].join(', ')}`)
      .toBeGreaterThanOrEqual(3);
    const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    expect(n / captions.length, `"${top}" opens the wow in ${n}/${captions.length} captions`)
      .toBeLessThanOrEqual(0.5);
  });

  it('no connective sentence appears in more than half the captions', () => {
    const counts = new Map<string, number>();
    for (const c of captions) {
      const seen = new Set<string>();
      for (const raw of c.split(/(?<=[.?!])\s+/)) {
        const s = raw.trim();
        if (s.split(/\s+/).length < 6) continue; // short lines are punchlines, not machinery
        if (RATIFIED.some((re) => re.test(s))) continue;
        seen.add(s);
      }
      for (const s of seen) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    const worst = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!worst) return;
    const [sentence, n] = worst;
    expect(n / captions.length, `"${sentence}" appears in ${n}/${captions.length} captions verbatim`)
      .toBeLessThanOrEqual(0.5);
  });
});
