// The six promoted calculators are six DOORS into one story.
//
// Before the 2026-08-14 positioning pass they were six eras: a "streaming pays pennies" page, an
// "idle files equal lost money" page, an "own your fans" page, and a generic showcase underneath
// all of them whose mockups advertised the leaderboard, Sync, the AI actions feed, the clipper
// program and email sequences, none of which the pre-PMF product reduction leaves reachable.
//
// These tests pin the two halves of the fix that regress silently: the SHARED layer owning the
// canonical story, and the per-tool doorway owning only what must stay different. Copy drift is
// invisible in a build and invisible in a type check, so it gets asserted here.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { TOOL_DOORWAYS, PROMOTED_MARKETING_SLUGS, hasDoorway, getDoorway } from './positioning';
import { LEAD_MAGNETS, EXTERNAL_TOOLS, getLeadMagnet } from './registry';
import { PROMOTED_TOOL_KEYS, OPPORTUNITY_FUNNELS } from '@/lib/opportunityFunnels/registry';
import { SECTION_ART } from '@/lib/positioning/sectionImages';
import { GUARANTEE_BODY, PATH_STEPS, LOOP, FRL_BODY, FRL_CAPACITY_NOTE, ONE_SYSTEM } from '@/lib/positioning/story';

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf-8');

const toolMarketing = read('src/components/lead-magnets/ToolMarketing.tsx');
const publicToolClient = read('src/components/lead-magnets/PublicToolClient.tsx');
const homeMarketing = read('src/app/HomeMarketing.tsx');
const homeFunnel = read('src/app/HomeFunnel.tsx');
const worth = read('src/app/(public)/worth/WorthExperience.tsx');
const toolHero = read('src/components/lead-magnets/ToolHero.tsx');
const sectionImage = read('src/components/ui/SectionImage.tsx');
const resultPage = read('src/app/(public)/tools/[slug]/result/[token]/page.tsx');
const leadMagnetResult = read('src/components/lead-magnets/LeadMagnetResult.tsx');

/**
 * Source with comments removed.
 *
 * Structural assertions below are about what the component RENDERS, and a comment explaining why
 * something was removed contains the very string that proves it was removed. That false positive
 * has now bitten three separate assertions, so the fix is a stripped view rather than another
 * cleverer regex.
 */
const code = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const toolHeroCode = code(toolHero);

/** Every string a visitor to a promoted calculator can read, from the registry side. */
function promotedCopy(): string {
  const parts: string[] = [];
  for (const slug of PROMOTED_MARKETING_SLUGS) {
    const cfg = getLeadMagnet(slug);
    if (cfg) {
      parts.push(cfg.name, cfg.description, cfg.videoAngle ?? '', cfg.hero.headline, cfg.hero.subheadline, cfg.hero.primaryCta);
      parts.push(...cfg.wizardSteps.flatMap((s) => [s.title, s.subtitle ?? '', s.group ?? '']));
      parts.push(...cfg.inputs.flatMap((i) => [i.label, i.help ?? '', ...(i.options ?? []).flatMap((o) => [o.label, o.hint ?? ''])]));
    }
    const ext = EXTERNAL_TOOLS.find((t) => t.key === slug);
    if (ext) parts.push(ext.name, ext.description);
    const door = getDoorway(slug);
    if (door) parts.push(door.lens, door.revealsTitle, door.revealsBody, door.connectsBody);
  }
  return parts.join(' \n ');
}

describe('the promoted set and its doorways cannot drift apart', () => {
  it('is exactly the intentional public acquisition doors', () => {
    // Seven since 2026-08-16: the founder is promoting Live Experiences in content alongside
    // Executive Producer Sessions, so its calculator rejoined the set with a doorway, a trimmed
    // hero and its own illustrated webp, the same contract as the original six.
    // Nine since 2026-08-20: the founder brought back the Between-Tour and Proof of Demand
    // calculators, each with the same full contract.
    expect([...PROMOTED_MARKETING_SLUGS]).toEqual(
      ['between-tour-calculator', 'executive-producer-session', 'live-experience-calculator', 'opportunity-calculator', 'own-your-fans-calculator', 'proof-of-demand-test-builder', 'share-to-earn-planner', 'vault-revenue-planner', 'worth'],
    );
    expect(PROMOTED_MARKETING_SLUGS).toHaveLength(9);
  });

  it('every promoted tool owns a doorway, and no paused tool does', () => {
    // Both directions. A promoted tool with no doorway renders no lower page at all; a doorway
    // for a paused tool is copy nobody will ever read, drifting quietly out of date.
    for (const slug of PROMOTED_TOOL_KEYS) expect(hasDoorway(slug), slug).toBe(true);
    for (const slug of Object.keys(TOOL_DOORWAYS)) expect(PROMOTED_TOOL_KEYS.has(slug), slug).toBe(true);
  });

  it('paused calculators stay routable and are never promoted', () => {
    const paused = LEAD_MAGNETS.filter((m) => !PROMOTED_TOOL_KEYS.has(m.slug));
    expect(paused.length).toBeGreaterThan(0);
    for (const m of paused) {
      expect(m.publicRoute, m.slug).toMatch(/^\/tools\//);
      expect(hasDoorway(m.slug), m.slug).toBe(false);
    }
  });

  it('every doorway says its finding is one lens rather than a separate business', () => {
    for (const [slug, door] of Object.entries(TOOL_DOORWAYS)) {
      expect(door.revealsBody.length, slug).toBeGreaterThan(120);
      expect(door.connectsBody.length, slug).toBeGreaterThan(80);
    }
  });

  it('keeps every hook DISTINCT, so the pass did not flatten the doors into one page', () => {
    const titles = Object.values(TOOL_DOORWAYS).map((d) => d.revealsTitle);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('keeps the above-the-fold copy short enough to actually be read', () => {
    // The 2026-08-14 positioning rewrite made the argument correct and the heroes long: the six
    // promoted subheadlines ran 46 to 60 words while the PAUSED tools, written earlier, sat at 22
    // to 28. Above the fold, a paragraph is a bounce. The whole hero has one job, which is to get
    // a visitor into the wizard, and the page below it is where the argument gets made.
    const words = (s: string) => s.trim().split(/\s+/).length;
    for (const slug of PROMOTED_MARKETING_SLUGS) {
      const cfg = getLeadMagnet(slug);
      if (!cfg) continue; // /worth is not registry-driven; asserted against its own source below.
      expect(words(cfg.hero.headline), `${slug} headline`).toBeLessThanOrEqual(14);
      expect(words(cfg.hero.subheadline), `${slug} subheadline`).toBeLessThanOrEqual(28);
      expect(words(cfg.hero.primaryCta), `${slug} cta`).toBeLessThanOrEqual(7);
      // Two sentences is the ceiling: a third is the paragraph creeping back in.
      expect((cfg.hero.subheadline.match(/[.!?](\s|$)/g) ?? []).length, `${slug} sentences`).toBeLessThanOrEqual(2);
    }
  });

  it('holds /worth to the same limit, in both places its hero is written', () => {
    // The hero exists twice in this file: the ToolHero on the calculator route, and the fallback
    // block that only renders if the registry ever loses the Opportunity Calculator. They drifted
    // apart once already, so both are asserted.
    const heroes = worth.match(/headline="([^"]{10,400})"/g) ?? [];
    expect(heroes.length).toBeGreaterThan(0);
    for (const h of heroes) {
      const text = h.replace(/^.*?headline="/, '').replace(/"$/, '');
      expect(text.trim().split(/\s+/).length, text).toBeLessThanOrEqual(28);
    }
    expect(worth).toContain('Streaming built your reach. It cannot tell you who pays.');
  });
});

describe('every headline opens on a brand photograph', () => {
  it('opens every marketing section with an image, not just the first', () => {
    // The wall of text was the reason for this: eyebrow, heading, paragraph, repeat, with only a
    // small caps line marking where a section began. A 64px icon badge was tried first and read
    // as a bullet on a 700px desktop column, so it became a photograph.
    expect((homeMarketing.match(/<Eyebrow art=\{/g) ?? []).length, 'homepage sections').toBe(7);
    expect((toolMarketing.match(/<Eyebrow art=\{/g) ?? []).length, 'calculator sections').toBe(4);
    // Plus the closing card on each, which has a heading but no eyebrow.
    expect(homeMarketing).toMatch(/<SectionImage src=\{SECTION_ART\.close\.src\}/);
    expect(toolMarketing).toMatch(/<SectionImage src=\{SECTION_ART\.toolClose\.src\}/);
    // No bare Eyebrow, and no leftover icon badge, on either surface.
    expect(homeMarketing).not.toMatch(/<Eyebrow>/);
    expect(toolMarketing).not.toMatch(/<Eyebrow>/);
    expect(`${homeMarketing}${toolMarketing}`).not.toContain('SectionIcon');
  });

  it('points every section at a real file, with real alt text', () => {
    // A broken src is invisible in a type check and silent in a build: Next renders an empty box.
    for (const [key, art] of Object.entries(SECTION_ART)) {
      // WebP, not JPEG: flat vector art is the worst case for DCT and the set is 90% smaller this way.
      expect(art.src, key).toMatch(/^\/[a-z0-9-]+\.webp$/);
      expect(existsSync(join(root, 'public', art.src.slice(1))), `${key} -> ${art.src}`).toBe(true);
      // Alt text describes the photograph for a screen reader, so it may not be a slug or a label.
      expect(art.alt.split(/\s+/).length, `${key} alt`).toBeGreaterThan(4);
    }
  });

  it('never shows the same photograph twice on one page', () => {
    // Repeating an image within a single page reads as an oversight rather than a system.
    const home = ['problem', 'path', 'operatingSystem', 'launch', 'operates', 'pricing', 'questions', 'close'] as const;
    const tool = ['reveals', 'oneEconomy', 'path', 'launch', 'toolClose'] as const;
    for (const [label, keys] of [['homepage', home], ['calculator', tool]] as const) {
      const srcs = keys.map((k) => SECTION_ART[k].src);
      expect(new Set(srcs).size, `${label} has a duplicate image`).toBe(srcs.length);
    }
  });

  it('ships no brand image with a white frame baked into it', async () => {
    // The generator drew a 25px white border around one hero and it reached production. The house
    // rule already said "always look at every image", and I did look at this one: a thin white
    // frame is simply not visible at review scale against a page that is already dark. Eyes are the
    // wrong instrument for this, so the edges get measured instead.
    //
    // `sharp` is a transitive dependency of Next rather than a declared one, so an unavailable
    // sharp SKIPS rather than fails. A guard that breaks the suite when an unrelated upgrade moves
    // a package is worse than no guard.
    // Structurally typed rather than `typeof import('sharp')`: the package is transitive, so its
    // types are not guaranteed to resolve here, and only these two calls are used.
    type SharpLike = (input: string) => {
      metadata(): Promise<{ width?: number; height?: number }>;
      raw(): { toBuffer(): Promise<Buffer> };
    };
    let sharp: SharpLike;
    try {
      sharp = ((await import('sharp')) as unknown as { default: SharpLike }).default;
    } catch {
      console.warn('[brand art] sharp unavailable, edge check skipped');
      return;
    }

    const files = readdirSync(join(root, 'public')).filter((f) => /^(hero|section)-.*\.webp$/.test(f));
    expect(files.length, 'brand art is present').toBeGreaterThan(10);

    for (const file of files) {
      const img = sharp(join(root, 'public', file));
      const { width = 0, height = 0 } = await img.metadata();
      const raw = await img.raw().toBuffer();
      const lum = (x: number, y: number) => {
        const i = (y * width + x) * 3;
        return (raw[i] + raw[i + 1] + raw[i + 2]) / 3;
      };
      // Sample each edge. A brand image sits on #0D0D0D, so an edge that is mostly near-white is a
      // frame the model drew, never artwork.
      const edges: [string, number[]][] = [
        ['top', Array.from({ length: 40 }, (_, i) => lum(Math.floor((width * (i + 0.5)) / 40), 0))],
        ['bottom', Array.from({ length: 40 }, (_, i) => lum(Math.floor((width * (i + 0.5)) / 40), height - 1))],
        ['left', Array.from({ length: 40 }, (_, i) => lum(0, Math.floor((height * (i + 0.5)) / 40)))],
        ['right', Array.from({ length: 40 }, (_, i) => lum(width - 1, Math.floor((height * (i + 0.5)) / 40)))],
      ];
      for (const [side, samples] of edges) {
        const nearWhite = samples.filter((v) => v > 200).length / samples.length;
        expect(nearWhite, `${file} has a white ${side} border`).toBeLessThan(0.5);
      }
    }
  });

  it('uses photographs, never emoji, on an acquisition surface', () => {
    // The registry still carries an emoji per tool for internal listings. It may not reach a
    // marketing surface: emoji render differently per platform, cannot take the brand gold, and
    // read as clip art beside the hero photograph. Same rule the Studio tiles follow.
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    expect(homeMarketing).not.toMatch(emoji);
    expect(toolMarketing).not.toMatch(emoji);
    expect(sectionImage).not.toMatch(emoji);
  });

  it('leaves the hero to its own single image', () => {
    // ToolHero already leads with a full-bleed image, so it takes no second visual. Its header
    // comment records that the fold was measured on a 375x667 phone with the CTA below this block.
    expect(toolHero).toContain('<Image src={image}');
    expect(toolHeroCode).not.toContain('SectionIcon');
    expect(toolHeroCode).not.toContain('SectionImage');
  });

  it('gives every promoted hero the illustrated set, each one its own', () => {
    // Above the fold matters more than below it: a photographic hero over illustrated sections
    // reads as two brands on one page.
    const heroes = PROMOTED_MARKETING_SLUGS.map((slug) => {
      const cfg = getLeadMagnet(slug);
      if (cfg) return { slug, src: cfg.hero.image, alt: cfg.hero.imageAlt };
      const ext = EXTERNAL_TOOLS.find((t) => t.key === slug)!;
      return { slug, src: ext.image, alt: ext.imageAlt };
    });
    for (const h of heroes) {
      expect(h.src, h.slug).toMatch(/^\/hero-[a-z0-9-]+\.webp$/);
      expect(existsSync(join(root, 'public', h.src.slice(1))), `${h.slug} -> ${h.src}`).toBe(true);
      // Alt describes an illustration for a screen reader, not a slug.
      expect(h.alt.split(/\s+/).length, `${h.slug} alt`).toBeGreaterThan(4);
    }
    // As many images as doors: uniqueness is the property, so derive the count from the set.
    expect(new Set(heroes.map((h) => h.src)).size).toBe(heroes.length);
  });

  it('renders four elements in the hero and nothing else', () => {
    // Image, headline, subheadline, button. The qualifying eyebrow and the "Takes about N. Free."
    // line were removed on every surface (founder call, 2026-08-15). They are gone from the props
    // entirely rather than left optional, because an optional prop nobody passes is dead surface
    // that quietly invites the elements back.
    expect(toolHeroCode).not.toMatch(/eyebrow/);
    expect(toolHeroCode).not.toMatch(/timeToComplete/);
    expect(toolHeroCode).not.toMatch(/Takes about/);
    // The callers stopped passing them too, so nothing is being silently dropped on the floor.
    expect(code(publicToolClient)).not.toMatch(/eyebrow=\{/);
    expect(code(publicToolClient)).not.toMatch(/timeToComplete=\{/);
    expect(code(worth)).not.toMatch(/eyebrow="/);
    // `timeToComplete` STAYS in the registry: LeadMagnetDirectory renders it on /tools and
    // automationDispatcher sends it as `howLong`. Verified by grep, not assumed.
    expect(getLeadMagnet('vault-revenue-planner')!.timeToComplete).toBeTruthy();
    // `hero.eyebrow` is GONE from the registry, not merely unrendered. Once the hero stopped
    // reading it, nothing else did, so keeping it would have been the dead surface this very
    // test was written to prevent.
    expect(LEAD_MAGNETS.every((m) => !('eyebrow' in m.hero))).toBe(true);
  });

  it('stacks the hero in one centred column, image on top, at every breakpoint', () => {
    expect(toolHeroCode).toMatch(/mx-auto flex max-w-2xl flex-col items-center text-center/);
    // No side-by-side desktop grid, and no per-breakpoint reordering that would put the image
    // beside or below the copy again.
    expect(toolHeroCode).not.toMatch(/md:grid-cols-2/);
    expect(toolHeroCode).not.toMatch(/md:order-/);
  });

  it('keeps the CTA above the fold BY CONSTRUCTION, not by a height budget', () => {
    // Two earlier versions budgeted the fold by hand and both were wrong on a real screen, because
    // the copy block is not a fixed height: the headline wraps to two or three lines depending on
    // the tool and the viewport. So on desktop the hero is exactly one viewport tall, the copy is
    // `shrink-0`, and the image is `flex-1` and absorbs whatever is left. A headline that wraps now
    // costs the image height, never the button its place on screen.
    expect(toolHeroCode).toMatch(/md:h-\[calc\(100svh-\d+rem\)\]/);
    expect(toolHeroCode).toMatch(/md:flex-1 md:min-h-0/);
    expect(toolHeroCode).toMatch(/shrink-0 flex flex-col items-center text-center/);
    // The regression to guard against: any fixed or aspect-derived image height on DESKTOP puts
    // the budget back and the button below the fold with it.
    expect(toolHeroCode).not.toMatch(/md:max-h-\[\d+vh\]/);
    expect(toolHeroCode).not.toMatch(/md:h-\[\d+vh\]/);
    expect(toolHeroCode).not.toMatch(/mt-auto/);
    // This used to ban the literal string `aspect-[4/3]`, which was the ratio that broke the
    // fold when it applied at EVERY breakpoint. The rule it was standing in for is the one
    // asserted here instead, and it is strictly stronger: the image may carry whatever ratio
    // mobile needs, but every ratio must be neutralised at `md`, and no ratio may be md-scoped.
    // (Founder call 2026-08-14: reveal more of the photo. Mobile now takes 4:3 above 700px of
    // viewport height and stays 16:9 below it, which was measured at 375x667, 390x844, 430x932,
    // 1280x800 and 1440x900 rather than budgeted. Re-measure if you change the ratio.)
    expect(toolHeroCode).toMatch(/md:aspect-auto/);
    expect(toolHeroCode).not.toMatch(/md:aspect-\[/);
  });

  it('keeps the section images below the fold, so they never race the hero', () => {
    // Asserted on the JSX, not the file: the doc comment above it explains that `priority` is
    // deliberately absent, and matching that sentence would fail the test for saying so.
    expect(sectionImage).toMatch(/<Image[^>]*loading="lazy"/);
    expect(sectionImage).not.toMatch(/<Image[^>]*\spriority/);
    // The hero photo keeps its priority: it IS the fold.
    expect(toolHero).toMatch(/<Image[^>]*\spriority/);
  });
});

describe('the canonical story has exactly one source', () => {
  it('the homepage and the tool pages both read it, rather than keeping copies', () => {
    expect(homeMarketing).toMatch(/from '@\/lib\/positioning\/story'/);
    expect(toolMarketing).toMatch(/from '@\/lib\/positioning\/story'/);
    // The old inline definitions are gone from the homepage, or they would drift again.
    expect(homeMarketing).not.toMatch(/const PATH_STEPS/);
    expect(homeMarketing).not.toMatch(/const LOOP =/);
  });

  it('"Prove" means a real first paid member on every surface', () => {
    const prove = PATH_STEPS.find((s) => s.name === 'Prove');
    expect(prove?.body).toMatch(/first paid CRWN member/);
    expect(LOOP).toHaveLength(5);
  });

  it('uses the current guarantee semantics: a rebuild, never an income result', () => {
    expect(GUARANTEE_BODY).toMatch(/at least one\s+paid member within 30 days/);
    // The remedy clause carries the limit. Until 2026-08-22 a second sentence restated it
    // ("not a specific income result"); the founder cut it as a defensive aside, so the WHOLE
    // remedy is asserted here instead of the two words it opens with. A guarantee that named a
    // consequence without naming its remedy would read as a promise of the outcome.
    expect(GUARANTEE_BODY).toMatch(/rebuilds and relaunches the offer at no additional service charge/);
    expect(GUARANTEE_BODY.toLowerCase()).not.toMatch(/guaranteed income|guaranteed revenue|guaranteed subscribers/);
    expect(FRL_BODY).toMatch(/qualified artists/i);
  });
});

describe('promoted calculator copy matches current positioning', () => {
  // Only what a VISITOR can read: the registry copy, the doorways, and the shared story the
  // narrative renders. Deliberately NOT the component source, because the file comments explain
  // which hidden surfaces were removed and naming them there is documentation, not advertising.
  const copy = promotedCopy();
  const surfaces = [copy, FRL_BODY, GUARANTEE_BODY, ...PATH_STEPS.flatMap((s) => [s.name, s.body]), ...LOOP, FRL_CAPACITY_NOTE, ...ONE_SYSTEM].join(' \n ');

  it('never claims literal ownership of people', () => {
    // The tool NAME and route survive (campaign links and DM keywords are keyed to them). The
    // customer-facing CLAIM does not: artists own the relationship, the data and the permission.
    const oyf = getLeadMagnet('own-your-fans-calculator')!;
    // Everything a visitor READS on the page, eyebrow included: that was the last surface still
    // asserting ownership of people, and it sat directly above the headline.
    const claim = `${oyf.hero.headline} ${oyf.hero.subheadline} ${oyf.hero.primaryCta} ${oyf.description}`;
    expect(claim.toLowerCase()).not.toMatch(/own your fans|owning your fans|own them|you own your fans/);
    // The identifiers stay: campaign links and DM triggers are keyed to them.
    expect(oyf.slug).toBe('own-your-fans-calculator');
    expect(oyf.dmKeywords).toContain('own');
    expect(getDoorway('own-your-fans-calculator')!.revealsBody).toMatch(/cannot own a person/i);
  });

  it('keeps streaming as discovery and never as the villain', () => {
    expect(surfaces.toLowerCase()).not.toMatch(/streaming pays pennies|streaming is the enemy|streaming barely pays|fractions of a cent/);
    expect(surfaces.toLowerCase()).not.toMatch(/followers do not matter|followers don't matter|reach does not matter/);
    expect(getDoorway('worth')!.revealsBody).toMatch(/good at that job|discovery/i);
  });

  it('makes no passive-income, viral or guaranteed-income claim', () => {
    expect(surfaces.toLowerCase()).not.toMatch(/passive income|go viral|guaranteed growth|guaranteed income|replace your team|ai runs your career/);
  });

  it('uses no beginner framing at an ICP that already sells direct', () => {
    expect(surfaces.toLowerCase()).not.toMatch(/start making money from your music|get your first fans|build an audience from scratch|turn your passion into profit/);
  });

  it('advertises no surface the product reduction hid', () => {
    // A promoted acquisition door may not promise a product the visitor cannot then find.
    for (const hidden of ['leaderboard', 'sync marketplace', 'ai manager', 'playbook', 'bounty', 'squad']) {
      expect(surfaces.toLowerCase(), hidden).not.toContain(hidden);
    }
  });

  it('writes no em dash or en dash anywhere a visitor can read', () => {
    expect(surfaces).not.toMatch(/[—–]/);
    expect(toolMarketing).not.toMatch(/[—–]/);
  });

  it('positions the acquisition mechanisms as acquisition, never as a second revenue line', () => {
    expect(getDoorway('share-to-earn-planner')!.connectsBody).toMatch(/never added on top|counted once/i);
    expect(getDoorway('vault-revenue-planner')!.connectsBody).toMatch(/not a second product|inside your membership/i);
    expect(getDoorway('opportunity-calculator')!.connectsBody).toMatch(/counted twice/i);
  });
});

describe('page composition', () => {
  it('a promoted tool renders the positioning narrative instead of the generic showcase', () => {
    expect(publicToolClient).toMatch(/const promotedMarketing = surface === 'tool' && hasDoorway\(config\.slug\)/);
    expect(publicToolClient).toMatch(/const showGenericShowcase = surface === 'tool' && !promotedMarketing/);
    // Both showcase mounts (hero phase and result phase) go through the promoted-aware guard.
    expect(publicToolClient.match(/showGenericShowcase/g) ?? []).toHaveLength(3);
  });

  it('the narrative is presentation only: no second calculator, result, builder or hand-raiser', () => {
    for (const forbidden of ['LeadMagnetWizard', 'LeadMagnetResult', 'DeliverableBuilder', 'CallRequestCard', 'trackLeadMagnet', 'trackOpportunity', 'recordFunnelEvent']) {
      expect(toolMarketing, forbidden).not.toContain(forbidden);
    }
  });

  it('returns both narrative controls to the CALCULATOR, never the top of the page', () => {
    // Scrolling to top landed the reader back on the hero: a photograph and a headline they had
    // already read, with the questions still off screen. Both buttons are asking for the same
    // thing, so both go to the wizard. Top of page survives only as a last resort, for a surface
    // that renders this narrative with no calculator on it at all.
    const tm = code(toolMarketing);
    expect(tm).toMatch(/scrollToCalculator/);
    expect(tm).toMatch(/scrollToAnchor\(WIZARD_ANCHOR_ID, 'start'\)/);
    expect(tm).not.toMatch(/scrollToTop/);
    expect(tm).toMatch(/if \(!scrollToAnchor\(QUALIFY_ANCHOR_ID\)\) scrollToCalculator\(\)/);
    expect(tm).toMatch(/if \(!completed \|\| !scrollToAnchor\(PLAN_ANCHOR_ID\)\) scrollToCalculator\(\)/);
    // The homepage narrative must keep doing the same thing, or the two drift apart again.
    expect(code(homeMarketing)).toMatch(/scrollToCalculator/);
  });

  it('anchors the calculator on every surface that renders the narrative', () => {
    // /worth writes its own wizard instead of mounting PublicToolClient's, so without the shared
    // anchor the lookup above would fall straight through to the top of the page there.
    expect(code(publicToolClient)).toMatch(/id=\{WIZARD_ANCHOR_ID\}/);
    expect(code(worth)).toMatch(/id=\{WIZARD_ANCHOR_ID\}/);
  });

  it('sends an unfinished visitor back to the calculator rather than asking to qualify them', () => {
    // Qualification is scored server-side from the calculator answers, so the control cannot be
    // useful before a result exists.
    expect(toolMarketing).toMatch(/QUALIFY_ANCHOR_ID/);
    expect(toolMarketing).toMatch(/PLAN_ANCHOR_ID/);
    expect(toolMarketing).toMatch(/Run your numbers first/);
  });

  it('puts the CTA above the fold on the phone a ManyChat lead actually arrives on', () => {
    // The page opened with 56px of brand margin, a 60px number, a five-line summary and a 2x2 tile
    // grid before the email capture, so every button was off the first screen. The tiles are
    // supporting evidence, not the promise, so they moved BELOW the ask.
    const rp = code(resultPage);
    const capture = rp.indexOf('<LeadEmailCta');
    const tiles = rp.indexOf('heroTiles?.metrics');
    expect(capture).toBeGreaterThan(-1);
    expect(tiles, 'the supporting tiles must render AFTER the ask, not before it').toBeGreaterThan(capture);
    // Mobile chrome is trimmed; sm: keeps the original desktop proportions.
    expect(rp).toMatch(/py-8 sm:py-16/);
    expect(rp).toMatch(/mb-8 sm:mb-14/);
    expect(rp).toMatch(/text-5xl sm:text-7xl/);
  });

  it('keeps the conservative/expected/high row inside its tiles on a phone, in BOTH renderers', () => {
    // Three columns of money at 18px overflowed a 390px screen and the values collided. Results
    // draw through two renderers and fixing one is the standing trap with this pair, so both are
    // asserted: smaller type on mobile, and `min-w-0` so a grid item may shrink below its content
    // instead of forcing its track wider than the column.
    for (const [name, src] of [['result page', resultPage], ['LeadMagnetResult', leadMagnetResult]] as const) {
      const c = code(src);
      expect(c, `${name} scenarios tile`).toMatch(/min-w-0 rounded-xl p-2 sm:p-[34]/);
      expect(c, `${name} scenarios value`).toMatch(/break-words/);
      expect(c, `${name} still three columns`).toMatch(/grid grid-cols-3/);
    }
  });

  it('the ManyChat result page gets the same narrative, not the old showcase', () => {
    // The tokenized result page is where a ManyChat lead lands, and it is a SEPARATE renderer from
    // the funnel page. It was missed when the positioning pass shipped, so the highest-intent
    // audience CRWN has was the last one still being shown CrwnShowcase, whose mockups advertise
    // the leaderboard, Sync, the AI actions feed, the clipper program and email sequences.
    expect(code(resultPage)).toMatch(/<ToolMarketing slug=\{result\.toolSlug \|\| slug\}/);
    // It has no funnel of its own, so the narrative must be told that: without `continueHref` its
    // qualify and close controls scroll to the top of the page while claiming to open something.
    expect(code(resultPage)).toMatch(/continueHref=\{claimed \? '\/profile\/artist' : claimHref\}/);
    // Paused tools KEEP the old showcase: they have no doorway, so ToolMarketing renders nothing
    // and their still-live Reels would land on a result with no pitch underneath it.
    expect(code(resultPage)).toMatch(/hasDoorway\(result\.toolSlug \|\| slug\)/);
    expect(code(resultPage)).toMatch(/<CrwnShowcase/);
  });

  it('ToolMarketing never leaves a control pointing at a scroll target that is not there', () => {
    // On a surface with no funnel the two scroll handlers are wrong, so both controls become links.
    const tm = code(toolMarketing);
    expect(tm).toMatch(/continueHref \? \(\s*<Link/);
    expect((tm.match(/<Link\s+href=\{continueHref\}/g) ?? []).length).toBe(2);
  });

  it('the homepage is untouched by the calculator narrative', () => {
    expect(homeFunnel).toMatch(/HomeMarketing/);
    expect(homeFunnel).not.toMatch(/ToolMarketing/);
    expect(homeMarketing).not.toMatch(/ToolMarketing/);
    // The homepage passes its own `below`, so the promoted-tool default can never reach it.
    expect(homeFunnel).toMatch(/surface="homepage"/);
  });

  it('/worth joins the same positioning system without losing its own calculator', () => {
    expect(worth).toMatch(/<ToolMarketing slug="worth"/);
    // Its personalized ladder survives: that is the one evidence-backed depth beat on the page.
    expect(worth).toMatch(/The ladder that holds it/);
    // The feature-led stack it used to carry is gone.
    for (const gone of ['CompareTable', 'RevenueStack', 'MONETIZE_WAYS', 'ShopMock', 'TiersMock']) {
      expect(worth, gone).not.toContain(gone);
    }
  });

  it('leaves the funnel contracts alone', () => {
    // Routes, analytics ids and optional capture are keyed to historical rows and live campaign
    // links. A positioning pass may never move them.
    for (const slug of ['worth', 'vault-revenue-planner', 'share-to-earn-planner', 'executive-producer-session', 'own-your-fans-calculator', 'opportunity-calculator']) {
      const funnel = OPPORTUNITY_FUNNELS.find((f) => f.toolKey === slug);
      expect(funnel, slug).toBeTruthy();
    }
    for (const cfg of LEAD_MAGNETS) {
      expect(cfg.leadCapture.required, cfg.slug).toBe(false);
    }
    expect(getLeadMagnet('opportunity-calculator')!.analyticsMetadata.toolId).toBe('opportunity-calculator');
    expect(getLeadMagnet('own-your-fans-calculator')!.publicRoute).toBe('/tools/own-your-fans-calculator');
  });
});
