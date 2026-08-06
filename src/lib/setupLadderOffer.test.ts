// The tier ladder is offered to EVERY artist, calculator or not.
//
// The wizard's ladder screen exists to hand a new artist a proven four-rung
// model instead of a blank tier form. An artist who arrives from a calculator
// gets their own pre-signup names and prices restored on top of it; an artist
// who signs up cold from the nav, /signup, or a login gets the same template
// with stock values. That second path is the one with no visible reminder in
// the code that it matters, so it is the one worth pinning: if the prefill
// logic ever becomes the SOURCE of the draft rather than an override, cold
// signups would silently land on an empty ladder and nothing would fail.
//
// (This repo's vitest is node-only, so the wizard's behaviour is pinned by
// reading its source. Each assertion below names the regression it prevents.)

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RECOMMENDED_LADDER } from './tierTemplate';

const src = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8');
const wizard = src('app/setup/page.tsx');
const tierManager = src('components/artist/TierManager.tsx');

describe('the ladder is offered without a calculator', () => {
  it('seeds the draft from the stock template, with no plan required', () => {
    // The initializer takes NO argument: the template is the default for every
    // artist. A calculator prefill is applied later, as an override.
    expect(wizard).toContain('useState<LadderDraft>(() => buildLadderDraft())');
  });

  it('treats the calculator prefill as optional, falling back per rung', () => {
    // `prefill?:` and the `??` fallbacks are what make a cold signup render the
    // full ladder rather than blank rungs.
    expect(wizard).toContain('prefill?: { key: string; name: string; priceCents: number }[] | null');
    expect(wizard).toContain('(p?.priceCents ?? r.priceCents)');
    expect(wizard).toContain('name: p?.name ?? r.name');
  });

  it('only OVERRIDES the draft when a prefill actually exists', () => {
    // Guarded by `s?.ladderPrefill &&`. Without the guard, a cold signup (seed
    // null) would wipe the stock draft the moment auto-claim answered.
    expect(wizard).toContain('if (s?.ladderPrefill && !ladderTouchedRef.current)');
  });

  it('always shows the ladder screen, gated on nothing', () => {
    const line = wizard.split('\n').find((l) => l.includes("key: 'ladder'"));
    expect(line).toBeTruthy();
    expect(line).toContain("group: 'monetize'");
    // No conditional inclusion: SCREENS is a flat literal list.
    expect(wizard).not.toContain('plan && SCREENS');
  });

  it('renders every rung from the template, not from calculator projections', () => {
    // LadderConfirm maps RECOMMENDED_LADDER. If it mapped `projections`, an
    // artist with no calculator would see an empty screen.
    expect(wizard).toContain('{RECOMMENDED_LADDER.map((rung) => {');
  });

  it('offers all four rungs, free front door plus three paid', () => {
    expect(RECOMMENDED_LADDER).toHaveLength(4);
    expect(RECOMMENDED_LADDER.filter((r) => r.priceCents === 0)).toHaveLength(1);
    expect(RECOMMENDED_LADDER.filter((r) => r.priceCents > 0)).toHaveLength(3);
  });
});

describe('the cold signup gets the same counterweight as the calculator signup', () => {
  it('argues for keeping the paid rungs, for cold signups only', () => {
    // The calculator path renders "about N fans in range for this tier"; without
    // it the artist saw four rungs and a Drop link with nothing arguing back.
    expect(wizard).toContain('{!hasPlan && (');
    expect(wizard).toContain('Keep all three paid rungs to start');
  });

  it('leaves the calculator signup completely untouched', () => {
    // `hasPlan` is the presence of a claimed calculator result, NOT an empty
    // projections array: a calculator artist whose result modelled no buyers
    // must still get their own flow, not the cold-signup line.
    expect(wizard).toContain('hasPlan={plan !== null}');
    expect(wizard).not.toContain('projections.length === 0');
  });

  it('reads its prices from the template instead of retyping them', () => {
    // A price change in tierTemplate.ts must not leave this line quoting a
    // number no rung carries.
    expect(wizard).toContain('middlePaidDollars');
    expect(wizard).toContain('topPaidDollars');
    expect(wizard).not.toMatch(/pay you \$25 has no way/);
  });

  it('writes that line without an em dash', () => {
    const line = wizard.split('\n').find((l) => l.includes('Keep all three paid rungs'));
    expect(line).toBeTruthy();
    expect(line).not.toContain('—');
    expect(line).not.toContain('–');
  });
});

describe('a skipped ladder is offered again', () => {
  it('the launch review flags missing offers and jumps back to the ladder', () => {
    // Monetize is skippable, so this is the safety net inside the wizard.
    expect(wizard).toContain("{ label: 'Offers ready', done: setup.hasTier, fix: 'ladder' }");
  });

  it('the tiers screen offers the template post-launch, ungated', () => {
    // The last chance for an artist who skipped and launched anyway. Mounted on
    // the artist id alone, NOT behind the (dark) quest engine.
    expect(tierManager).toContain('<TierLadderTemplate');
    expect(tierManager).toContain('{artistProfileId && (');
    expect(tierManager).not.toContain('quest_engine');
  });
});
