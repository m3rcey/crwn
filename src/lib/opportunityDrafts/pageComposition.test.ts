import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DELIVERABLE_SPECS, buildCtaFor, transitionFor, DELIVERABLE_TOOL_SLUGS } from './deliverableSpecs';

// Structural tests for the universal Opportunity Funnel page composition:
// result -> transition -> BUILDER -> secondary actions -> supporting content.
// These read the actual source so a reordering regression fails loudly.

const root = process.cwd();
const publicToolClient = readFileSync(join(root, 'src/components/lead-magnets/PublicToolClient.tsx'), 'utf-8');
const worth = readFileSync(join(root, 'src/app/(public)/worth/WorthExperience.tsx'), 'utf-8');
const homeFunnel = readFileSync(join(root, 'src/app/HomeFunnel.tsx'), 'utf-8');
const homePage = readFileSync(join(root, 'src/app/page.tsx'), 'utf-8');
const homeMarketing = readFileSync(join(root, 'src/app/HomeMarketing.tsx'), 'utf-8');

describe('CTA contract: the builder is the CTA', () => {
  it('every deliverable tool has a transition line and a build CTA that never mentions signup', () => {
    for (const slug of DELIVERABLE_TOOL_SLUGS) {
      const t = transitionFor(slug);
      const c = buildCtaFor(slug);
      expect(t.length, slug).toBeGreaterThan(10);
      expect(c.length, slug).toBeGreaterThan(3);
      for (const banned of ['sign up', 'signup', 'account', 'login', 'book a call']) {
        expect(t.toLowerCase(), `${slug} transition`).not.toContain(banned);
        expect(c.toLowerCase(), `${slug} cta`).not.toContain(banned);
      }
    }
  });

  it('the three priority tools carry the founder-approved transitions', () => {
    expect(transitionFor('worth')).toBe('Turn this estimate into an offer your fans can join.');
    expect(transitionFor('share-to-earn-planner')).toBe('Turn this estimate into a campaign your fans can share.');
    expect(transitionFor('executive-producer-session')).toBe('Turn this opportunity into a session offer.');
    expect(buildCtaFor('worth')).toBe('Build my offer');
    expect(buildCtaFor('share-to-earn-planner')).toBe('Build my campaign');
    expect(buildCtaFor('executive-producer-session')).toBe('Build my session');
  });

  it('no spec transition or CTA uses an em dash', () => {
    for (const spec of DELIVERABLE_SPECS) {
      expect(spec.transition || '').not.toMatch(/[–—]/);
      expect(spec.buildCta || '').not.toMatch(/[–—]/);
    }
  });
});

describe('PublicToolClient page order (shared template for 16 tools + OYF)', () => {
  // Slice the full-result phase for order checks. Anchored on the JSX guard specifically
  // (`result`, not `!!result`), so the completion-state computation above the return
  // cannot become the match and silently widen this window.
  const fullPhase = publicToolClient.slice(publicToolClient.indexOf("phase === 'full' && result && !editing"));

  it('renders the result-to-builder transition in the result afterHero slot (no signup CTA there)', () => {
    expect(fullPhase).toContain('<ResultToBuilder');
    expect(fullPhase.indexOf('<ResultToBuilder')).toBeLessThan(fullPhase.indexOf('ref={builderRef}'));
    // The old embedded signup CTA is gone from the template entirely.
    expect(publicToolClient).not.toContain('LeadEmailCta');
    expect(publicToolClient).not.toContain('continueCtaFor(');
  });

  it('the builder appears before email capture, explore link, and supporting content', () => {
    const builder = fullPhase.indexOf('ref={builderRef}');
    expect(builder).toBeGreaterThan(-1);
    expect(builder).toBeLessThan(fullPhase.indexOf('LeadCaptureForm'));
    expect(builder).toBeLessThan(fullPhase.indexOf('Explore another CRWN tool'));
    expect(builder).toBeLessThan(fullPhase.indexOf('<ToolShowcase'));
    expect(builder).toBeLessThan(fullPhase.indexOf('<CrwnShowcase'));
  });

  it('no signup link renders between the result and the builder', () => {
    const between = fullPhase.slice(0, fullPhase.indexOf('ref={builderRef}'));
    expect(between).not.toContain('/signup');
    expect(between).not.toContain('BOOK_CALL');
  });
});

describe('Worth page order', () => {
  it('the builder follows the result, CTA and derivation, before the inputs and email card', () => {
    const flow = worth.slice(worth.indexOf('{useEntryWizard ? ('));
    // resultCta now lives INSIDE resultCard (directly under the number, above the stats grid),
    // which is what puts it in the first viewport.
    const order = ['{resultCard}', '{derivationCard}', '{builderSection}', '{inputsCard}', '{emailCaptureCard}'];
    let last = -1;
    for (const marker of order) {
      const i = flow.indexOf(marker);
      expect(i, marker).toBeGreaterThan(last);
      last = i;
    }
  });

  it('the CTA renders inside the result card, above the supporting stats', () => {
    const card = worth.slice(worth.indexOf('const resultCard ='), worth.indexOf('const derivationCard ='));
    expect(card).toContain('{resultCta}');
    expect(card.indexOf('{resultCta}')).toBeLessThan(card.indexOf('{statsGrid}'));
  });

  it('cold /worth opens as a one-question-per-screen wizard, homepage keeps its own flow', () => {
    expect(worth).toContain('const useEntryWizard = !homepage && !leadView && !entryDone;');
    // Uses the SAME wizard component as every other calculator, so the UI matches exactly.
    expect(worth).toContain('<LeadMagnetWizard');
    expect(worth).toContain("group: 'Audience'");
    expect(worth).toContain("group: 'Review'");
  });

  it('the legacy homepage marketing tour was deleted with the Zero to One homepage rebuild', () => {
    // These sections only ever rendered on homepage surfaces. The homepage now owns its
    // own narrative (HomeMarketing), so the dead sections are gone rather than dormant.
    for (const heading of [
      'Go live, and get paid for it',
      'A gated community they pay to be in',
      'Keep up to 92%, paid to your bank',
      'A manager built in',
      'Bonus: get your music placed',
      'Release like the majors',
    ]) {
      expect(worth, heading).not.toContain(heading);
    }
  });

  it('the misleading book-a-call CTA is gone', () => {
    expect(worth).not.toContain('Book a free 15-min call, keep this money');
  });

  it('exactly one optional help CTA remains on the tool view, framed as help', () => {
    expect(worth).toContain('Need help setting this up?');
  });

  it('no CTA implies booking a call captures the money', () => {
    // "Book a call, claim your $X/mo" reads as if the CALL is how the money arrives. Banned.
    // (The homepage's own "Set up my page free, keep this money" is general marketing copy on a
    // marketing page and is deliberately out of scope for the calculator funnel.)
    expect(worth).not.toContain('Book a call, claim your');
    expect(worth).not.toContain('call, keep this money');
    expect(worth).not.toContain('Book a free 15-min call, keep this money');
    // The calculator's closing action returns to the offer the artist already built.
    expect(worth).toContain('Back to my offer');
  });
});

// ---- UX redesign: four-tier ladder, benefit CTAs, signup context, no blank boxes ----
import { getDeliverableSpec, specFields as fieldsOf } from './deliverableSpecs';
import { RECOMMENDED_LADDER, benefitLabels } from '@/lib/tierTemplate';

describe('Streaming Loss builds the FULL four-tier ladder', () => {
  const spec = getDeliverableSpec('worth')!;

  it('has one step per tier, in ladder order', () => {
    expect(spec.steps.map((s) => s.id)).toEqual(['wave', 'inner', 'vault', 'throne']);
    expect(spec.deliverableType).toBe('membership_ladder');
  });

  it('prefills all four tiers from the CANONICAL template, not invented copy', () => {
    const v = spec.prefill({});
    const [wave, inner, vault, throne] = RECOMMENDED_LADDER;
    expect(v.t0Name).toBe(wave.name);
    expect(v.t1Name).toBe(inner.name);
    expect(v.t2Name).toBe(vault.name);
    expect(v.t3Name).toBe(throne.name);
    expect(v.t0Benefits).toEqual(benefitLabels(wave));
    expect(v.t3Benefits).toEqual(benefitLabels(throne));
    // Free front door stays free; paid tiers carry the template prices.
    expect(v.t1Price).toBe(inner.priceCents / 100);
    expect(v.t2Price).toBe(vault.priceCents / 100);
    expect(v.t3Price).toBe(throne.priceCents / 100);
  });

  it("prefers the calculator's own modeled prices when present", () => {
    const v = spec.prefill({ ladder: [{ priceCents: 1200 }, { priceCents: 3000 }, { priceCents: 9000 }] });
    expect(v.t1Price).toBe(12);
    expect(v.t2Price).toBe(30);
    expect(v.t3Price).toBe(90);
  });

  it('previews the ladder, and every tier maps to real fields', () => {
    expect(spec.preview.kind).toBe('ladder');
    const keys = new Set(fieldsOf(spec).map((f) => f.key));
    for (const t of spec.preview.tiers || []) {
      expect(keys.has(t.nameKey)).toBe(true);
      expect(keys.has(t.benefitsKey)).toBe(true);
      if (t.priceKey) expect(keys.has(t.priceKey)).toBe(true);
    }
    expect(spec.preview.tiers).toHaveLength(4);
  });
});

describe('benefit-driven save CTAs and builder-specific signup context', () => {
  it('uses the founder-approved save labels', () => {
    expect(getDeliverableSpec('worth')!.saveLabel).toBe('Save my membership');
    expect(getDeliverableSpec('share-to-earn-planner')!.saveLabel).toBe('Save my campaigns');
    expect(getDeliverableSpec('executive-producer-session')!.saveLabel).toBe('Save my session');
    expect(getDeliverableSpec('vault-revenue-planner')!.saveLabel).toBe('Save my Vault');
    expect(getDeliverableSpec('proof-of-demand-test-builder')!.saveLabel).toBe('Save my test');
    expect(getDeliverableSpec('live-experience-calculator')!.saveLabel).toBe('Save my experience');
  });

  it('every tool explains WHY the account is needed, in its own words', () => {
    for (const spec of DELIVERABLE_SPECS) {
      expect(spec.signupContext, spec.toolSlug).toBeTruthy();
      expect(spec.signupContext!.toLowerCase(), spec.toolSlug).toContain('save');
      expect(spec.signupContext!, spec.toolSlug).not.toMatch(/[–—]/);
    }
    // Not generic: no two tools share the same reason.
    const all = DELIVERABLE_SPECS.map((s) => s.signupContext);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('artists are not shown blank boxes', () => {
  it('Share-to-Earn generates FOUR campaigns, one per canonical tier, all pre-written', () => {
    const spec = getDeliverableSpec('share-to-earn-planner')!;
    const v = spec.prefill({});
    expect(spec.preview.kind).toBe('campaigns');
    expect(spec.preview.tiers).toHaveLength(4);
    // Names come from the canonical ladder, not a second tier source.
    expect([v.c0Name, v.c1Name, v.c2Name, v.c3Name]).toEqual(RECOMMENDED_LADDER.map((t) => t.name));
    // Every campaign message is written for the artist.
    for (const k of ['c0Message', 'c1Message', 'c2Message', 'c3Message']) {
      expect(String(v[k]).length, k).toBeGreaterThan(40);
    }
    expect(String(v.explanation).length).toBeGreaterThan(20);
    // Each tier step explains what that tier includes (context for artists who skipped Worth).
    for (const step of spec.steps.filter((st) => st.id.startsWith('c'))) {
      expect(step.fields.some((f) => (f.help || '').length > 20), step.id).toBe(true);
    }
  });

  it('does not fabricate a share link before signup', () => {
    const spec = getDeliverableSpec('share-to-earn-planner')!;
    expect(spec.preview.note?.toLowerCase()).toContain('generated inside the crwn app');
    const v = spec.prefill({});
    expect(JSON.stringify(v)).not.toContain('thecrwn.app/');
    expect(JSON.stringify(v)).not.toMatch(/\/r\//);
  });

  it('no spec leaves a required-feeling text field empty without a reason', () => {
    // Financial fields may be blank on purpose (never invent a price), and Team Splits is
    // deliberately blank end to end: pre-filling someone's split percentage would be dishonest.
    for (const spec of DELIVERABLE_SPECS.filter((s) => s.toolSlug !== 'team-split-deal-builder')) {
      const v = spec.prefill({});
      const filled = Object.values(v).filter((x) => (Array.isArray(x) ? x.length : String(x ?? '').length)).length;
      expect(filled, `${spec.toolSlug} prefilled fields`).toBeGreaterThan(1);
    }
  });
});


// The homepage runs the Opportunity Calculator funnel by mounting the SAME
// component as /tools/[slug]. These read the source so a future edit cannot
// quietly fork a second homepage calculator or drop the preserved sections.
describe('Homepage funnel reuse', () => {
  it('the homepage renders the shared funnel component, not its own calculator', () => {
    expect(homePage).toContain('HomeFunnel');
    expect(homeFunnel).toContain('PublicToolClient');
    expect(homeFunnel).toContain("'opportunity-calculator'");
    // No parallel wizard/result/builder implementation on the homepage.
    for (const forked of ['LeadMagnetWizard', 'LeadMagnetResult', 'DeliverableBuilder', 'generateResult']) {
      expect(homeFunnel, forked).not.toContain(forked);
    }
  });

  it('marks itself as the homepage surface so analytics stay separable', () => {
    expect(homeFunnel).toContain('surface="homepage"');
  });

  it('renders the Zero to One marketing narrative below the finished funnel', () => {
    // The homepage's lower page is HomeMarketing, mounted via the `below` slot,
    // which PublicToolClient renders AFTER the whole funnel. The old
    // WorthExperience marketingOnly embed is gone.
    expect(homeFunnel).toContain('HomeMarketing');
    expect(homeFunnel).toContain('below=');
    expect(homeFunnel).not.toContain('marketingOnly');
    expect(worth).not.toContain('marketingOnly');
    // The slot renders ONCE, after the funnel's full-result block, so nothing
    // marketing can interrupt result -> builder -> save boundary.
    const at = publicToolClient.indexOf('{belowContent}');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(publicToolClient.indexOf("phase === 'full' && result && !editing"));
    expect(at).toBeGreaterThan(publicToolClient.indexOf('ref={builderRef}'));
    expect(at).toBeGreaterThan(publicToolClient.indexOf('LeadCaptureForm'));
    expect(at).toBeGreaterThan(publicToolClient.indexOf('CallRequestCard'));
  });

  it('the marketing slot owns its width, so completing the funnel cannot narrow the page', () => {
    // It used to ride inside the funnel's phase-dependent wrapper, which rendered the
    // whole lower page at the result card's max-w-lg for anyone who finished the
    // calculator: 16% longer and visibly weaker for the highest-intent reader.
    expect(publicToolClient).not.toContain('{below}');
    const at = publicToolClient.indexOf('{belowContent}');
    const wrapper = publicToolClient.slice(Math.max(0, at - 220), at);
    expect(wrapper).toContain('max-w-2xl');
    expect(wrapper).not.toContain("phase === 'hero' ?");
  });

  it('the generic platform showcase is tool-route chrome, never a second homepage narrative', () => {
    // Every render of ToolShowcase/CrwnShowcase must sit behind the tool-surface
    // gate: the homepage's below slot owns its entire lower page.
    for (const marker of ['<ToolShowcase', '<CrwnShowcase']) {
      let at = publicToolClient.indexOf(marker);
      expect(at, marker).toBeGreaterThan(-1);
      while (at !== -1) {
        const windowBefore = publicToolClient.slice(Math.max(0, at - 400), at);
        expect(windowBefore, `${marker} at ${at} must be gated to surface === 'tool'`).toContain("surface === 'tool'");
        at = publicToolClient.indexOf(marker, at + 1);
      }
    }
  });

  it('the tool route keeps its own chrome, so /tools/opportunity-calculator is unchanged', () => {
    expect(publicToolClient).toContain("surface === 'tool' &&");
    expect(publicToolClient).toContain('All tools');
  });

  it('does not hide the homepage behind a loading phase (its body IS its SEO)', () => {
    // The homepage prerenders. If its first render is the 'loading' placeholder,
    // the served HTML is a nav plus "Loading…" and every marketing section the
    // homepage kept is invisible to crawlers. It shipped that way once. The tool
    // route keeps the gate, because emailed ?result= links land THERE.
    expect(publicToolClient).toContain("useState<Phase>(surface === 'homepage' ? 'hero' : 'loading')");
  });
});

// The Zero to One homepage narrative (2026-08-13, tightened 2026-08-14): fragmentation ->
// first-revenue path -> operating loop + trust strip -> First Revenue Launch ->
// capabilities by job -> pricing -> FAQ -> final CTA. These pin the copy and architecture
// guardrails the rebuild ratified and the pre-traffic audit corrected.
describe('Homepage marketing narrative (HomeMarketing)', () => {
  it('is presentation only: no second calculator, result, builder, qualification, or analytics', () => {
    for (const forked of [
      'LeadMagnetWizard',
      'LeadMagnetResult',
      'DeliverableBuilder',
      'generateResult',
      'trackLeadMagnet',
      'trackOpportunity',
      'CrwnShowcase',
      // The hand-raiser is the funnel's, reached by anchor. A second copy here would be a
      // second qualification surface with no server context. (Naming it in a comment is
      // fine; rendering it or posting to its route is not.)
      '<CallRequestCard',
      '/api/lead-magnets/call-request',
    ]) {
      expect(homeMarketing, forked).not.toContain(forked);
    }
  });

  it('carries the eight-section architecture with the nav anchor targets', () => {
    for (const marker of [
      'id="how-it-works"',
      'id="pricing"',
      'id="faq"',
      'fan economy isn',
      'Turn the audience you already built into a business you can operate.',
      'One fan economy. One next move.',
      'Want us to launch it with you?',
      'You already built the audience. Now operate the part that pays.',
    ]) {
      expect(homeMarketing, marker).toContain(marker);
    }
    // The nav links point at those anchors.
    expect(worth).toContain('href="#how-it-works"');
    expect(worth).toContain('href="#pricing"');
  });

  it('makes the next-move claim ONCE, in the operating-loop section', () => {
    // It used to be stated in four consecutive sections (Expand step, loop copy, an
    // Evidence card, and a capability row), which read as padding and drained the
    // argument exactly where it should tighten.
    const fullClaim = /move your numbers support next|next move, with the evidence|with the evidence behind it/gi;
    expect((homeMarketing.match(fullClaim) || []).length).toBe(1);
    // The Evidence section was merged into the loop rather than kept as a thin repeat.
    expect(homeMarketing).not.toContain('Guidance built from your numbers, not a template.');
    // Its legitimate trust content survives, including the claim-maturity safeguard.
    for (const kept of ['Your numbers', 'Assumptions you can check', 'The reason for the move']) {
      expect(homeMarketing, kept).toContain(kept);
    }
    expect(homeMarketing).toMatch(/not enough evidence to be sure/i);
  });

  it('keeps capabilities to four grouped economic jobs, and advertises no hidden surface', () => {
    const jobs = homeMarketing.slice(homeMarketing.indexOf('const JOBS'), homeMarketing.indexOf('const FAQS'));
    expect((jobs.match(/^\s{4}job:/gm) || []).length).toBe(4);
    // Pre-PMF hidden surfaces are reachable by route but are not homepage pillars.
    for (const hidden of [/AI manager/i, /\bsync\b/i, /clip bount/i, /\bquests?\b/i, /playbook/i, /leaderboard/i]) {
      expect(jobs, String(hidden)).not.toMatch(hidden);
    }
  });

  it('keeps the FAQ to the five objections most likely to block this ICP', () => {
    const faqs = homeMarketing.slice(homeMarketing.indexOf('const FAQS'), homeMarketing.indexOf('const PLANS'));
    expect((faqs.match(/^\s{4}q:/gm) || []).length).toBe(5);
  });

  it('activation is the first paid member, stated on the path', () => {
    expect(homeMarketing).toContain('first paid CRWN member');
  });

  it('pricing renders from the canonical constants, never restated from memory', () => {
    expect(homeMarketing).toContain("from '@/lib/platformTier'");
    expect(homeMarketing).toContain('TIER_PRICING');
    expect(homeMarketing).toContain('platformFeePercent');
    // No hardcoded plan price or fee may appear in the source.
    expect(homeMarketing).not.toMatch(/\$49|\$199|12%|8%|5%/);
  });

  it('never says a PAID plan costs nothing until the artist earns', () => {
    // Pro and Scale are real recurring subscriptions (platform-checkout opens a Stripe
    // subscription), billed whether or not the artist earns. The FAQ used to conclude
    // "so the software costs nothing until the fan economy is paying you", which is true
    // only of Launch and reads to a buyer as "I am never billed until I earn".
    expect(homeMarketing).not.toMatch(/software costs nothing/i);
    expect(homeMarketing).not.toMatch(/costs nothing until/i);
    // The accurate split is stated instead: free plan has no monthly fee, paid plans add one.
    expect(homeMarketing).toMatch(/Launch has no monthly fee/);
    expect(homeMarketing).toMatch(/Pro and Scale add a monthly subscription/);
  });

  it('the First Revenue Launch section keeps the canonical guarantee and reuses the existing qualification path', () => {
    expect(homeMarketing).toContain('First Paid Member Guarantee');
    // The boundary is stated as a precise term rather than a defensive aside, but it is
    // still stated: the guarantee covers the relaunch, never an income amount.
    expect(homeMarketing).toContain('not a specific income result');
    expect(homeMarketing).toMatch(/rebuilds and relaunches the offer at no additional\s+service charge/);
    expect(homeMarketing).not.toMatch(/guaranteed (income|revenue|earnings)/i);
    // The 14-day implementation commitment is internal, never a second promoted guarantee.
    expect(homeMarketing.toLowerCase()).not.toContain('14-day');
    expect(homeMarketing.toLowerCase()).not.toContain('14 days');
    // Qualification runs through the calculator (decideCallRequest at the save boundary),
    // never a new application system or a scheduling link.
    expect(homeMarketing).toContain('See if I qualify');
    expect(homeMarketing).not.toContain('/apply');
    expect(homeMarketing.toLowerCase()).not.toMatch(/calendly|cal\.com/);
  });

  it('the qualification CTA targets the funnel\'s own hand-raiser, with an honest fallback', () => {
    // Anchors are shared constants, so the button cannot drift from the element.
    expect(homeMarketing).toContain('QUALIFY_ANCHOR_ID');
    expect(homeMarketing).toContain('PLAN_ANCHOR_ID');
    expect(publicToolClient).toContain('export const QUALIFY_ANCHOR_ID');
    expect(publicToolClient).toContain('export const PLAN_ANCHOR_ID');
    expect(publicToolClient).toContain('id={QUALIFY_ANCHOR_ID}');
    expect(publicToolClient).toContain('id={PLAN_ANCHOR_ID}');
    // When the hand-raiser is not mounted (no result yet) the visitor goes back to the
    // calculator, because qualification is scored from its answers. It is never skipped.
    expect(homeMarketing).toMatch(/if \(!scrollToAnchor\(QUALIFY_ANCHOR_ID\)\) scrollToFunnel\(\)/);
  });

  it('keeps the copy guardrails: no em dashes, no banned frames, no fabricated proof', () => {
    expect(homeMarketing).not.toMatch(/[–—]/);
    for (const banned of [
      /own your fans/i,
      /passive income/i,
      /go(es)? viral/i,
      /streaming is dead/i,
      /streaming pays pennies/i,
      /artists like you/i,
      /learns from every artist/i,
      /powered by (data from )?thousands/i,
      /replace your team/i,
      /\bsubscribers?\b/i,
      /\bbeginner/i,
      /first fans\b/i,
      /testimonial/i,
    ]) {
      expect(homeMarketing, String(banned)).not.toMatch(banned);
    }
  });

  it('ends on ONE action that is useful before AND after completion', () => {
    // Before completion it re-offers the calculator. After completion the visitor already
    // has the number, so the close returns them to the plan they built instead.
    expect(homeMarketing).toContain('See what my fans are worth');
    expect(homeMarketing).toContain('Back to my plan');
    expect(homeMarketing).toContain('scrollToFunnel');
    expect(homeMarketing).toMatch(/if \(!completed \|\| !scrollToAnchor\(PLAN_ANCHOR_ID\)\) scrollToFunnel\(\)/);
    // The narrative never links out to signup directly: the save boundary owns signup.
    expect(homeMarketing).not.toContain('/signup');
  });

  it('reads its completion state from the funnel, not from guessed DOM state', () => {
    // One bit, passed down from PublicToolClient, which is the component that actually
    // knows. No parallel state machine and no scraping the page for a result.
    expect(homeFunnel).toContain('({ completed })');
    expect(homeFunnel).toContain('completed={completed}');
    expect(publicToolClient).toMatch(/below\(\{ completed: phase === 'full' && !!result && !editing \}\)/);
  });
});
