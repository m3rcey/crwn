import { describe, it, expect } from 'vitest';
import {
  GUARANTEE_MIN_CONTACTS,
  GUARANTEE_MIN_PROVEN_BUYERS,
  assembleLaunchPartnerChecklist,
  buildLaunchPartnerDefs,
  eligibleContactsResult,
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

  it('requires the eligible-contacts query, and never a mere campaign draft', () => {
    const defs = buildLaunchPartnerDefs({});
    const contacts = defs.find((d) => d.key === 'lp-contacts')!;
    expect(contacts.source).toEqual({ kind: 'query', query: 'eligible_contacts' });
    expect(GUARANTEE_MIN_CONTACTS).toBe(100);
    expect(GUARANTEE_MIN_PROVEN_BUYERS).toBe(40);
    // Drafting is harmless but proves nothing the SENT requirement does not
    // (founder review, 2026-08-06). It must not gate the guarantee.
    expect(defs.some((d) => d.key === 'lp-campaign-drafted')).toBe(false);
    expect(defs.some((d) => d.key === 'lp-campaign-sent')).toBe(true);
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

describe('eligibleContactsResult', () => {
  it('quantity path: 100 contacts of any kind satisfies the requirement', () => {
    expect(eligibleContactsResult(100, 0)).toEqual({ done: true, current: 100, target: 100 });
    expect(eligibleContactsResult(99, 0).done).toBe(false);
  });

  it('quality path: 40 proven buyers satisfy it with a small total list', () => {
    const r = eligibleContactsResult(40, 40);
    expect(r).toEqual({ done: true, current: 40, target: GUARANTEE_MIN_PROVEN_BUYERS });
  });

  it('reports progress along the closer path: 35 Patreon members read as 35 of 40', () => {
    const r = eligibleContactsResult(35, 35);
    expect(r.done).toBe(false);
    expect(r.current).toBe(35);
    expect(r.target).toBe(GUARANTEE_MIN_PROVEN_BUYERS);
  });

  it('a big cold list reports against 100, not against the proven-buyer bar', () => {
    const r = eligibleContactsResult(80, 5);
    expect(r.done).toBe(false);
    expect(r.current).toBe(80);
    expect(r.target).toBe(GUARANTEE_MIN_CONTACTS);
  });

  it('is safe on zero and junk input', () => {
    expect(eligibleContactsResult(0, 0)).toEqual({ done: false, current: 0, target: GUARANTEE_MIN_CONTACTS });
    expect(eligibleContactsResult(-5, NaN).done).toBe(false);
  });
});
