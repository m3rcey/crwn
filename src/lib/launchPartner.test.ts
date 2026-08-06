import { describe, it, expect } from 'vitest';
import {
  GUARANTEE_MIN_CONTACTS,
  assembleLaunchPartnerChecklist,
  buildLaunchPartnerDefs,
  type LaunchPartnerConditionResult,
} from './launchPartner';

const done: LaunchPartnerConditionResult = { done: true, current: 1, target: 1 };

function resultsFor(keys: string[]): Record<string, LaunchPartnerConditionResult> {
  return Object.fromEntries(keys.map((k) => [k, done]));
}

const REQUIRED_KEYS = buildLaunchPartnerDefs({})
  .filter((d) => d.role === 'required')
  .map((d) => d.key);

describe('buildLaunchPartnerDefs', () => {
  it('has exactly one outcome condition: the first paid member', () => {
    const defs = buildLaunchPartnerDefs({});
    const outcomes = defs.filter((d) => d.role === 'outcome');
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].key).toBe('lp-first-paid-member');
  });

  it('requires the guarantee minimum contact count, not just any import', () => {
    const contacts = buildLaunchPartnerDefs({}).find((d) => d.key === 'lp-contacts')!;
    expect(contacts.source).toEqual({
      kind: 'check',
      check: 'artist_has_fan_contacts',
      count: GUARANTEE_MIN_CONTACTS,
    });
    expect(GUARANTEE_MIN_CONTACTS).toBe(100);
  });

  it('links the outcome to the public page when the slug exists', () => {
    const defs = buildLaunchPartnerDefs({ slug: 'm3rcey' });
    expect(defs.find((d) => d.key === 'lp-first-paid-member')!.href).toBe('/m3rcey');
  });

  it('carries no em dashes in artist-facing copy', () => {
    const text = JSON.stringify(buildLaunchPartnerDefs({ slug: 'x' }));
    expect(text).not.toContain('—');
    expect(text).not.toContain('–');
  });
});

describe('assembleLaunchPartnerChecklist', () => {
  it('starts pending with the first open required condition next', () => {
    const c = assembleLaunchPartnerChecklist(buildLaunchPartnerDefs({}), {});
    expect(c.status).toBe('pending');
    expect(c.requiredDone).toBe(0);
    expect(c.nextCondition?.key).toBe('lp-stripe');
  });

  it('becomes eligible when every required condition is met, outcome still open', () => {
    const c = assembleLaunchPartnerChecklist(buildLaunchPartnerDefs({}), resultsFor(REQUIRED_KEYS));
    expect(c.status).toBe('eligible');
    expect(c.nextCondition).toBeNull();
  });

  it('the outcome alone does not make the artist eligible; it marks achieved only with it done', () => {
    // A sale can land before the checklist is complete (a fan finds the page).
    // The guarantee status is achieved either way: the promised outcome exists.
    const early = assembleLaunchPartnerChecklist(
      buildLaunchPartnerDefs({}),
      resultsFor(['lp-first-paid-member']),
    );
    expect(early.status).toBe('achieved');

    const full = assembleLaunchPartnerChecklist(
      buildLaunchPartnerDefs({}),
      resultsFor([...REQUIRED_KEYS, 'lp-first-paid-member']),
    );
    expect(full.status).toBe('achieved');
  });

  it('missing results fail safe to not-done with the def target', () => {
    const c = assembleLaunchPartnerChecklist(buildLaunchPartnerDefs({}), {});
    const contacts = c.conditions.find((x) => x.key === 'lp-contacts')!;
    expect(contacts.done).toBe(false);
    expect(contacts.target).toBe(GUARANTEE_MIN_CONTACTS);
  });
});
