// The funnel around the unified model: the branching wizard, entry context, the presented result,
// the coordinated system builder, and the signup boundary. The arithmetic is proven in
// unifiedModel.test.ts; this file proves the artist actually meets it correctly.

import { describe, it, expect } from 'vitest';
import { getLeadMagnet, LEAD_MAGNETS, EXTERNAL_TOOLS } from '@/lib/leadMagnets/registry';
import { isInputVisible, isStepVisible, validateStep } from '@/lib/leadMagnets/validation';
import { orderStepsForEntry, resolveEntryContext, entryNote } from '@/lib/leadMagnets/entryContext';
import { getTool, ACQUISITION_TOOL_IDS } from '@/lib/acquisition/toolAdapters';
import {
  getDeliverableSpec,
  specFields,
  sanitizeDeliverableValues,
  type DraftValues,
} from '@/lib/opportunityDrafts/deliverableSpecs';
import { buildDraftConfig, postSetupDestination } from '@/lib/leadResults/postSetupDestination';
import { getFunnelByToolKey } from '@/lib/opportunityFunnels/registry';
import { SUB_AVATAR_IDS } from '@/lib/avatars/taxonomy';
import { buildUnifiedResult } from './unifiedAdapter';
import type { LeadMagnetInputValues } from '@/lib/leadMagnets/types';

const SLUG = 'opportunity-calculator';
const config = getLeadMagnet(SLUG)!;

const ANSWERS: LeadMagnetInputValues = {
  social_followers: 250_000,
  monthly_listeners: 120_000,
  owned_contacts: 8_000,
  current_supporters: 0,
  direct_fan_revenue_cents: 0,
  unreleased_count: 30,
  fans_promote: 'would',
  video_output: 'lots',
  promoter_overlap: 'some_overlap',
  live_willing: 'yes',
  session_structure: 'hybrid',
  time_capacity: 'medium',
};

/** Sum the dollars out of a "$1,234 to $5,678" range, for comparing two recalculated bands. */
const cents = (range: string): number =>
  (range.match(/\$[\d,]+/g) || []).reduce((sum, s) => sum + Number(s.replace(/[$,]/g, '')), 0);

const visibleSteps = (values: LeadMagnetInputValues, entry: string | null = null) =>
  orderStepsForEntry(config, entry)
    .filter((s) => isStepVisible(config, s.id, values))
    .map((s) => s.id);

describe('the tool is registered everywhere it needs to be', () => {
  it('is in the lead-magnet registry, the acquisition adapters and the funnel layer', () => {
    expect(config).toBeTruthy();
    expect(ACQUISITION_TOOL_IDS).toContain(SLUG);
    expect(getTool(SLUG)).toBeTruthy();
    expect(getFunnelByToolKey(SLUG)).toBeTruthy();
  });

  it('stamps its OWN result version, not the shared loss engine one', () => {
    // Defaulting here would pool this tool's analytics with sixteen other tools' results.
    expect(getFunnelByToolKey(SLUG)?.resultVersion).toBe('unifiedOpportunity@1');
    expect(buildUnifiedResult(ANSWERS as Record<string, unknown>).generatorVersion).toBe('unifiedOpportunity@1');
  });

  it('did not disturb the running Own Your Fans experiment by taking primary promotion', () => {
    expect(getFunnelByToolKey('own-your-fans-calculator')?.promotion).toBe('primary');
    expect(getFunnelByToolKey(SLUG)?.promotion).toBe('secondary');
  });

  it('leaves every individual calculator intact', () => {
    for (const slug of [
      'worth',
      'vault-revenue-planner',
      'share-to-earn-planner',
      'clip-to-earn-campaign-planner',
      'executive-producer-session',
      'live-experience-calculator',
      'own-your-fans-calculator',
      'proof-of-demand-test-builder',
      'royalty-readiness-check',
    ]) {
      const tool = getTool(slug);
      expect(tool, slug).toBeTruthy();
      const r = tool!.execute({ social_followers: 250_000, monthly_listeners: 120_000, catalog_size: 30 });
      expect(r.headline, slug).toBeTruthy();
      expect(r.sections.length, slug).toBeGreaterThan(0);
    }
  });
});

// The questions the wizard actually renders on a screen, which is what the artist experiences.
// Branching used to be observable at STEP level because each of these questions owned a screen of
// its own; the fourteen questions now share eight screens, so a branched-away question disappears
// from its screen instead of removing one. Same rule (`isInputVisible`), same guarantee, asserted
// where it now applies.
const visibleInputs = (values: LeadMagnetInputValues, entry: string | null = null) =>
  orderStepsForEntry(config, entry)
    .filter((s) => isStepVisible(config, s.id, values))
    .flatMap((s) => config.inputs.filter((d) => d.step === s.id && isInputVisible(d, values)))
    .map((d) => d.key);

describe('the wizard branches instead of asking everything', () => {
  it('asks the overlap question only when the artist has BOTH sharers and clippers', () => {
    expect(visibleInputs(ANSWERS)).toContain('promoter_overlap');
    expect(visibleInputs({ ...ANSWERS, video_output: 'none' })).not.toContain('promoter_overlap');
    expect(visibleInputs({ ...ANSWERS, fans_promote: 'unlikely' })).not.toContain('promoter_overlap');
  });

  it('asks how a session is structured only when the artist will go live', () => {
    expect(visibleInputs(ANSWERS)).toContain('session_structure');
    expect(visibleInputs({ ...ANSWERS, live_willing: 'no' })).not.toContain('session_structure');
  });

  it('asks all fourteen questions across eight screens, so no question was traded for the shorter path', () => {
    expect(visibleInputs(ANSWERS)).toHaveLength(14);
    expect(visibleSteps(ANSWERS)).toHaveLength(8);
  });

  it('never renders a step whose every question was branched away', () => {
    const values = { ...ANSWERS, live_willing: 'no', video_output: 'none' };
    for (const id of visibleSteps(values)) {
      const onStep = config.inputs.filter((d) => d.step === id);
      if (id === 'review') continue;
      expect(onStep.some((d) => isInputVisible(d, values)), id).toBe(true);
    }
  });

  it('always ends on review, and only the audience question is mandatory', () => {
    const steps = visibleSteps(ANSWERS);
    expect(steps[steps.length - 1]).toBe('review');
    expect(validateStep(config, 'audience', {})).toHaveProperty('social_followers');
    expect(validateStep(config, 'audience', { social_followers: 1000 })).toEqual({});
    // Everything else is skippable, so an artist can reach a result from one number.
    for (const id of steps) {
      if (id === 'audience' || id === 'review') continue;
      expect(validateStep(config, id, {}), id).toEqual({});
    }
  });

  it('uses a dropdown for every pick-one-of-three-or-more question', () => {
    for (const def of config.inputs) {
      if (def.options && def.options.length >= 3) expect(def.type, def.key).toBe('option');
    }
  });
});

describe('entry context personalizes without changing the model', () => {
  it('leads with the Vault questions for a Vault video', () => {
    const key = resolveEntryContext(config, 'vault-revenue-planner');
    expect(key).toBe('vault-revenue-planner');
    expect(visibleSteps(ANSWERS, key)[0]).toBe('vault');
    expect(entryNote(config, key)).toMatch(/vault/i);
  });

  it('leads with fan labor for a Share-to-Earn or Clip-to-Earn video', () => {
    // Sharing and clipping are one screen now, so both videos land on it first and the artist sees
    // the question their video was about as question one.
    for (const from of ['share-to-earn-planner', 'clip-to-earn-campaign-planner']) {
      expect(visibleSteps(ANSWERS, resolveEntryContext(config, from))[0], from).toBe('fans');
    }
    expect(visibleInputs(ANSWERS, resolveEntryContext(config, 'share-to-earn-planner'))[0]).toBe('fans_promote');
  });

  it('leads with audience and current earnings for a Streaming Loss video', () => {
    const ordered = visibleSteps(ANSWERS, resolveEntryContext(config, 'worth'));
    expect(ordered.slice(0, 2)).toEqual(['audience', 'proof']);
    // Monthly listeners is what that video was about, and it now shares the audience screen.
    expect(visibleInputs(ANSWERS, resolveEntryContext(config, 'worth'))).toContain('monthly_listeners');
  });

  it('reorders only: same questions, same count, review still last', () => {
    const plain = visibleSteps(ANSWERS);
    for (const key of Object.keys(config.entryContexts || {})) {
      const ordered = visibleSteps(ANSWERS, key);
      expect([...ordered].sort(), key).toEqual([...plain].sort());
      expect(ordered[ordered.length - 1], key).toBe('review');
    }
  });

  it('ignores an unknown or absent entry context', () => {
    expect(resolveEntryContext(config, 'not-a-tool')).toBeNull();
    expect(resolveEntryContext(config, null)).toBeNull();
    expect(visibleSteps(ANSWERS, null)).toEqual(visibleSteps(ANSWERS, resolveEntryContext(config, 'nonsense')));
  });

  it('every entry context key is a real tool slug or a real sub-avatar id', () => {
    // Two legitimate kinds of key now: a TOOL slug (this video was about that topic) and a
    // SUB-AVATAR id (this video was aimed at that kind of artist, docs/SUB_AVATARS.md, where all
    // four avatars share this one calculator). Anything else is a typo that would silently
    // degrade to the default question order.
    const known = [...LEAD_MAGNETS.map((m) => m.slug), ...EXTERNAL_TOOLS.map((t) => t.key), ...SUB_AVATAR_IDS];
    for (const key of Object.keys(config.entryContexts || {})) {
      expect(known, key).toContain(key);
    }
  });

  it('declares an entry context for every sub-avatar, since each one is a front door', () => {
    for (const id of SUB_AVATAR_IDS) {
      expect(Object.keys(config.entryContexts || {}), id).toContain(id);
    }
  });
});

describe('the presented result', () => {
  const result = buildUnifiedResult(ANSWERS as Record<string, unknown>);

  it('leads with a RANGE framed as something the artist could build', () => {
    expect(result.headline).toMatch(/could build an estimated \$[\d,]+ to \$[\d,]+ a month/);
    expect(result.heroValue).toMatch(/^\$[\d,]+ to \$[\d,]+$/);
    expect(result.heroSuffix).toBe('/mo');
    // Never a claim about money that already exists.
    expect(result.headline.toLowerCase()).not.toMatch(/owed|guarantee|you earn|you are earning/);
  });

  it('shows the overlap explanation and the not-in-the-total list', () => {
    const overlap = result.sections.find((s) => s.key === 'overlap');
    const notIn = result.sections.find((s) => s.key === 'notInTotal');
    expect(overlap?.items?.length).toBeGreaterThanOrEqual(4);
    expect(notIn?.items?.length).toBeGreaterThanOrEqual(3);
    expect(notIn?.items?.join(' ')).toMatch(/Proof of Demand/);
  });

  it('never puts a dollar figure on the acquisition systems', () => {
    const growth = result.sections.find((s) => s.key === 'growth');
    const revenueTiles = (growth?.metrics || []).filter((m) => /^\$/.test(m.value));
    // The only dollar in the growth block is the commission the artist PAYS.
    expect(revenueTiles.every((m) => /commission/i.test(m.label))).toBe(true);
  });

  it('keeps recurring and one-time apart in the headline tiles', () => {
    const headline = result.sections.find((s) => s.key === 'headline');
    const labels = (headline?.metrics || []).map((m) => m.label).join(' | ');
    expect(labels).toMatch(/Recurring/);
    expect(labels).toMatch(/Events and seats/);
  });

  it('shows the launch order and the recommended system', () => {
    expect(result.sections.find((s) => s.key === 'sequence')?.items?.[0]).toMatch(/^1\. /);
    expect(result.sections.find((s) => s.key === 'system')?.items?.join(' ')).toMatch(/membership ladder/i);
  });

  it('writes no em dashes anywhere in the result', () => {
    const all = JSON.stringify(result);
    expect(all).not.toMatch(/[—–]/);
  });

  it('degrades honestly when the artist gives nothing', () => {
    const empty = buildUnifiedResult({});
    expect(empty.heroValue).toBeUndefined();
    expect(empty.estimatedMonthlyCents).toBeUndefined();
    expect(empty.headline).not.toMatch(/\$/);
  });

  it('reaches a real number from the single required question alone', () => {
    const minimal = buildUnifiedResult({ social_followers: 250_000 });
    expect(minimal.estimatedMonthlyCents).toBeGreaterThan(0);
    // With nothing else answered, nothing optional is recommended, so the number is smaller.
    expect(minimal.estimatedMonthlyCents!).toBeLessThan(
      buildUnifiedResult(ANSWERS as Record<string, unknown>).estimatedMonthlyCents!,
    );
  });

  it('says what the headline figure actually is, not merely what it is about', () => {
    // `netNewMonthlyCents` is gross MINUS the CRWN fee, MINUS the commissions the artist funds,
    // MINUS what they already earn direct. "in direct-to-fan revenue" described none of that, and
    // an ICP that reads carefully treats a number whose label is loose as a number that is loose.
    expect(result.headline).toMatch(/on top of what you already earn direct/);
    expect(result.headline).toMatch(/after CRWN's fee and any commissions you pay/);
  });

  it('tells the artist how much of a "/mo" figure is actually recurring', () => {
    // The hero says "/mo". Between a quarter and a half of it can be one-off event and seat money
    // depending on the answers, and a reader will hear "/mo" as MRR unless the split is stated
    // next to the number rather than in a tile further down.
    expect(result.summary).toMatch(/\d+% of that is recurring membership/);
  });

  it('does not read an artist a split of event money they have none of', () => {
    // "About 100% of that is recurring, and the rest is events" is the sentence that tells a
    // careful reader the page is generated and nobody read it.
    const allRecurring = buildUnifiedResult({ ...ANSWERS, live_willing: 'no' } as Record<string, unknown>);
    expect(allRecurring.summary).toMatch(/All of it is recurring membership/);
    expect(allRecurring.summary).not.toMatch(/the rest is/);
    expect(allRecurring.sections.find((s) => s.key === 'assumptions')?.items?.join(' ')).not.toMatch(/Tickets and seats are sold/);
  });

  it('discloses the rates behind every layer that is actually in this artist total', () => {
    const shown = result.sections.find((s) => s.key === 'assumptions')?.items?.join(' ') ?? '';
    // Member extras, live and seats were carrying real money with no stated rate at all: on a
    // ticketed session at 1M followers the seat line alone is about 40% of gross.
    expect(shown).toMatch(/\$3 a month/);
    expect(shown).toMatch(/One live event a month/);
    expect(shown).toMatch(/1% of the fans you can reach who are not members buy a \$15 ticket/);
    // A sub-1% rate must not round to "0%", which would read as an assumption doing nothing.
    expect(shown).toMatch(/0\.3% of the fans you can reach who are not members buy a session seat/);
    expect(shown).toMatch(/we do not model a capacity limit/);
    // And an assumption that is not in this artist's total may not be asserted at them.
    const noLive = buildUnifiedResult({ ...ANSWERS, live_willing: 'no' } as Record<string, unknown>);
    expect(noLive.sections.find((s) => s.key === 'assumptions')?.items?.join(' ')).not.toMatch(/live event a month/i);
  });
});

// The wizard does NOT hand its answers to the model directly. `usesLossEngine` is true for this
// tool, so PublicToolClient and ArtistToolClient both route through the ACQUISITION ADAPTER. Every
// other test in this file calls `buildUnifiedResult` straight, which is exactly how two wizard
// answers came to be silently zeroed: the adapter read the DM's `lead_profiles` COLUMN names and
// overwrote the wizard's own INPUT keys with them. Formula tests cannot see that class of defect.
// These run the real path, on wizard-shaped values, and are the only ones that can.
describe('the real browser path carries every answer into the model', () => {
  const tool = getTool(SLUG)!;
  type ToolProfile = Parameters<typeof tool.execute>[0];

  /** Exactly what PublicToolClient.onComplete does before calling the tool. */
  const throughAdapter = (v: LeadMagnetInputValues) => {
    const profile: Record<string, unknown> = { ...v };
    for (const inp of config.inputs) {
      if (inp.type === 'currency' && inp.key.endsWith('_cents') && typeof profile[inp.key] === 'number') {
        profile[inp.key] = Math.round((profile[inp.key] as number) * 100);
      }
    }
    return tool.execute(profile as ToolProfile);
  };

  const modelInputs = (r: { conversionPayload: Record<string, unknown> }) =>
    r.conversionPayload.modelInputs as Record<string, unknown>;

  it('does not drop the owned-contacts answer, which is a whole wizard screen', () => {
    expect(modelInputs(throughAdapter(ANSWERS)).ownedContacts).toBe(8_000);
    // Arriving is not the same as being used. Owned contacts are counted as fully reachable, so a
    // real one has to move the money; if it does not, it was stored and ignored.
    expect(throughAdapter(ANSWERS).estimatedMonthlyCents!).toBeGreaterThan(
      throughAdapter({ ...ANSWERS, owned_contacts: 0 }).estimatedMonthlyCents!,
    );
  });

  it('does not drop the unreleased-count answer, so the Gold rung survives the trip', () => {
    expect(modelInputs(throughAdapter(ANSWERS)).unreleasedCount).toBe(30);
    const { ladder } = throughAdapter(ANSWERS).conversionPayload as { ladder: { name: string }[] };
    // Zeroed, the vault is ineligible, Gold vanishes, and the assumptions block on the SAME page
    // still promises a $25 Gold tier while the Vault line tells an artist who typed 30 unreleased
    // pieces to come back when they have five. The page contradicted itself in three places.
    expect(ladder.map((t) => t.name)).toContain('Gold');
  });

  it('still reads the DM column names, so a ManyChat lead is unaffected', () => {
    const dm = tool.execute({ social_followers: 250_000, email_list_size: 8_000, catalog_size: 30 } as ToolProfile);
    const mi = (dm.conversionPayload as Record<string, unknown>).modelInputs as Record<string, unknown>;
    expect(mi.ownedContacts).toBe(8_000);
    expect(mi.unreleasedCount).toBe(30);
  });

  it('converts the currency answer from dollars to cents exactly once', () => {
    // The field renders a "$" and stores DOLLARS; the key says cents. One conversion, in the client.
    expect(modelInputs(throughAdapter({ ...ANSWERS, direct_fan_revenue_cents: 5_000 })).currentDirectRevenueCents).toBe(
      500_000,
    );
  });

  it('reaches the same number through the adapter as through the model directly', () => {
    expect(throughAdapter(ANSWERS).heroValue).toBe(buildUnifiedResult(ANSWERS as Record<string, unknown>).heroValue);
  });
});

describe('the coordinated system builder', () => {
  const spec = getDeliverableSpec(SLUG)!;
  const result = buildUnifiedResult(ANSWERS as Record<string, unknown>);
  const draft = spec.prefill(result.conversionPayload, result as unknown as Record<string, unknown>);

  it('builds ONE system, not a pile of unrelated drafts', () => {
    expect(spec.preview.kind).toBe('system');
    expect(spec.preview.tiers?.length).toBe(4);
    expect(spec.preview.itemKeys?.length).toBeGreaterThan(2);
  });

  it('starts with no blank required field: the artist edits, never writes from scratch', () => {
    for (const field of specFields(spec)) {
      // sessionPrice is deliberately blank when the session is a tier benefit; we do not invent it.
      if (field.key === 'sessionPrice') continue;
      const v = draft[field.key];
      const filled = Array.isArray(v) ? v.length > 0 : String(v ?? '').length > 0;
      expect(filled, field.key).toBe(true);
    }
  });

  it('places the Vault inside the ladder rather than creating a second membership', () => {
    expect(draft.vaultPlacement).toBe('tier');
    expect(draft.t2Name).toBe('Gold');
    expect(Number(draft.t2Price)).toBeGreaterThan(0);
    // Four rungs, one ladder.
    expect([draft.t0Name, draft.t1Name, draft.t2Name, draft.t3Name].filter(Boolean)).toHaveLength(4);
  });

  it('generates share and clip programs only when the model recommended them', () => {
    expect(draft.shareOn).toBe('on');
    expect(draft.clipOn).toBe('on');
    const noPromoters = buildUnifiedResult({ ...ANSWERS, fans_promote: 'unlikely', video_output: 'none' } as Record<string, unknown>);
    const off = spec.prefill(noPromoters.conversionPayload);
    expect(off.shareOn).toBe('off');
    expect(off.clipOn).toBe('off');
  });

  it('does not invent a seat price for a session that is a membership benefit', () => {
    const included = buildUnifiedResult({ ...ANSWERS, session_structure: 'included' } as Record<string, unknown>);
    const v = spec.prefill(included.conversionPayload);
    expect(v.sessionStructure).toBe('included');
    expect(v.sessionPrice).toBe('');
  });

  it('carries the artist launch order, membership first', () => {
    expect(String((draft.launchOrder as string[])[0])).toMatch(/^1\. Launch the membership/);
  });

  it('lets the artist remove any recommendation, and survives the sanitizer', () => {
    const edited = { ...draft, shareOn: 'off', clipOn: 'off', vaultPlacement: 'none', t1Price: 15 };
    const safe = sanitizeDeliverableValues(spec, edited);
    expect(safe.shareOn).toBe('off');
    expect(safe.clipOn).toBe('off');
    expect(safe.vaultPlacement).toBe('none');
    expect(safe.t1Price).toBe(15);
    // Unknown keys never survive the trust boundary.
    expect(sanitizeDeliverableValues(spec, { ...edited, evil: '<script>' })).not.toHaveProperty('evil');
  });

  it('names the artifact at the save boundary, never an account', () => {
    expect(spec.saveLabel.toLowerCase()).not.toContain('account');
    expect(spec.saveLabel.toLowerCase()).not.toContain('sign up');
    expect(spec.signupContext!.toLowerCase()).toContain('save');
    expect(spec.overlapNote).toMatch(/once/i);
    expect(`${spec.saveLabel} ${spec.signupContext} ${spec.claimLine} ${spec.overlapNote}`).not.toMatch(/[—–]/);
  });
});

describe('the estimate is re-derived when the artist edits the plan', () => {
  const spec = getDeliverableSpec(SLUG)!;
  const result = buildUnifiedResult(ANSWERS as Record<string, unknown>);
  const cp = result.conversionPayload;
  const draft = spec.prefill(cp);

  it('exposes a recalc hook, and only for a tool whose edits move the money', () => {
    expect(spec.recalc).toBeTypeOf('function');
    // A single-opportunity builder has nothing to re-derive, so it declares no hook.
    expect(getDeliverableSpec('vault-revenue-planner')?.recalc).toBeUndefined();
  });

  it('reports no change while the artist has changed nothing structural', () => {
    const r = spec.recalc!(draft, cp);
    expect(r).toBeTruthy();
    expect(r!.changed).toBe(false);
    expect(r!.note).toBeUndefined();
    expect(r!.value).toMatch(/^\$[\d,]+ to \$[\d,]+$/);
  });

  it('lowers the number, visibly, when the artist removes a growth system', () => {
    const before = spec.recalc!(draft, cp)!;
    const after = spec.recalc!({ ...draft, shareOn: 'off', clipOn: 'off' }, cp)!;
    expect(after.changed).toBe(true);
    expect(after.note).toMatch(/lowered/i);
    expect(cents(after.value)).toBeLessThan(cents(before.value));
  });

  it('lowers it again when a ticketed session becomes a membership benefit', () => {
    const ticketed = spec.recalc!({ ...draft, sessionStructure: 'ticketed' }, cp)!;
    const included = spec.recalc!({ ...draft, sessionStructure: 'included' }, cp)!;
    expect(cents(included.value)).toBeLessThan(cents(ticketed.value));
  });

  it('never silently keeps the old headline after a material change', () => {
    // Typed as DraftValues so each literal is contextually typed. Left bare, TypeScript infers a
    // union and synthesizes `clipOn?: undefined` on the shareOn member, which no real draft has.
    const edits: DraftValues[] = [
      { shareOn: 'off' },
      { clipOn: 'off' },
      { vaultPlacement: 'none' },
      { sessionStructure: 'none' },
    ];
    for (const edit of edits) {
      const r = spec.recalc!({ ...draft, ...edit }, cp)!;
      expect(r.changed, JSON.stringify(edit)).toBe(true);
      expect(r.note, JSON.stringify(edit)).toBeTruthy();
    }
  });

  it('ignores cosmetic edits that do not change the structure', () => {
    const r = spec.recalc!({ ...draft, shareMessage: 'a different line', t1Name: 'The Family' }, cp)!;
    expect(r.changed).toBe(false);
  });

  it('returns null rather than guessing when the stored answers are missing', () => {
    expect(spec.recalc!(draft, {})).toBeNull();
  });

  it('writes no em dashes in the recalculated copy', () => {
    const r = spec.recalc!({ ...draft, shareOn: 'off' }, cp)!;
    expect(`${r.value} ${r.label} ${r.note}`).not.toMatch(/[—–]/);
  });
});

describe('restoration after signup', () => {
  const result = buildUnifiedResult(ANSWERS as Record<string, unknown>);
  const seed = {
    toolSlug: SLUG,
    toolName: config.name,
    resultId: 'res_123',
    conversionPayload: result.conversionPayload,
  } as Parameters<typeof buildDraftConfig>[0];

  it('routes the claimed artist into the membership builder, phase one of their own plan', () => {
    const cfg = buildDraftConfig(seed);
    expect(cfg?.path).toBe('/offers/new');
    expect(cfg?.prefill.lm_tier_name).toBeTruthy();
    expect(cfg?.prefill.lm_price).toBeTruthy();
    // The whole reviewed ladder rides along as the suggestion.
    expect(cfg?.suggest.lm_suggest_ladder).toContain('|');
  });

  it('produces a destination carrying the result id so the draft can be re-read', () => {
    const dest = postSetupDestination(seed);
    expect(dest?.params.lm_tool).toBe(SLUG);
    expect(dest?.params.lm_result).toBe('res_123');
    expect(dest?.params.lm_prefill).toBe('1');
  });

  it('never fabricates a referral link before an account exists', () => {
    const payload = JSON.stringify(result.conversionPayload);
    expect(payload).not.toMatch(/thecrwn\.app\/[a-z0-9-]+\/r\//i);
    expect(payload).not.toMatch(/referralCode|referral_code/);
  });
});
