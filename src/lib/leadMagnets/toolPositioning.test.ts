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
import { readFileSync } from 'fs';
import { join } from 'path';
import { TOOL_DOORWAYS, PROMOTED_MARKETING_SLUGS, hasDoorway, getDoorway } from './positioning';
import { LEAD_MAGNETS, EXTERNAL_TOOLS, getLeadMagnet } from './registry';
import { PROMOTED_TOOL_KEYS, OPPORTUNITY_FUNNELS } from '@/lib/opportunityFunnels/registry';
import { GUARANTEE_BODY, PATH_STEPS, LOOP, FRL_BODY, FRL_CAPACITY_NOTE, ONE_SYSTEM } from '@/lib/positioning/story';

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf-8');

const toolMarketing = read('src/components/lead-magnets/ToolMarketing.tsx');
const publicToolClient = read('src/components/lead-magnets/PublicToolClient.tsx');
const homeMarketing = read('src/app/HomeMarketing.tsx');
const homeFunnel = read('src/app/HomeFunnel.tsx');
const worth = read('src/app/(public)/worth/WorthExperience.tsx');

/** Every string a visitor to a promoted calculator can read, from the registry side. */
function promotedCopy(): string {
  const parts: string[] = [];
  for (const slug of PROMOTED_MARKETING_SLUGS) {
    const cfg = getLeadMagnet(slug);
    if (cfg) {
      parts.push(cfg.name, cfg.description, cfg.videoAngle ?? '', cfg.hero.eyebrow ?? '', cfg.hero.headline, cfg.hero.subheadline, cfg.hero.primaryCta);
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
  it('is exactly the six intentional public acquisition doors', () => {
    expect([...PROMOTED_MARKETING_SLUGS]).toEqual(
      ['executive-producer-session', 'opportunity-calculator', 'own-your-fans-calculator', 'share-to-earn-planner', 'vault-revenue-planner', 'worth'],
    );
    expect(PROMOTED_MARKETING_SLUGS).toHaveLength(6);
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

  it('keeps six DISTINCT hooks, so the pass did not flatten six doors into one page', () => {
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
    expect(GUARANTEE_BODY).toMatch(/rebuilds and relaunches/);
    expect(GUARANTEE_BODY).toMatch(/not a specific income result/);
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
    const claim = `${oyf.hero.eyebrow ?? ''} ${oyf.hero.headline} ${oyf.hero.subheadline} ${oyf.hero.primaryCta} ${oyf.description}`;
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

  it('sends an unfinished visitor back to the calculator rather than asking to qualify them', () => {
    // Qualification is scored server-side from the calculator answers, so the control cannot be
    // useful before a result exists.
    expect(toolMarketing).toMatch(/QUALIFY_ANCHOR_ID/);
    expect(toolMarketing).toMatch(/PLAN_ANCHOR_ID/);
    expect(toolMarketing).toMatch(/Run your numbers first/);
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
