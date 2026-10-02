import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkLaunchPartner, type LaunchPartnerConfig } from './launchPartner';
import { PRINCE_DRE, DRE_NURTURE, DRE_TIER_PRICES_CENTS, DRE_DRIP } from './princeDre';

// The free-member follow-up (2026-10-02, docs/crwn-brain/35). Before it, every one of Dre's ~20
// funnels gave a fan one email (the song) and then silence: the only way from free to paid was a
// fan deciding alone. These pin what the copy may and may not do.

const withNurture = (steps: LaunchPartnerConfig['nurture'] extends infer N ? N : never) =>
  checkLaunchPartner({ ...PRINCE_DRE, nurture: steps as LaunchPartnerConfig['nurture'] });
const msg = (over: Partial<{ delay_days: number; subject: string; body: string }> = {}) => ({
  delay_days: 1,
  subject: 'Hi',
  body: 'Hey {{first_name}}, https://thecrwn.app/princedre {{artist_name}}',
  ...over,
});

describe("Dre's follow-up", () => {
  it('passes every launch check', () => {
    expect(checkLaunchPartner(PRINCE_DRE)).toEqual([]);
  });
  it('gives twice before the first price', () => {
    const firstAsk = DRE_NURTURE.steps.findIndex((s) => /\$\d/.test(s.body));
    expect(firstAsk).toBe(2);
  });
  it('stops at the FIRST paid rung, so buying anything ends it', () => {
    expect(DRE_NURTURE.goalRung).toBe('Silver');
  });
  it('quotes the same prices as his cards', () => {
    const text = DRE_NURTURE.steps.map((s) => s.body).join(' ');
    for (const rung of ['Silver', 'Gold', 'Platinum']) expect(text).toContain(`$${DRE_TIER_PRICES_CENTS[rung] / 100}`);
  });
  it('never names a single drop song, because twenty funnels feed it', () => {
    const text = DRE_NURTURE.steps.map((s) => `${s.subject} ${s.body}`).join(' ');
    for (const song of ['Round Here', 'Letter To LA', 'Hommie']) expect(text).not.toContain(song);
  });
  it('says rejoining restarts the drip, as the Gold card does', () => {
    expect(DRE_NURTURE.steps.find((s) => /each month you stay/.test(s.body))?.body).toMatch(/come back the count starts over/);
  });
  it('names the drip from the config, in order, so it follows the catalog and never runs ahead of it', () => {
    const gold = DRE_NURTURE.steps.find((s) => /each month you stay/.test(s.body))!.body;
    const at = DRE_DRIP.map((d) => gold.indexOf(d.title));
    expect(at.every((i) => i > -1)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(gold).not.toMatch(/Stompin/);
  });
  it("is in Dre's voice: the name alone on the first line, no Hey", () => {
    for (const s of DRE_NURTURE.steps) expect(s.body.startsWith('{{first_name}}\n\n')).toBe(true);
  });
});

describe('checkLaunchPartner: nurture rules', () => {
  it('refuses a message that asks the fan to reply (replies reach CRWN, not the artist)', () => {
    expect(withNurture({ goalRung: 'Silver', steps: [msg(), msg({ delay_days: 2, body: 'Just reply https://thecrwn.app/princedre' })] }).join()).toMatch(/reply/);
  });
  it('refuses a token the sender cannot resolve', () => {
    expect(withNurture({ goalRung: 'Silver', steps: [msg(), msg({ delay_days: 2, body: '{{tier_link}} https://thecrwn.app/princedre' })] }).join()).toMatch(/tier_link/);
  });
  it('refuses messages out of order, a price in the first message, and a missing page link', () => {
    const e = withNurture({ goalRung: 'Silver', steps: [msg({ body: '$10 https://thecrwn.app/princedre' }), msg({ delay_days: 1, body: 'no link' })] }).join(' | ');
    expect(e).toMatch(/must come after/);
    expect(e).toMatch(/names a price/);
    expect(e).toMatch(/needs a link/);
  });
  it('refuses a dash and the banned promise words, through the shared copy scan', () => {
    expect(withNurture({ goalRung: 'Silver', steps: [msg(), msg({ delay_days: 2, body: 'Limited spots \u2014 https://thecrwn.app/princedre' })] }).join(' | ')).toMatch(/dash.*\|.*limited|limited.*\|.*dash/);
  });
});

describe('the script writes it the way the checks assume', () => {
  const SCRIPT = readFileSync('scripts/onboard-launch-partner.mjs', 'utf8');
  it('prints every message in the dry run and writes only on --apply', () => {
    const block = SCRIPT.slice(SCRIPT.indexOf('// ── 7d.'), SCRIPT.indexOf("if (!APPLY) { console.log('\\n(dry run"));
    expect(block).toContain('for (const s of C.nurture.steps) console.log');
    expect(block).toMatch(/else if \(APPLY\)/);
  });
  it('never overwrites a sequence the artist built, and never shifts a fan mid-sequence', () => {
    expect(SCRIPT).toContain('the artist already runs');
    expect(SCRIPT).toContain('part-way through it');
  });
});
