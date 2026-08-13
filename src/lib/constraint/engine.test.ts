import { describe, it, expect } from 'vitest';
import { readConstraint } from './engine';
import { CONSTRAINT_THRESHOLDS as T } from './thresholds';
import type { ConstraintEvidence, ConstraintResult, DiagnosedConstraint } from './types';

const NOW = '2026-08-03T12:00:00.000Z';

/** A fully healthy, well-past-launch artist. Every test perturbs one thing from here. */
function healthy(over: Partial<ConstraintEvidence> = {}): ConstraintEvidence {
  return {
    now: NOW,
    launch: {
      pageLive: true,
      stripeConnected: true,
      tierPurchasable: true,
      hasTrack: true,
      daysLive: 200,
    },
    reach: { uniqueVisits: 5000, lookbackDays: 30 },
    membership: {
      freeMembers: 400,
      paidMembers: 100,
      freeJoinsInWindow: 300,
      daysSinceFirstFreeMember: 180,
      hasFirstPaidConversion: true,
      mrrCents: 100000,
      premiumMrrShare: 0.4,
    },
    tiers: {
      interactionDataAvailable: true,
      paidRungs: [
        { tierId: 'silver', tierName: 'Silver', priceCents: 1000, views: 1000, checkoutStarts: 200, joins: 100 },
        { tierId: 'gold', tierName: 'Gold', priceCents: 2500, views: 800, checkoutStarts: 150, joins: 80 },
      ],
      lookbackDays: 30,
    },
    promises: {
      resolved: 20,
      completed: 19,
      missed: 1,
      completionRate: 0.95,
      overdueNow: 0,
      oldestOverdue: null,
      lookbackDays: 90,
    },
    retention: { churnRatePct: 2, platformChurnRatePct: 5, cancelReasonResponses: 3 },
    slug: 'm3rcey',
    ...over,
  };
}

function merge(base: ConstraintEvidence, patch: Record<string, unknown>): ConstraintEvidence {
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v)
      ? { ...(base as unknown as Record<string, Record<string, unknown>>)[k], ...(v as Record<string, unknown>) }
      : v;
  }
  return out as unknown as ConstraintEvidence;
}

function asDiagnosed(r: ConstraintResult): DiagnosedConstraint {
  if (r.status !== 'diagnosed') throw new Error(`expected a diagnosis, got: ${r.reason}`);
  return r;
}

// ---------------------------------------------------------------------------

describe('purity and shape', () => {
  it('is deterministic: the same evidence gives the same answer', () => {
    const e = merge(healthy(), { reach: { uniqueVisits: 10 } });
    expect(readConstraint(e)).toEqual(readConstraint(e));
  });

  it('stamps evaluatedAt from the evidence, never from its own clock', () => {
    expect(readConstraint(healthy()).evaluatedAt).toBe(NOW);
  });

  it('returns EXACTLY ONE action, never a list', () => {
    const r = asDiagnosed(readConstraint(merge(healthy(), { reach: { uniqueVisits: 10 } })));
    expect(r.action).toBeTruthy();
    expect(Array.isArray(r.action)).toBe(false);
    expect(r.action.href.startsWith('/')).toBe(true);
  });

  it('every diagnosis carries visible evidence', () => {
    const r = asDiagnosed(readConstraint(merge(healthy(), { reach: { uniqueVisits: 10 } })));
    expect(r.evidence.length).toBeGreaterThan(0);
    expect(r.evidence.every((e) => typeof e.label === 'string' && e.label.length > 0)).toBe(true);
  });
});

describe('stage 0: launch readiness stays owned by the roadmap', () => {
  it.each([
    ['pageLive', { pageLive: false }],
    ['stripeConnected', { stripeConnected: false }],
    ['tierPurchasable', { tierPurchasable: false }],
    ['hasTrack', { hasTrack: false }],
  ])('falls back when %s is missing', (_name, patch) => {
    const r = readConstraint(merge(healthy(), { launch: patch }));
    expect(r.status).toBe('insufficient_evidence');
  });

  it('names what is missing so the fallback is explainable', () => {
    const r = readConstraint(merge(healthy(), { launch: { stripeConnected: false } }));
    if (r.status !== 'insufficient_evidence') throw new Error('expected fallback');
    expect(r.missingEvidence.join(' ')).toContain('Stripe');
  });

  it('will not diagnose an artist who launched days ago', () => {
    const r = readConstraint(
      merge(healthy(), { launch: { daysLive: T.reach.minimumDaysLive - 1 }, reach: { uniqueVisits: 0 } }),
    );
    expect(r.status).toBe('insufficient_evidence');
  });

  it('starts evaluating exactly at the minimum days live', () => {
    const r = readConstraint(
      merge(healthy(), { launch: { daysLive: T.reach.minimumDaysLive }, reach: { uniqueVisits: 0 } }),
    );
    expect(asDiagnosed(r).constraint).toBe('REACH');
  });
});

describe('stage 1: fulfillment outranks everything downstream', () => {
  it('an overdue promise beats a total absence of traffic', () => {
    const r = asDiagnosed(
      readConstraint(
        merge(healthy(), {
          reach: { uniqueVisits: 0 },
          promises: { overdueNow: 1, oldestOverdue: { id: 'fe-1', title: 'August vault drop', dueAt: '2026-07-20T00:00:00.000Z' } },
        }),
      ),
    );
    expect(r.constraint).toBe('FULFILLMENT');
    // The destination is part of the advice: the overdue list, with THIS promise named, rather
    // than a calendar opened on "This week" for the artist to search again.
    expect(r.action.href).toBe('/studio/promise?tab=overdue&event=fe-1');
    expect(r.action.label).toContain('August vault drop');
  });

  it('one overdue promise is real but not yet a pattern: low confidence', () => {
    const r = asDiagnosed(readConstraint(merge(healthy(), { promises: { overdueNow: 1 } })));
    expect(r.confidence).toBe('low');
  });

  it('many overdue promises is a pattern: high confidence', () => {
    const r = asDiagnosed(
      readConstraint(merge(healthy(), { promises: { overdueNow: T.fulfillment.minimumDuePromises } })),
    );
    expect(r.confidence).toBe('high');
  });

  it('a poor completion RATE needs a real sample first', () => {
    const belowSample = readConstraint(
      merge(healthy(), {
        promises: { resolved: T.fulfillment.minimumDuePromises - 1, completed: 1, missed: 3, completionRate: 0.25 },
      }),
    );
    // Not diagnosed as fulfillment: falls through to the healthy end state.
    expect(belowSample.status).toBe('insufficient_evidence');
  });

  it('diagnoses at the sample minimum with a failing rate', () => {
    const r = asDiagnosed(
      readConstraint(
        merge(healthy(), {
          promises: { resolved: T.fulfillment.minimumDuePromises, completed: 2, missed: 3, completionRate: 0.4 },
        }),
      ),
    );
    expect(r.constraint).toBe('FULFILLMENT');
    expect(r.confidence).toBe('medium');
  });

  it('a completion rate exactly at the threshold is healthy, not failing', () => {
    const r = readConstraint(
      merge(healthy(), {
        promises: { resolved: 10, completed: 6, missed: 4, completionRate: T.fulfillment.minimumCompletionRate },
      }),
    );
    expect(r.status).toBe('insufficient_evidence');
  });

  it('outranks a retention problem, because the promise is why they are leaving', () => {
    const r = asDiagnosed(
      readConstraint(
        merge(healthy(), {
          promises: { overdueNow: 2 },
          retention: { churnRatePct: 40, platformChurnRatePct: 5 },
        }),
      ),
    );
    expect(r.constraint).toBe('FULFILLMENT');
  });

  it('outranks a depth problem', () => {
    const r = asDiagnosed(
      readConstraint(merge(healthy(), { promises: { overdueNow: 1 }, membership: { premiumMrrShare: 0 } })),
    );
    expect(r.constraint).toBe('FULFILLMENT');
  });
});

describe('stage 2: retention outranks acquisition and expansion', () => {
  it('diagnoses churn well above the benchmark', () => {
    const r = asDiagnosed(
      readConstraint(merge(healthy(), { retention: { churnRatePct: 10, platformChurnRatePct: 5 } })),
    );
    expect(r.constraint).toBe('RETENTION');
  });

  it('does not recommend acquiring more members while retention is failing', () => {
    const r = asDiagnosed(
      readConstraint(
        merge(healthy(), {
          reach: { uniqueVisits: 10 },
          retention: { churnRatePct: 10, platformChurnRatePct: 5 },
        }),
      ),
    );
    expect(r.constraint).toBe('RETENTION');
    expect(r.action.href).not.toContain('campaigns');
  });

  it('needs enough paid members before blaming churn on the artist', () => {
    const r = readConstraint(
      merge(healthy(), {
        membership: { paidMembers: T.retention.minimumPaidMembers - 1 },
        retention: { churnRatePct: 40, platformChurnRatePct: 5 },
      }),
    );
    expect(r.status).toBe('insufficient_evidence');
  });

  it('exactly at the unhealthy multiple counts as unhealthy', () => {
    const r = readConstraint(
      merge(healthy(), {
        retention: { churnRatePct: 5 * T.retention.unhealthyBenchmarkMultiplier, platformChurnRatePct: 5 },
      }),
    );
    expect(asDiagnosed(r).constraint).toBe('RETENTION');
  });

  it('just under the multiple is not diagnosed', () => {
    const r = readConstraint(
      merge(healthy(), { retention: { churnRatePct: 7.4, platformChurnRatePct: 5 } }),
    );
    expect(r.status).toBe('insufficient_evidence');
  });

  it('will not judge retention with no platform benchmark', () => {
    const r = readConstraint(
      merge(healthy(), { retention: { churnRatePct: 40, platformChurnRatePct: null } }),
    );
    expect(r.status).toBe('insufficient_evidence');
  });

  it('will not divide by a zero benchmark', () => {
    const r = readConstraint(
      merge(healthy(), { retention: { churnRatePct: 40, platformChurnRatePct: 0 } }),
    );
    expect(r.status).toBe('insufficient_evidence');
  });

  it('points at cancel reasons when they exist, and at the calendar when they do not', () => {
    const withReasons = asDiagnosed(
      readConstraint(merge(healthy(), { retention: { churnRatePct: 10, platformChurnRatePct: 5, cancelReasonResponses: 4 } })),
    );
    expect(withReasons.action.href).toBe('/studio/analytics');
    const without = asDiagnosed(
      readConstraint(merge(healthy(), { retention: { churnRatePct: 10, platformChurnRatePct: 5, cancelReasonResponses: 0 } })),
    );
    expect(without.action.href).toBe('/studio/promise');
  });
});

describe('stage 3: reach wins before any conversion analysis', () => {
  it('diagnoses low traffic', () => {
    const r = asDiagnosed(readConstraint(merge(healthy(), { reach: { uniqueVisits: 12 } })));
    expect(r.constraint).toBe('REACH');
  });

  it('beats a free-capture problem, because capture has not been tested', () => {
    const r = asDiagnosed(
      readConstraint(merge(healthy(), { reach: { uniqueVisits: 12 }, membership: { freeJoinsInWindow: 0 } })),
    );
    expect(r.constraint).toBe('REACH');
  });

  it('refuses to diagnose anything when visit data is unavailable', () => {
    const r = readConstraint(merge(healthy(), { reach: { uniqueVisits: null } }));
    expect(r.status).toBe('insufficient_evidence');
    if (r.status !== 'insufficient_evidence') return;
    expect(r.missingEvidence).toContain('unique page visits');
  });

  it('sends an artist with no members to import contacts, and one with members to campaign', () => {
    const noMembers = asDiagnosed(
      readConstraint(merge(healthy(), { reach: { uniqueVisits: 5 }, membership: { freeMembers: 0 } })),
    );
    // ?import=1 opens the import dialog itself, not the CRM page it hides behind.
    expect(noMembers.action.href).toBe('/studio/fans?import=1');
    const withMembers = asDiagnosed(
      readConstraint(merge(healthy(), { reach: { uniqueVisits: 5 }, membership: { freeMembers: 40 } })),
    );
    expect(withMembers.action.href).toBe('/studio/fans?view=campaigns');
  });

  it('exactly at the minimum visits is no longer a reach problem', () => {
    const r = readConstraint(
      merge(healthy(), { reach: { uniqueVisits: T.reach.minimumVisitsForEvaluation } }),
    );
    expect(r.status).toBe('insufficient_evidence');
  });
});

describe('stage 4: free capture', () => {
  it('diagnoses plenty of traffic and almost no joins', () => {
    const r = asDiagnosed(
      readConstraint(merge(healthy(), { reach: { uniqueVisits: 1000 }, membership: { freeJoinsInWindow: 5 } })),
    );
    expect(r.constraint).toBe('FREE_CAPTURE');
    expect(r.action.href).toBe('/account/tiers');
  });

  it('needs the minimum visits before judging the rate', () => {
    const r = readConstraint(
      merge(healthy(), {
        reach: { uniqueVisits: T.freeCapture.minimumVisits - 1 },
        membership: { freeJoinsInWindow: 0 },
      }),
    );
    expect(r.status).toBe('insufficient_evidence');
  });

  it('a rate exactly at the healthy threshold is not diagnosed', () => {
    const visits = 1000;
    const r = readConstraint(
      merge(healthy(), {
        reach: { uniqueVisits: visits },
        membership: { freeJoinsInWindow: visits * T.freeCapture.minimumHealthyRate },
      }),
    );
    expect(r.status).toBe('insufficient_evidence');
  });

  it('confidence rises with the sample', () => {
    const atMin = asDiagnosed(
      readConstraint(
        merge(healthy(), {
          reach: { uniqueVisits: T.freeCapture.minimumVisits },
          membership: { freeJoinsInWindow: 0 },
        }),
      ),
    );
    expect(atMin.confidence).toBe('medium');
    const atDouble = asDiagnosed(
      readConstraint(
        merge(healthy(), {
          reach: { uniqueVisits: T.freeCapture.minimumVisits * 2 },
          membership: { freeJoinsInWindow: 0 },
        }),
      ),
    );
    expect(atDouble.confidence).toBe('high');
  });

  it('does not evaluate when free joins are unknown', () => {
    const r = readConstraint(
      merge(healthy(), { reach: { uniqueVisits: 1000 }, membership: { freeJoinsInWindow: null } }),
    );
    expect(r.status).toBe('insufficient_evidence');
  });
});

describe('stage 5: first paid conversion', () => {
  const noPaid = {
    membership: {
      hasFirstPaidConversion: false,
      freeMembers: 120,
      daysSinceFirstFreeMember: 90,
      paidMembers: 0,
      mrrCents: 0,
      premiumMrrShare: null,
    },
    retention: { churnRatePct: 0, platformChurnRatePct: 5 },
  };

  it('diagnoses a real list that has never bought', () => {
    const r = asDiagnosed(readConstraint(merge(healthy(), noPaid)));
    expect(r.constraint).toBe('FIRST_PAID');
    expect(r.action.href).toBe('/account/tiers');
  });

  it('needs enough free members first', () => {
    const r = readConstraint(
      merge(healthy(), {
        ...noPaid,
        membership: { ...noPaid.membership, freeMembers: T.firstPaid.minimumFreeMembers - 1 },
      }),
    );
    expect(r.status).toBe('insufficient_evidence');
  });

  it('needs enough time since the first free member', () => {
    const r = readConstraint(
      merge(healthy(), {
        ...noPaid,
        membership: {
          ...noPaid.membership,
          daysSinceFirstFreeMember: T.firstPaid.minimumDaysSinceFirstFreeMember - 1,
        },
      }),
    );
    expect(r.status).toBe('insufficient_evidence');
  });

  it('never fires for an artist who HAS been paid', () => {
    const r = readConstraint(
      merge(healthy(), { ...noPaid, membership: { ...noPaid.membership, hasFirstPaidConversion: true } }),
    );
    expect(r.status === 'diagnosed' ? r.constraint : null).not.toBe('FIRST_PAID');
  });

  it('does not fire when the paid state is unknown', () => {
    const r = readConstraint(
      merge(healthy(), { ...noPaid, membership: { ...noPaid.membership, hasFirstPaidConversion: null } }),
    );
    expect(r.status === 'diagnosed' ? r.constraint : null).not.toBe('FIRST_PAID');
  });
});

describe('stage 6: paid tier interest', () => {
  it('diagnoses views without checkout starts', () => {
    const r = asDiagnosed(
      readConstraint(
        merge(healthy(), {
          tiers: {
            interactionDataAvailable: true,
            paidRungs: [
              { tierId: 'silver', tierName: 'Silver', priceCents: 1000, views: 400, checkoutStarts: 2, joins: 1 },
            ],
            lookbackDays: 30,
          },
        }),
      ),
    );
    expect(r.constraint).toBe('PAID_TIER_INTEREST');
    expect(r.title).toContain('Silver');
  });

  it('needs the minimum tier views', () => {
    const r = readConstraint(
      merge(healthy(), {
        tiers: {
          interactionDataAvailable: true,
          paidRungs: [
            {
              tierId: 'silver',
              tierName: 'Silver',
              priceCents: 1000,
              views: T.paidTierInterest.minimumTierViews - 1,
              checkoutStarts: 0,
              joins: 0,
            },
          ],
          lookbackDays: 30,
        },
      }),
    );
    expect(r.status).toBe('insufficient_evidence');
  });

  it('never fires when tier interaction data is unavailable', () => {
    const r = readConstraint(
      merge(healthy(), {
        tiers: {
          interactionDataAvailable: false,
          paidRungs: [
            { tierId: 'silver', tierName: 'Silver', priceCents: 1000, views: 400, checkoutStarts: 0, joins: 0 },
          ],
          lookbackDays: 30,
        },
      }),
    );
    expect(r.status).toBe('insufficient_evidence');
  });

  it('reports the EARLIEST failing rung, since a blockage there is upstream', () => {
    const r = asDiagnosed(
      readConstraint(
        merge(healthy(), {
          tiers: {
            interactionDataAvailable: true,
            paidRungs: [
              { tierId: 'silver', tierName: 'Silver', priceCents: 1000, views: 400, checkoutStarts: 2, joins: 1 },
              { tierId: 'gold', tierName: 'Gold', priceCents: 2500, views: 400, checkoutStarts: 1, joins: 0 },
            ],
            lookbackDays: 30,
          },
        }),
      ),
    );
    expect(r.title).toContain('Silver');
  });

  it('uses neutral language, never blame', () => {
    const r = asDiagnosed(
      readConstraint(
        merge(healthy(), {
          tiers: {
            interactionDataAvailable: true,
            paidRungs: [
              { tierId: 'silver', tierName: 'Silver', priceCents: 1000, views: 400, checkoutStarts: 2, joins: 1 },
            ],
            lookbackDays: 30,
          },
        }),
      ),
    );
    const text = `${r.title} ${r.explanation}`.toLowerCase();
    expect(text).not.toContain('bad');
    expect(text).not.toContain('do not want');
    expect(text).toContain('viewing');
  });
});

describe('stage 7: checkout completion, with a product-integrity guard', () => {
  // Interest must be HEALTHY here, or stage 6 fires first and stage 7 is never reached.
  // 100 starts on 200 views is a 50% start rate, well clear of the 5% floor.
  const rung = (over: Record<string, number>) => ({
    tiers: {
      interactionDataAvailable: true,
      paidRungs: [
        { tierId: 'silver', tierName: 'Silver', priceCents: 1000, views: 200, checkoutStarts: 100, joins: 10, ...over },
      ],
      lookbackDays: 30,
    },
  });

  it('diagnoses starts that do not finish', () => {
    const r = asDiagnosed(readConstraint(merge(healthy(), rung({}))));
    expect(r.constraint).toBe('CHECKOUT_COMPLETION');
  });

  it('needs the minimum checkout starts', () => {
    const r = readConstraint(
      merge(healthy(), rung({ checkoutStarts: T.checkoutCompletion.minimumCheckoutStarts - 1, joins: 0 })),
    );
    expect(r.status).toBe('insufficient_evidence');
  });

  it('DECLINES to diagnose when joins exceed checkout starts, because the data is inconsistent', () => {
    // Members who joined before instrumentation, or a fan who started on one day and paid on
    // another. Blaming the artist for our own measurement gap is the failure mode to avoid.
    const r = readConstraint(merge(healthy(), rung({ checkoutStarts: 30, joins: 45 })));
    expect(r.status).toBe('insufficient_evidence');
  });

  it('a completion rate exactly at the threshold is healthy', () => {
    const r = readConstraint(
      merge(healthy(), rung({ checkoutStarts: 100, joins: 100 * T.checkoutCompletion.minimumCompletionRate })),
    );
    expect(r.status).toBe('insufficient_evidence');
  });

  it('does not claim to know WHY, only that it happens after the decision', () => {
    const r = asDiagnosed(readConstraint(merge(healthy(), rung({}))));
    expect(r.explanation.toLowerCase()).toContain('does not say');
  });

  it('interest is diagnosed before completion when both fail', () => {
    const r = asDiagnosed(
      readConstraint(
        merge(healthy(), {
          tiers: {
            interactionDataAvailable: true,
            paidRungs: [
              { tierId: 'silver', tierName: 'Silver', priceCents: 1000, views: 5000, checkoutStarts: 100, joins: 5 },
            ],
            lookbackDays: 30,
          },
        }),
      ),
    );
    expect(r.constraint).toBe('PAID_TIER_INTEREST');
  });
});

describe('stage 8: depth is evaluated last', () => {
  it('diagnoses a ladder earning only at the bottom', () => {
    const r = asDiagnosed(readConstraint(merge(healthy(), { membership: { premiumMrrShare: 0.05 } })));
    expect(r.constraint).toBe('DEPTH');
  });

  it('needs enough paid members before judging the ladder shape', () => {
    const r = readConstraint(
      merge(healthy(), {
        membership: { paidMembers: T.depth.minimumPaidMembers - 1, premiumMrrShare: 0 },
        retention: { churnRatePct: 0, platformChurnRatePct: 5 },
      }),
    );
    expect(r.status).toBe('insufficient_evidence');
  });

  it('does not fire when premium share is unknown', () => {
    const r = readConstraint(merge(healthy(), { membership: { premiumMrrShare: null } }));
    expect(r.status).toBe('insufficient_evidence');
  });

  it('a share exactly at the threshold is healthy', () => {
    const r = readConstraint(
      merge(healthy(), { membership: { premiumMrrShare: T.depth.minimumPremiumMrrShare } }),
    );
    expect(r.status).toBe('insufficient_evidence');
  });

  it('every upstream stage outranks it', () => {
    const withDepthProblem = { membership: { premiumMrrShare: 0 } };
    expect(
      asDiagnosed(readConstraint(merge(healthy(), { ...withDepthProblem, promises: { overdueNow: 1 } }))).constraint,
    ).toBe('FULFILLMENT');
    expect(
      asDiagnosed(
        readConstraint(merge(healthy(), { ...withDepthProblem, retention: { churnRatePct: 20, platformChurnRatePct: 5 } })),
      ).constraint,
    ).toBe('RETENTION');
    expect(
      asDiagnosed(readConstraint(merge(healthy(), { ...withDepthProblem, reach: { uniqueVisits: 5 } }))).constraint,
    ).toBe('REACH');
  });
});

describe('healthy artist', () => {
  it('manufactures no problem', () => {
    const r = readConstraint(healthy());
    expect(r.status).toBe('insufficient_evidence');
    if (r.status !== 'insufficient_evidence') return;
    expect(r.reason).toContain('No constraint');
    expect(r.missingEvidence).toEqual([]);
  });
});

describe('no upgrade or downgrade inference anywhere', () => {
  it('never mentions upgrades or downgrades, since the schema cannot support it', () => {
    const cases: ConstraintEvidence[] = [
      merge(healthy(), { reach: { uniqueVisits: 5 } }),
      merge(healthy(), { promises: { overdueNow: 2 } }),
      merge(healthy(), { membership: { premiumMrrShare: 0 } }),
      merge(healthy(), { retention: { churnRatePct: 20, platformChurnRatePct: 5 } }),
    ];
    for (const e of cases) {
      const r = readConstraint(e);
      const text = JSON.stringify(r).toLowerCase();
      expect(text).not.toContain('upgrade');
      expect(text).not.toContain('downgrade');
    }
  });
});
