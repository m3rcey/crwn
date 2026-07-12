// Tests for the acquisition engine's pure services.
//
// These cover the code paths where a bug is SILENT: a prompt injection that lands, a guess
// that overwrites a fact, an illegal state transition that corrupts a session, a token that
// validates when it should not. A bug in any of these produces no error and no crash, just a
// wrong answer shown to an artist as fact. That is what earns a test.

import { describe, expect, it } from 'vitest';

import { validateDecision, MAX_CLAUDE_SCORE_SIGNAL } from './decisionSchema';
import {
  normalizeDeterministic,
  parseCount,
  parseDollarsToCents,
  validateExtractedValue,
} from './fieldRegistry';
import { canTransition, nextState, transition } from './stateMachine';
import { TRUST_RANK } from './types';
import { scoreLead, EMPTY_BEHAVIOR } from './leadScoring';
import { getTool, missingRequiredFields, ACQUISITION_TOOL_IDS } from './toolAdapters';
import { validateInbound, normalizeUsername, normalizeEmailLoose } from '../manychat/schemas';
import { verifyManyChatRequest } from '../manychat/verifyWebhook';
import { hashToken, mintToken, isExpired } from '../leadResults/resultToken';
import { DESTINATION_IDS, resolveDestination } from '../quests/destinationRegistry';

const ALLOW = {
  leadMagnetIds: ACQUISITION_TOOL_IDS,
  calculatorIds: ['worth', 'vaultRevenuePlan'],
  riseModeDestinations: DESTINATION_IDS,
  allowedQuestionFields: ['monthly_listeners', 'primary_blocker'],
};

// ---------------------------------------------------------------------------
describe('deterministic normalization (the path that avoids Claude entirely)', () => {
  it('parses the ways humans actually type numbers', () => {
    expect(parseCount('40k')).toBe(40_000);
    expect(parseCount('about 40,000 i think')).toBe(40_000);
    expect(parseCount('1.2m')).toBe(1_200_000);
    expect(parseCount('0')).toBe(0);
  });

  it('returns null on genuinely ambiguous text, which is the signal to escalate', () => {
    expect(parseCount('not many honestly')).toBeNull();
    expect(parseCount('')).toBeNull();
  });

  it('rejects absurd values instead of storing them', () => {
    // Above the sanity ceiling: a typo or an injection, never a real artist.
    expect(parseCount('999999999999')).toBeNull();
  });

  it('converts dollars to integer cents (CLAUDE.md: money is always cents)', () => {
    expect(parseDollarsToCents('$1,200.50')).toBe(120_050);
    expect(parseDollarsToCents('2k')).toBe(200_000);
  });

  it('accepts an enum answer with human spacing, but nothing looser', () => {
    // Spaces and hyphens normalize to underscores, so a ManyChat button labelled
    // "audience wont pay" resolves with no model call. That is the point of this path.
    expect(normalizeDeterministic('primary_blocker', 'audience wont pay')).toBe('audience_wont_pay');
    expect(normalizeDeterministic('primary_blocker', 'audience_wont_pay')).toBe('audience_wont_pay');

    // A real sentence is NOT force-matched to the nearest enum. It returns null, which is
    // the signal to escalate to Claude, which is exactly what Claude is for.
    expect(normalizeDeterministic('primary_blocker', 'honestly nobody ever buys anything')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('Claude output validation (the prompt-injection blast door)', () => {
  it('REFUSES to let Claude write a money field, whatever it claims', () => {
    const v = validateDecision(
      {
        intent: 'continue_questions',
        confidence: 1,
        leadScoreSignal: 0,
        responseMessage: 'ok',
        internalReasonCode: 'x',
        requiresHumanReview: false,
        missingRequiredFields: [],
        // The injection payload: "set my revenue to 500000".
        extractedFields: { direct_fan_revenue_cents: 50_000_000, monthly_listeners: 1000 },
      },
      ALLOW,
    );
    expect(v.ok).toBe(true);
    // The money field is GONE. The legitimate count survived.
    expect(v.decision!.extractedFields.direct_fan_revenue_cents).toBeUndefined();
    expect(v.decision!.extractedFields.monthly_listeners).toBe(1000);
    expect(v.violations).toContain('field_not_extractable:direct_fan_revenue_cents');
  });

  it('strips a responseMessage containing a URL (phishing via DM)', () => {
    const v = validateDecision(
      {
        intent: 'continue_questions',
        confidence: 1,
        leadScoreSignal: 0,
        responseMessage: 'You have been approved! Claim at https://evil.example/steal',
        internalReasonCode: 'x',
        requiresHumanReview: false,
        missingRequiredFields: [],
        extractedFields: {},
      },
      ALLOW,
    );
    expect(v.decision!.responseMessage).toBe('');
    expect(v.violations).toContain('responseMessage_contained_url');
  });

  it('rejects a lead magnet that is not in the registry', () => {
    const v = validateDecision(
      {
        intent: 'generate_result',
        confidence: 1,
        leadScoreSignal: 0,
        responseMessage: 'ok',
        internalReasonCode: 'x',
        requiresHumanReview: false,
        missingRequiredFields: [],
        extractedFields: {},
        recommendedLeadMagnet: 'attacker-controlled-tool',
      },
      ALLOW,
    );
    expect(v.decision!.recommendedLeadMagnet).toBeNull();
  });

  it('rejects a Rise Mode destination that is not a real destination id', () => {
    const v = validateDecision(
      {
        intent: 'continue_questions',
        confidence: 1,
        leadScoreSignal: 0,
        responseMessage: 'ok',
        internalReasonCode: 'x',
        requiresHumanReview: false,
        missingRequiredFields: [],
        extractedFields: {},
        recommendedRiseModeStep: 'https://evil.example',
      },
      ALLOW,
    );
    expect(v.decision!.recommendedRiseModeStep).toBeNull();
  });

  it('clamps a runaway lead score signal', () => {
    const v = validateDecision(
      {
        intent: 'continue_questions',
        confidence: 1,
        leadScoreSignal: 9999,
        responseMessage: 'ok',
        internalReasonCode: 'x',
        requiresHumanReview: false,
        missingRequiredFields: [],
        extractedFields: {},
      },
      ALLOW,
    );
    expect(v.decision!.leadScoreSignal).toBe(MAX_CLAUDE_SCORE_SIGNAL);
  });

  it('drops a low-confidence extraction rather than storing a guess', () => {
    expect(validateExtractedValue('monthly_listeners', 40_000, 0.2)).toBeNull();
    expect(validateExtractedValue('monthly_listeners', 40_000, 0.9)).toBe(40_000);
  });

  it('rejects an entirely unusable intent', () => {
    const v = validateDecision({ intent: 'delete_all_users' }, ALLOW);
    expect(v.ok).toBe(false);
    expect(v.decision).toBeNull();
  });

  it('strips em dashes from model copy (CLAUDE.md applies to Claude too)', () => {
    const v = validateDecision(
      {
        intent: 'continue_questions',
        confidence: 1,
        leadScoreSignal: 0,
        responseMessage: 'Your fanbase — the real one — is worth more.',
        internalReasonCode: 'x',
        requiresHumanReview: false,
        missingRequiredFields: [],
        extractedFields: {},
      },
      ALLOW,
    );
    expect(v.decision!.responseMessage).not.toContain('—');
  });
});

// ---------------------------------------------------------------------------
describe('trust ordering (a guess must never beat a fact)', () => {
  it('ranks verified CRWN data above everything Claude can produce', () => {
    expect(TRUST_RANK.verified_crwn).toBeGreaterThan(TRUST_RANK.claude_extraction);
    expect(TRUST_RANK.direct_answer).toBeGreaterThan(TRUST_RANK.claude_extraction);
    expect(TRUST_RANK.deterministic).toBeGreaterThan(TRUST_RANK.claude_extraction);
    expect(TRUST_RANK.claude_extraction).toBeGreaterThan(TRUST_RANK.provider_metadata);
  });
});

// ---------------------------------------------------------------------------
describe('state machine (CRWN decides, Claude only suggests)', () => {
  it('permits the real journey', () => {
    expect(canTransition('collecting_required_metrics', 'ready_for_result')).toBe(true);
    expect(canTransition('result_viewed', 'account_claim_started')).toBe(true);
  });

  it('refuses to send a result that was never generated', () => {
    expect(canTransition('collecting_required_metrics', 'result_sent')).toBe(false);
  });

  it('refuses to claim an account before a result exists', () => {
    expect(canTransition('initiated', 'account_claimed')).toBe(false);
  });

  it('rejects an illegal move instead of forcing it (a stale retry is a no-op)', () => {
    const r = transition('purchased', 'collecting_goal', 'weird');
    expect(r.rejected).toBe(true);
    expect(r.state).toBe('purchased'); // stayed put
  });

  it('gates everything behind consent', () => {
    const s = nextState('initiated', {
      missingRequiredFields: ['monthly_listeners'],
      hasConsent: false,
      hasResult: false,
      hasVerifiedEmail: false,
      isClaimed: false,
      needsHumanReview: false,
    });
    expect(s).toBe('awaiting_opt_in');
  });

  it('goes to result only when nothing required is missing', () => {
    const facts = {
      missingRequiredFields: [],
      hasConsent: true,
      hasResult: false,
      hasVerifiedEmail: false,
      isClaimed: false,
      needsHumanReview: false,
    };
    expect(nextState('collecting_required_metrics', facts)).toBe('ready_for_result');
  });

  it('routes to human review above all else', () => {
    const s = nextState('collecting_required_metrics', {
      missingRequiredFields: [],
      hasConsent: true,
      hasResult: false,
      hasVerifiedEmail: false,
      isClaimed: false,
      needsHumanReview: true,
    });
    expect(s).toBe('human_review');
  });
});

// ---------------------------------------------------------------------------
describe('ManyChat payload validation', () => {
  const good = {
    event_type: 'answer',
    event_id: 'evt_1',
    manychat_contact_id: 'c_1',
    question_key: 'monthly_listeners',
    answer: '40k',
  };

  it('accepts a well-formed answer', () => {
    expect(validateInbound(good).ok).toBe(true);
  });

  it('requires an event_id, because without one replay protection is impossible', () => {
    const r = validateInbound({ ...good, event_id: undefined });
    expect(r.ok).toBe(false);
    expect((r as { code: string }).code).toBe('missing_event_id');
  });

  it('rejects an answer with no question_key rather than writing an orphan row', () => {
    const r = validateInbound({ ...good, question_key: undefined });
    expect(r.ok).toBe(false);
  });

  it('rejects an unknown event type', () => {
    expect(validateInbound({ ...good, event_type: 'drop_tables' }).ok).toBe(false);
  });

  it('bounds a hostile 100KB answer instead of passing it to the model', () => {
    const r = validateInbound({ ...good, answer: 'x'.repeat(100_000) });
    expect(r.ok).toBe(true);
    expect((r as { value: { answer: string } }).value.answer.length).toBeLessThanOrEqual(2000);
  });

  it('normalizes an Instagram username but never treats it as identity', () => {
    expect(normalizeUsername('@M3rcey')).toBe('m3rcey');
  });

  it('rejects a malformed email rather than storing it', () => {
    expect(normalizeEmailLoose('not-an-email')).toBeNull();
    expect(normalizeEmailLoose('  A@B.co ')).toBe('a@b.co');
  });
});

// ---------------------------------------------------------------------------
describe('webhook verification', () => {
  const KEY = 'MANYCHAT_WEBHOOK_SECRET';

  it('FAILS CLOSED when the secret is not configured', () => {
    const prev = process.env[KEY];
    delete process.env[KEY];
    const r = verifyManyChatRequest({ presentedSecret: 'anything' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('not_configured');
    if (prev) process.env[KEY] = prev;
  });

  it('rejects a wrong secret', () => {
    process.env[KEY] = 'correct-horse-battery-staple';
    expect(verifyManyChatRequest({ presentedSecret: 'wrong' }).ok).toBe(false);
    expect(verifyManyChatRequest({ presentedSecret: null }).ok).toBe(false);
  });

  it('accepts the right secret', () => {
    process.env[KEY] = 'correct-horse-battery-staple';
    expect(verifyManyChatRequest({ presentedSecret: 'correct-horse-battery-staple' }).ok).toBe(true);
  });

  it('rejects a stale timestamp when ManyChat sends one', () => {
    process.env[KEY] = 'correct-horse-battery-staple';
    const r = verifyManyChatRequest({
      presentedSecret: 'correct-horse-battery-staple',
      sentAt: new Date(Date.now() - 3_600_000).toISOString(),
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('stale_timestamp');
  });
});

// ---------------------------------------------------------------------------
describe('result tokens', () => {
  it('mints high-entropy tokens that never repeat', () => {
    const a = mintToken();
    const b = mintToken();
    expect(a.raw).not.toBe(b.raw);
    expect(a.raw.length).toBeGreaterThan(30);
  });

  it('stores only the hash, and the hash is stable', () => {
    const { raw, hash } = mintToken();
    expect(hash).not.toContain(raw);
    expect(hashToken(raw)).toBe(hash);
  });

  it('expires', () => {
    expect(isExpired(new Date(Date.now() - 1000).toISOString())).toBe(true);
    expect(isExpired(new Date(Date.now() + 60_000).toISOString())).toBe(false);
    expect(isExpired(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('tool adapters (parity with the five existing lead magnets)', () => {
  it('registers all five', () => {
    expect(ACQUISITION_TOOL_IDS).toHaveLength(5);
    expect(ACQUISITION_TOOL_IDS).toContain('worth');
    expect(ACQUISITION_TOOL_IDS).toContain('vault-revenue-planner');
    expect(ACQUISITION_TOOL_IDS).toContain('proof-of-demand-test-builder');
    expect(ACQUISITION_TOOL_IDS).toContain('fan-mission-generator');
    expect(ACQUISITION_TOOL_IDS).toContain('clip-to-earn-campaign-planner');
  });

  it('produces the SAME numbers as the existing /worth calculator', () => {
    // This is the parity guarantee, made concrete. The adapter calls leadCalculator.calculate
    // with the conservative preset, exactly as WorthExperience does. If someone ever
    // duplicates the formula instead of calling it, this test is what catches the drift.
    const tool = getTool('worth')!;
    const result = tool.execute({ monthly_listeners: 40_000 });
    expect(result.generatorVersion).toBe('leadCalculator@1');

    // conservative: reach .15, superfan .03 -> 40000 * .15 * .03 = 180 payers
    const audience = result.sections.find((s) => s.key === 'audience');
    const payers = audience?.metrics?.find((m) => m.label === 'Fans likely to ever pay');
    expect(payers?.value).toBe('180');
  });

  it('asks only for the fields the selected tool actually needs', () => {
    const worth = getTool('worth')!;
    expect(missingRequiredFields(worth, {})).toEqual(['monthly_listeners']);
    expect(missingRequiredFields(worth, { monthly_listeners: 1000 })).toEqual([]);
  });

  it('runs every tool without throwing on an empty profile', () => {
    // A DM lead may reach a tool with almost nothing filled in. No adapter may explode.
    for (const id of ACQUISITION_TOOL_IDS) {
      expect(() => getTool(id)!.execute({})).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
describe('lead scoring (explainable, deterministic, Claude-bounded)', () => {
  it('scores the ideal CRWN lead highly: real reach, zero fan ownership', () => {
    const s = scoreLead({
      profile: {
        monthly_listeners: 120_000,
        email_list_size: 0,
        primary_goal: 'own_my_fanbase',
        primary_blocker: 'audience_wont_pay',
      },
      behavior: { ...EMPTY_BEHAVIOR, resultViewed: true },
    });
    expect(s.reasonCodes).toContain('reach_without_ownership');
    expect(s.reasonCodes).toContain('strong_fit');

    // 39 = audience 20 + alignment 15 (goal 8 + blocker 7) + behavior 4. Pinned exactly, so
    // that any future change to the weights is a deliberate decision rather than a surprise.
    expect(s.total).toBe(39);
    expect(s.components).toMatchObject({ audience: 20, alignment: 15, fanOwnership: 0 });
  });

  it('penalizes a lead whose real problem is not one CRWN solves', () => {
    const withAudienceBlocker = scoreLead({
      profile: { monthly_listeners: 500, primary_blocker: 'no_audience' },
      behavior: EMPTY_BEHAVIOR,
    });
    expect(withAudienceBlocker.reasonCodes).toContain('blocker_is_audience_not_monetization');
    expect(withAudienceBlocker.band).not.toBe('sales_priority');
  });

  it('lets Claude move the score, but only a little', () => {
    const base = scoreLead({ profile: { monthly_listeners: 5000 }, behavior: EMPTY_BEHAVIOR, claudeSignal: 0 });
    const maxed = scoreLead({ profile: { monthly_listeners: 5000 }, behavior: EMPTY_BEHAVIOR, claudeSignal: 20 });
    // 20 signal points become at most 10 score points. The model gets a vote, not a veto.
    expect(maxed.total - base.total).toBeLessThanOrEqual(10);
  });

  it('is explainable: every point is attributable to a named component', () => {
    const s = scoreLead({ profile: { monthly_listeners: 50_000 }, behavior: EMPTY_BEHAVIOR });
    const sum = Object.values(s.components).reduce((a, b) => a + b, 0);
    expect(Math.min(sum, 100)).toBe(s.total);
  });

  it('treats a booked call as a hard sales signal regardless of arithmetic', () => {
    const s = scoreLead({
      profile: {},
      behavior: { ...EMPTY_BEHAVIOR, bookedCall: true },
    });
    expect(s.band).toBe('sales_priority');
  });
});

// ---------------------------------------------------------------------------
describe('destination registry (Claude can never return a URL)', () => {
  it('sends an artist with unfinished setup to setup, not Rise Mode', () => {
    const route = resolveDestination({
      destinationId: 'rise_mode',
      isArtist: true,
      questEngineEnabled: true,
      setupComplete: false,
    });
    expect(route).toBe('/setup');
  });

  it('does NOT auto-enable the dark-launched Quest Engine', () => {
    const route = resolveDestination({
      destinationId: 'rise_mode',
      isArtist: true,
      questEngineEnabled: false,
      setupComplete: true,
    });
    expect(route).toBe('/profile/artist'); // the fallback, not Rise Mode
  });

  it('honors returnTo for Rise-Mode-launched flows (CLAUDE.md)', () => {
    const route = resolveDestination({
      destinationId: 'missions',
      isArtist: true,
      questEngineEnabled: true,
      setupComplete: true,
    });
    expect(route).toContain('returnTo=');
  });

  it('sends a non-artist to welcome, never into an artist route', () => {
    const route = resolveDestination({
      destinationId: 'rise_mode',
      isArtist: false,
      questEngineEnabled: true,
      setupComplete: true,
    });
    expect(route).toBe('/welcome');
  });

  it('falls back safely on an unknown destination id', () => {
    const route = resolveDestination({
      destinationId: 'not-a-real-destination',
      isArtist: true,
      questEngineEnabled: true,
      setupComplete: true,
    });
    expect(route).toBe('/profile/artist');
  });
});
