// Fan Testimonials — the load-bearing behaviour, pinned.
//
// Canonical architecture: docs/crwn-brain/27-AUTOMATED-FAN-TESTIMONIALS-ARCHITECTURE.md
//
// Each describe block below corresponds to a numbered invariant. The mutation that each one is
// meant to catch is named in its comment, so a future reader can reproduce the proof rather than
// trusting that it was done once.

import { describe, it, expect } from 'vitest';
import {
  ANONYMOUS_DISPLAY_LABEL,
  BODY_MAX_LENGTH,
  MAX_PUBLIC_TESTIMONIALS,
  PROMISE_TRIGGER_DELAY_DAYS,
  REQUEST_COOLDOWN_DAYS,
  TENURE_TRIGGER_DAYS,
  TESTIMONIAL_PROMPTS,
  consentScopeFrom,
  deriveVerification,
  displayIdentityFrom,
  isPromiseTriggerDue,
  isTenureTriggerDue,
  isTestimonialPubliclyEligible,
  mayCreateRequest,
  pickDisplayName,
  questionFor,
  tenureBucketLabel,
  toPublicTestimonial,
  validateTestimonialBody,
  type TestimonialVisibilityState,
  type VerificationEvidence,
} from './core';

const NOW = new Date('2026-08-12T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const publishable: TestimonialVisibilityState = {
  consentScope: 'crwn_only',
  featuredAt: daysAgo(1),
  hiddenAt: null,
  withdrawnAt: null,
  moderationStatus: 'auto_ok',
};

const activePaid: VerificationEvidence = {
  active: true,
  isPaidTier: true,
  isFounder: false,
  startedAt: daysAgo(200),
};

// ---------------------------------------------------------------------------

describe('TESTIMONIAL-004 — public display requires explicit fan consent', () => {
  // MUTATION: make featured-alone sufficient (drop the consentScope clause in
  // isTestimonialPubliclyEligible). These two cases fail.
  it('a featured testimonial the fan kept private is NOT publicly eligible', () => {
    expect(
      isTestimonialPubliclyEligible({ ...publishable, consentScope: 'private_to_artist' }),
    ).toBe(false);
  });

  it('toPublicTestimonial returns null for it, so a caller cannot publish by forgetting to filter', () => {
    const out = toPublicTestimonial({
      id: 't1',
      artistId: 'a1',
      body: 'Private feedback for the artist only.',
      submittedAt: daysAgo(2),
      contextKind: 'membership',
      identity: 'display_name',
      displayName: 'Maya W',
      displayNameIsPresentable: true,
      visibility: { ...publishable, consentScope: 'private_to_artist' },
      evidence: activePaid,
      now: NOW,
    });
    expect(out).toBeNull();
  });

  it('consent is only granted by an explicit true, never by a truthy value', () => {
    expect(consentScopeFrom(true)).toBe('crwn_only');
    for (const v of ['true', 1, {}, [], 'yes', undefined, null, false]) {
      expect(consentScopeFrom(v)).toBe('private_to_artist');
    }
  });

  it('consented but not featured stays private: collection is not publication', () => {
    expect(isTestimonialPubliclyEligible({ ...publishable, featuredAt: null })).toBe(false);
  });

  it('withdrawn, hidden and blocked each remove public eligibility on their own', () => {
    expect(isTestimonialPubliclyEligible({ ...publishable, withdrawnAt: daysAgo(0) })).toBe(false);
    expect(isTestimonialPubliclyEligible({ ...publishable, hiddenAt: daysAgo(0) })).toBe(false);
    expect(isTestimonialPubliclyEligible({ ...publishable, moderationStatus: 'blocked' })).toBe(false);
    expect(isTestimonialPubliclyEligible({ ...publishable, moderationStatus: 'flagged' })).toBe(false);
  });

  it('the fully approved row IS eligible, so the gate is not vacuously closed', () => {
    expect(isTestimonialPubliclyEligible(publishable)).toBe(true);
  });
});

describe('TESTIMONIAL-005 — verification derives from canonical evidence, never a claim', () => {
  // MUTATION: let a client-supplied `verified: true` decide the badge. There is no input here
  // that could carry one: deriveVerification takes only relationship evidence.
  it('a cancelled relationship produces no badge at all', () => {
    expect(deriveVerification({ ...activePaid, active: false })).toBe('none');
    expect(deriveVerification(null)).toBe('none');
  });

  it('founding beats paid, and paid beats free', () => {
    expect(deriveVerification({ ...activePaid, isFounder: true })).toBe('founding_supporter');
    expect(deriveVerification(activePaid)).toBe('paid_supporter');
    expect(deriveVerification({ ...activePaid, isPaidTier: false })).toBe('supporter');
  });

  it('a refunded-away subscription degrades the public payload rather than keeping a stale claim', () => {
    const out = toPublicTestimonial({
      id: 't1',
      artistId: 'a1',
      body: 'It was worth it.',
      submittedAt: daysAgo(30),
      contextKind: 'membership',
      identity: 'anonymous',
      displayName: null,
      displayNameIsPresentable: false,
      visibility: publishable,
      evidence: { ...activePaid, active: false },
      now: NOW,
    });
    // The words survive. The claim about the relationship does not.
    expect(out?.body).toBe('It was worth it.');
    expect(out?.verificationLabel).toBeNull();
    expect(out?.tenureLabel).toBeNull();
  });
});

describe('TESTIMONIAL-006 — the public payload cannot reveal what a fan spent', () => {
  // MUTATION: add `tierName` (or a price) to PublicTestimonial and populate it. The first two
  // tests fail because the key set is asserted exactly.
  //
  // THE PAIR RULE. Tier and tenure are each harmless alone. Together, beside the artist's public
  // price list, they are lifetime spend to the dollar. That is the defect leaderboardPrivacy.ts
  // exists to prevent, and the defence here is structural: no tier field exists to pair.
  const built = toPublicTestimonial({
    id: 't1',
    artistId: 'a1',
    body: 'Getting the demos early made me feel like I was actually part of it.',
    submittedAt: daysAgo(10),
    contextKind: 'membership',
    identity: 'display_name',
    displayName: 'Maya W',
    displayNameIsPresentable: true,
    visibility: publishable,
    evidence: activePaid,
    now: NOW,
  })!;

  it('exposes exactly the approved field set and nothing else', () => {
    expect(Object.keys(built).sort()).toEqual(
      [
        'artistId',
        'body',
        'contextKind',
        'displayName',
        'id',
        'submittedAt',
        'tenureLabel',
        'verificationLabel',
      ].sort(),
    );
  });

  it('carries no tier, price, amount, fan id, email or evidence pointer under any key', () => {
    const serialized = JSON.stringify(built).toLowerCase();
    for (const forbidden of ['tier', 'price', 'amount', 'cents', 'fanid', 'email', 'subscription', 'evidence', 'spend']) {
      expect(serialized, `public testimonial payload leaked "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it('tenure is bucketed, so it never pins a join date', () => {
    expect(tenureBucketLabel(daysAgo(400), NOW)).toBe('Supporter for over a year');
    expect(tenureBucketLabel(daysAgo(200), NOW)).toBe('Supporter for 6+ months');
    expect(tenureBucketLabel(daysAgo(100), NOW)).toBe('Supporter for 3+ months');
    // Under three months would narrow a join date to a short window for no product gain.
    expect(tenureBucketLabel(daysAgo(40), NOW)).toBeNull();
    expect(tenureBucketLabel(null, NOW)).toBeNull();
  });

  it('the verification vocabulary itself names no tier and no amount', () => {
    for (const kind of ['founding_supporter', 'paid_supporter', 'supporter', 'none'] as const) {
      const label = deriveVerification(
        kind === 'none'
          ? null
          : {
              active: true,
              isPaidTier: kind !== 'supporter',
              isFounder: kind === 'founding_supporter',
              startedAt: daysAgo(200),
            },
      );
      expect(label).toBe(kind);
    }
    // The badge is computed from BOOLEANS. A price cannot reach it because the shape has no slot
    // for one: this is the structural half of the privacy property.
    const evidenceKeys = Object.keys(activePaid).sort();
    expect(evidenceKeys).toEqual(['active', 'isFounder', 'isPaidTier', 'startedAt']);
  });
});

describe('fan display identity never leaks an email', () => {
  // profiles.display_name is public and historically defaulted to the signup email.
  it('an email-like name is forced anonymous even when the fan chose to show their name', () => {
    expect(
      pickDisplayName({ identity: 'display_name', displayName: 'maya@example.com', displayNameIsPresentable: false }),
    ).toBeNull();
  });

  it('anonymous never renders a name', () => {
    expect(
      pickDisplayName({ identity: 'anonymous', displayName: 'Maya W', displayNameIsPresentable: true }),
    ).toBeNull();
  });

  it('a real chosen name is shown', () => {
    expect(
      pickDisplayName({ identity: 'display_name', displayName: '  Maya W  ', displayNameIsPresentable: true }),
    ).toBe('Maya W');
  });

  it('an unrecognized identity value falls to the safer option', () => {
    expect(displayIdentityFrom('display_name')).toBe('display_name');
    for (const v of ['legal_name', 'email', '', null, undefined, 1, {}]) {
      expect(displayIdentityFrom(v)).toBe('anonymous');
    }
  });

  it('the anonymous byline still says the person is real', () => {
    expect(ANONYMOUS_DISPLAY_LABEL).toContain('verified');
  });
});

describe('trigger A — a promise actually delivered to this fan', () => {
  const base = {
    status: 'completed',
    completedAt: daysAgo(PROMISE_TRIGGER_DELAY_DAYS),
    isFanPromise: true,
    fanIsEligibleForObligation: true,
    now: NOW,
  };

  it('fires once the delay has elapsed', () => {
    expect(isPromiseTriggerDue(base)).toBe(true);
  });

  it('does not fire before the delay', () => {
    expect(isPromiseTriggerDue({ ...base, completedAt: daysAgo(PROMISE_TRIGGER_DELAY_DAYS - 1) })).toBe(false);
  });

  it('does not fire while the promise is unfulfilled', () => {
    expect(isPromiseTriggerDue({ ...base, status: 'pending' })).toBe(false);
    expect(isPromiseTriggerDue({ ...base, status: 'missed' })).toBe(false);
    expect(isPromiseTriggerDue({ ...base, completedAt: null })).toBe(false);
  });

  it('never fires for a fan who was not entitled to the promise', () => {
    expect(isPromiseTriggerDue({ ...base, fanIsEligibleForObligation: false })).toBe(false);
  });

  it('never fires for a Revenue Ramp step, which is the artist own task and not a fan promise', () => {
    expect(isPromiseTriggerDue({ ...base, isFanPromise: false })).toBe(false);
  });
});

describe('trigger B — thirty days paid and still active', () => {
  const base = { startedAt: daysAgo(TENURE_TRIGGER_DAYS), status: 'active', isPaidTier: true, now: NOW };

  it('day 30 while active is eligible', () => {
    expect(isTenureTriggerDue(base)).toBe(true);
  });

  it('day 29 is not', () => {
    expect(isTenureTriggerDue({ ...base, startedAt: daysAgo(TENURE_TRIGGER_DAYS - 1) })).toBe(false);
  });

  it('a cancelled or past-due subscription never qualifies, whatever the tenure', () => {
    for (const status of ['canceled', 'past_due', 'paused', 'incomplete', null]) {
      expect(isTenureTriggerDue({ ...base, startedAt: daysAgo(400), status })).toBe(false);
    }
  });

  it('a free member is not asked the paid question', () => {
    expect(isTenureTriggerDue({ ...base, isPaidTier: false })).toBe(false);
  });

  it('a missing start date is not treated as forever ago', () => {
    expect(isTenureTriggerDue({ ...base, startedAt: null })).toBe(false);
    expect(isTenureTriggerDue({ ...base, startedAt: 'not-a-date' })).toBe(false);
  });
});

describe('dedupe and the artist automation toggle', () => {
  const base = {
    automationEnabled: true,
    hasOutstandingRequest: false,
    hasRequestForThisTrigger: false,
    hasSubmittedForArtist: false,
    lastRequestAt: null as string | null,
    now: NOW,
  };

  it('allows the first ask', () => {
    expect(mayCreateRequest(base)).toBe(true);
  });

  // MUTATION: ignore automationEnabled in mayCreateRequest. This fails.
  it('D4: an artist who switched the automation off gets no new asks', () => {
    expect(mayCreateRequest({ ...base, automationEnabled: false })).toBe(false);
  });

  it('never stacks a second outstanding ask on the same fan', () => {
    expect(mayCreateRequest({ ...base, hasOutstandingRequest: true })).toBe(false);
  });

  it('never repeats the same trigger for the same fan and artist', () => {
    expect(mayCreateRequest({ ...base, hasRequestForThisTrigger: true })).toBe(false);
  });

  it('does not ask a fan who has already given this artist a testimonial', () => {
    expect(mayCreateRequest({ ...base, hasSubmittedForArtist: true })).toBe(false);
  });

  it('respects the cooldown after any previous ask, including a declined one', () => {
    expect(mayCreateRequest({ ...base, lastRequestAt: daysAgo(REQUEST_COOLDOWN_DAYS - 1) })).toBe(false);
    expect(mayCreateRequest({ ...base, lastRequestAt: daysAgo(REQUEST_COOLDOWN_DAYS) })).toBe(true);
  });
});

describe('submission validation is deterministic, and never judges the opinion', () => {
  it('keeps a critical answer exactly as written', () => {
    const critical = 'Honestly the vault has been dead for two months and I am thinking of leaving.';
    const out = validateTestimonialBody(critical);
    expect(out.ok).toBe(true);
    expect(out.body).toBe(critical);
  });

  it('strips links rather than rejecting the whole statement, and says so', () => {
    const out = validateTestimonialBody('Great stuff, see https://spam.example.com for more');
    expect(out.ok).toBe(true);
    expect(out.linksRemoved).toBe(true);
    expect(out.body).not.toContain('spam.example.com');
  });

  it('strips control characters', () => {
    const raw = 'clean' + String.fromCharCode(0) + 'text' + String.fromCharCode(7) + 'here';
    const out = validateTestimonialBody(raw);
    expect(out.body).toBe('cleantexthere');
  });

  it('bounds the length at both ends', () => {
    expect(validateTestimonialBody('').ok).toBe(false);
    expect(validateTestimonialBody('a').ok).toBe(false);
    expect(validateTestimonialBody('x'.repeat(BODY_MAX_LENGTH)).ok).toBe(true);
    expect(validateTestimonialBody('x'.repeat(BODY_MAX_LENGTH + 1)).ok).toBe(false);
  });

  it('refuses a non-string body instead of coercing one', () => {
    for (const v of [null, undefined, 42, {}, []]) {
      expect(validateTestimonialBody(v).ok).toBe(false);
    }
  });

  it('does not escape or mangle the fan characters, because escaping is a rendering control', () => {
    const out = validateTestimonialBody('me & my <3 for this "vault"');
    expect(out.body).toBe('me & my <3 for this "vault"');
  });
});

describe('the V1 shape stays V1', () => {
  it('has exactly two triggers, each with one question', () => {
    expect(Object.keys(TESTIMONIAL_PROMPTS).sort()).toEqual(['member_30d', 'promise_fulfilled']);
    expect(questionFor('member_30d')).toBe(TESTIMONIAL_PROMPTS.member_30d.question);
    expect(questionFor('promise_fulfilled')).toBe(TESTIMONIAL_PROMPTS.promise_fulfilled.question);
  });

  it('asks open questions that do not fish for praise', () => {
    for (const p of Object.values(TESTIMONIAL_PROMPTS)) {
      const q = p.question.toLowerCase();
      for (const leading of ['review', 'rate', 'positive', 'love', 'best', 'recommend', 'star']) {
        expect(q, `question fishes for praise via "${leading}"`).not.toContain(leading);
      }
      expect(q.endsWith('?')).toBe(true);
    }
  });

  it('writes no em dash anywhere a fan can read (CLAUDE.md copy rule)', () => {
    for (const p of Object.values(TESTIMONIAL_PROMPTS)) {
      expect(p.question).not.toContain('—');
      expect(p.question).not.toContain('–');
    }
    expect(ANONYMOUS_DISPLAY_LABEL).not.toContain('—');
  });

  it('bounds the public render so the artist page cannot become a wall of text', () => {
    expect(MAX_PUBLIC_TESTIMONIALS).toBeGreaterThan(0);
    expect(MAX_PUBLIC_TESTIMONIALS).toBeLessThanOrEqual(12);
  });
});
