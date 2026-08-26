import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { restoreWizardValues, prefillFromQuery, prefillQueryString } from './resumeInputs';
import { getLeadMagnet } from './registry';

const root = process.cwd();
const config = { inputs: [{ key: 'social_followers' }, { key: 'monetization_status' }, { key: 'owned_contacts' }] } as never;

describe('restoreWizardValues', () => {
  it('restores the tool own declared answers', () => {
    expect(
      restoreWizardValues(config, { social_followers: 250_000, monetization_status: 'direct_some' }),
    ).toEqual({ social_followers: 250_000, monetization_status: 'direct_some' });
  });

  it('never restores a reserved reporting key, even if a tool ever declares one', () => {
    const out = restoreWizardValues(config, {
      social_followers: 1000,
      _attribution: { channel: 'instagram' },
      _entryContext: 'vault',
    });
    expect(out).toEqual({ social_followers: 1000 });
  });

  it('drops keys the tool does not declare, so one tool cannot seed another', () => {
    const out = restoreWizardValues(config, { social_followers: 1000, shows_per_year: 20 });
    expect(out).toEqual({ social_followers: 1000 });
  });

  it('degrades to empty on the nested call-request shape rather than guessing', () => {
    // That row stores { calculatorInputs: {...} } with currency in CENTS. Restoring it naively
    // would put a cents figure into a dollars field and show a number 100x too big.
    expect(restoreWizardValues(config, { calculatorInputs: { social_followers: 1000 } })).toEqual({});
  });

  it('ignores non-scalar and empty values instead of handing them to an input', () => {
    const out = restoreWizardValues(config, {
      social_followers: { nested: true },
      monetization_status: '',
      owned_contacts: Number.NaN,
    });
    expect(out).toEqual({});
  });

  it('survives a null, an array and a string where a row was expected', () => {
    expect(restoreWizardValues(config, null)).toEqual({});
    expect(restoreWizardValues(config, [1, 2])).toEqual({});
    expect(restoreWizardValues(config, 'nope')).toEqual({});
  });

  it('reads a real registry tool own stored answers', () => {
    const unified = getLeadMagnet('opportunity-calculator')!;
    const out = restoreWizardValues(unified, { social_followers: 250_000, _attribution: { channel: 'x' } });
    expect(out).toEqual({ social_followers: 250_000 });
  });
});

// The resume path is what the emailed copy link and the nurture "Reopen my result" link both
// use. It returned the number and threw the answers away, which hid the correction control and
// made the call hand-raiser post an empty input set the route refuses.
describe('the ?result= resume restores the answers, not just the number', () => {
  const client = readFileSync(join(root, 'src/components/lead-magnets/PublicToolClient.tsx'), 'utf-8');

  it('sets the wizard values from the resumed row', () => {
    const resume = client.slice(client.indexOf('Resume from an emailed link'), client.indexOf('const onComplete'));
    expect(resume).toContain('restoreWizardValues(config, data.inputs)');
  });

  it('still feeds the hand-raiser and the correction control from those same values', () => {
    expect(client).toContain('calculatorInputs={values}');
    expect(client).toContain('Object.keys(values).length > 0');
  });
});

// Josh, 2026-08-26: "some of the calculators have a redundant section where it has the user put
// in their followers etc further down the page after they had already filled out the calculator
// earlier in the page." That was /worth, and only for a visitor who answered its wizard here.
describe('/worth does not ask for the same numbers twice', () => {
  const worth = readFileSync(join(root, 'src/app/(public)/worth/WorthExperience.tsx'), 'utf-8');

  it('collapses the post-wizard input form into the shared correction line', () => {
    expect(worth).toContain('const answeredHere = entryDone && !homepage && !leadView;');
    expect(worth).toContain('These are your numbers. Change an answer and recalculate.');
  });

  it('keeps the open form where it IS the calculator, and never re-asks with cold copy', () => {
    // The homepage has no wizard and a tokenized lead never ran one on this device.
    const card = worth.slice(worth.indexOf('const answeredHere ='), worth.indexOf('const resultCard ='));
    expect(card).toContain('answeredHere || leadView');
    expect(card).toContain('Enter whatever you have');
  });
});

// A DM asks one or two questions; the same calculator on the web asks up to fourteen, and every
// unasked question took a conservative default. The tokenized page had no wizard and no way back
// into one, so the thinnest results in the funnel were the only ones nobody could improve.
describe('the tokenized result page offers a way to sharpen a thin result', () => {
  const page = readFileSync(join(root, 'src/app/(public)/tools/[slug]/result/[token]/page.tsx'), 'utf-8');

  it('derives how many questions went unanswered rather than flagging the channel', () => {
    expect(page).toContain('restoreWizardValues(toolConfig, result.inputData)');
    expect(page).toContain('answeredCount >= 1 && unansweredCount >= 2');
  });

  it('places it under the result and above the ladder, and it gates nothing', () => {
    const sharpen = page.indexOf('Answer the rest and see your real number.');
    expect(sharpen).toBeGreaterThan(-1);
    expect(sharpen).toBeLessThan(page.indexOf('<LadderSection'));
    expect(sharpen).toBeLessThan(page.indexOf('<LeadEmailCta'));
    // A correction control, not a second signup door.
    const block = page.slice(sharpen - 900, sharpen + 300);
    expect(block).not.toContain('/signup');
  });

  it('links to the calculator itself, never a hardcoded route', () => {
    expect(page).toContain('toolConfig.publicRoute');
    expect(page).toContain('href={sharpenHref}');
  });
});

// "Answer the rest" has to mean answer the REST. Dropping a ManyChat lead into a cold wizard
// makes the first screen a question they already answered in the DM, at the moment friction is
// most expensive. /worth has taken ?listeners=&followers= since it shipped; this is that pattern
// generalized and validated against each tool's own input definitions.
describe('prefillFromQuery', () => {
  const unified = getLeadMagnet('opportunity-calculator')!;
  const q = (s: string) => new URLSearchParams(s);

  it('round-trips the answers a DM lead already gave', () => {
    const answers = { social_followers: 250_000, monetization_status: 'direct_some' };
    const restored = prefillFromQuery(unified, q(prefillQueryString(answers as never)));
    expect(restored).toEqual(answers);
  });

  it('refuses a key the tool never declared', () => {
    expect(prefillFromQuery(unified, q('shows_per_year=20&social_followers=1000'))).toEqual({
      social_followers: 1000,
    });
  });

  it('refuses an option value the field does not offer', () => {
    expect(prefillFromQuery(unified, q('monetization_status=owns_a_label'))).toEqual({});
    expect(prefillFromQuery(unified, q('monetization_status=direct_established'))).toEqual({
      monetization_status: 'direct_established',
    });
  });

  it('refuses a number outside the field own bounds, and junk', () => {
    expect(prefillFromQuery(unified, q('social_followers=-5'))).toEqual({});
    expect(prefillFromQuery(unified, q('social_followers=999999999999'))).toEqual({});
    expect(prefillFromQuery(unified, q('social_followers=drop%20table'))).toEqual({});
  });

  it('reads the numbers a human would paste', () => {
    expect(prefillFromQuery(unified, q('social_followers=250,000'))).toEqual({ social_followers: 250_000 });
  });

  it('ignores an empty param rather than storing an empty answer', () => {
    expect(prefillFromQuery(unified, q('social_followers=&monetization_status='))).toEqual({});
  });
});

describe('the sharpen link carries the answers into the wizard', () => {
  const page = readFileSync(join(root, 'src/app/(public)/tools/[slug]/result/[token]/page.tsx'), 'utf-8');
  const client = readFileSync(join(root, 'src/components/lead-magnets/PublicToolClient.tsx'), 'utf-8');

  it('builds the link from the stored answers, not a bare route', () => {
    expect(page).toContain('prefillQueryString(alreadyAnswered)');
    expect(page).toContain('href={sharpenHref}');
  });

  it('the wizard reads them back on arrival', () => {
    expect(client).toContain('setValues(prefillFromQuery(config, params));');
    // Seeded before the hero renders, so the wizard never mounts empty and then jumps.
    const effect = client.slice(client.indexOf('Resume from an emailed link'), client.indexOf('const onComplete'));
    expect(effect.indexOf('prefillFromQuery')).toBeLessThan(effect.indexOf("setPhase('hero')"));
  });
});
