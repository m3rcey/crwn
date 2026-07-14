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
import { MAX_ATTEMPTS_PER_FIELD } from './orchestration';
import { getField } from './fieldRegistry';
import * as copy from '../emails/acquisitionFollowUp';
import { TRUST_RANK } from './types';
import { scoreLead, EMPTY_BEHAVIOR } from './leadScoring';
import { getTool, missingRequiredFields, ACQUISITION_TOOL_IDS } from './toolAdapters';
import { validateInbound, normalizeUsername, normalizeEmailLoose, type ManyChatInboundPayload } from '../manychat/schemas';
import { deriveIdempotencyKey } from '../manychat/idempotency';
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

  it('accepts a payload with NO event_id, because ManyChat cannot supply one', () => {
    // ManyChat's External Request field picker offers: First/Last/Full Name, Email, Phone,
    // Last Text Input, Subscribed, Contact Id, Last Reply Type, Full Contact Data.
    // No message id. No timestamp. Nothing unique per request. Requiring one was a design
    // bug that made the integration literally impossible to configure.
    const r = validateInbound({ ...good, event_id: undefined });
    expect(r.ok).toBe(true);
  });

  it('rejects an answer with no question_key rather than writing an orphan row', () => {
    const r = validateInbound({ ...good, question_key: undefined });
    expect(r.ok).toBe(false);
  });

  it('rejects an unknown event type', () => {
    expect(validateInbound({ ...good, event_type: 'drop_tables' }).ok).toBe(false);
  });

  it('REJECTS an unresolved ManyChat field placeholder as the contact id', () => {
    // The worst failure mode in the system, and it looks exactly like success. A pill that was
    // typed instead of inserted sends a literal string, which is a perfectly valid non-empty
    // string. Every lead on earth would then arrive with the SAME contact id, resolve to the
    // SAME identity, and overwrite each other's answers. One record for every artist. Silently.
    for (const fake of [
      '[Contact Id pill]',
      '{{contact_id}}',
      '<Contact Id>',
      'Contact Id',
      '[Contact Id]',
    ]) {
      const r = validateInbound({ ...good, manychat_contact_id: fake });
      expect(r.ok, `should have rejected: ${fake}`).toBe(false);
      expect((r as { code: string }).code).toBe('unresolved_contact_id_placeholder');
    }
  });

  it('still accepts a real ManyChat contact id (which is just a number)', () => {
    expect(validateInbound({ ...good, manychat_contact_id: '1234567890' }).ok).toBe(true);
  });

  it('accepts ManyChat\'s "+ Add Full Contact Data" shape, nested', () => {
    // ManyChat's Contact Id SYSTEM field pill does not substitute inside an External Request
    // body (it sends the literal string "Contact Id"). Its "+ Add Full Contact Data" button
    // does work. So CRWN reads the id out of the contact object instead of demanding a shape
    // ManyChat struggles to emit. The integration bends to the transport, not the reverse.
    const r = validateInbound({
      event_type: 'answer',
      question_key: 'monthly_listeners',
      answer: '40k',
      contact: { id: '987654321', username: '@Naya', email: 'naya@example.com' },
    });
    expect(r.ok).toBe(true);
    const v = (r as { value: { manychat_contact_id: string; instagram_username: string | null; email: string | null } }).value;
    expect(v.manychat_contact_id).toBe('987654321');
    expect(v.instagram_username).toBe('naya'); // normalized, @ stripped
    expect(v.email).toBe('naya@example.com');
  });

  it('reads a REAL ManyChat Full Contact Data payload correctly', () => {
    // This is a genuine payload captured from ManyChat, not a guess. The field names matter:
    // it is ig_username (not username), ig_id (a NUMBER, not a string), and last_input_text
    // carries what the artist actually typed.
    const r = validateInbound({
      event_type: 'answer',
      question_key: 'monthly_listeners',
      contact: {
        key: 'user:713072115',
        id: '713072115',
        status: 'active',
        first_name: 'M3rcey',
        name: 'M3rcey',
        ig_username: 'm3rcey',
        ig_id: 1416655297162108, // a NUMBER
        last_input_text: '40k',
        email: null,
        phone: null,
      },
    });

    expect(r.ok).toBe(true);
    const v = (r as { value: ManyChatInboundPayload }).value;
    expect(v.manychat_contact_id).toBe('713072115');
    expect(v.instagram_username).toBe('m3rcey');
    expect(v.instagram_user_id).toBe('1416655297162108'); // coerced from number
    // The answer comes free with the contact data. No extra pill, no custom field.
    expect(v.answer).toBe('40k');
  });

  it('accepts the full contact data SPREAD at the top level', () => {
    const r = validateInbound({
      event_type: 'session_start',
      id: '55555',
      username: 'someartist',
    });
    expect(r.ok).toBe(true);
    expect((r as { value: { manychat_contact_id: string } }).value.manychat_contact_id).toBe('55555');
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
describe('derived idempotency key (ManyChat gives us nothing unique)', () => {
  const base = {
    event_type: 'answer' as const,
    manychat_contact_id: 'c_1',
    question_key: 'monthly_listeners',
    answer: '40k',
    consent_dm: true,
    consent_email: false,
    consent_sms: false,
    custom_fields: {},
  };

  it('gives a RETRY of the same event the SAME key (so it dedupes)', () => {
    const t = 1_770_000_000_000;
    // A ManyChat retry lands within seconds. Same key, so CRWN replays its cached response
    // and does zero work.
    expect(deriveIdempotencyKey(base, t)).toBe(deriveIdempotencyKey(base, t + 3_000));
  });

  it('gives a DIFFERENT answer a DIFFERENT key (so it processes)', () => {
    const t = 1_770_000_000_000;
    const a = deriveIdempotencyKey({ ...base, answer: '40k' }, t);
    const b = deriveIdempotencyKey({ ...base, answer: '62k' }, t);
    expect(a).not.toBe(b);
  });

  it('gives a different QUESTION a different key', () => {
    const t = 1_770_000_000_000;
    const a = deriveIdempotencyKey({ ...base, question_key: 'monthly_listeners' }, t);
    const b = deriveIdempotencyKey({ ...base, question_key: 'social_followers' }, t);
    expect(a).not.toBe(b);
  });

  it('lets the artist RE-SEND the same text later and still be heard', () => {
    // This is the loop guard's lifeline. She types "honestly not many", it fails to parse,
    // we re-ask, and she types the SAME thing again. If that were deduped as a replay, the
    // attempt counter would never increment and she would never be escalated to a human.
    const t = 1_770_000_000_000;
    const first = deriveIdempotencyKey(base, t);
    const later = deriveIdempotencyKey(base, t + 90_000); // 90s later, new bucket
    expect(first).not.toBe(later);
  });

  it('NEVER keys on contact id alone (that would freeze every conversation)', () => {
    // The tempting shortcut. Every event from one artist would share a key, so her second
    // message would look like a replay of her first and the bot would repeat question one
    // forever. Silently. This test exists to make sure nobody ever "simplifies" it back.
    const t = 1_770_000_000_000;
    const q1 = deriveIdempotencyKey({ ...base, question_key: 'monthly_listeners', answer: '40k' }, t);
    const q2 = deriveIdempotencyKey({ ...base, question_key: 'primary_blocker', answer: 'nobody buys' }, t);
    expect(q1).not.toBe(q2);
    expect(q1).not.toContain('c_1'); // and no PII in the key, it is hashed
  });

  it('prefers a real ManyChat id if it ever gains one', () => {
    expect(deriveIdempotencyKey({ ...base, event_id: 'mc_real_id' })).toBe('mc_real_id');
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

  it('does not greet an anonymous lead by name (there is no name to greet)', () => {
    // The worth tool never asks for a name, so artist_name is undefined for a cold IG lead.
    // The headline used to render "You: about $3,892..." which reads like a failed mail merge.
    const anon = getTool('worth')!.execute({ monthly_listeners: 40_000 });
    expect(anon.headline).not.toContain('You:');
    expect(anon.headline).toMatch(/^About \$/);

    // Once we DO know the name (a returning, claimed artist), use it.
    const named = getTool('worth')!.execute({ monthly_listeners: 40_000, artist_name: 'Naya' });
    expect(named.headline).toMatch(/^Naya, about \$/);
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
describe('the unparseable-answer loop (regression: the bot used to ask forever)', () => {
  it('cannot parse a vague answer, which is what triggers the escalation path', () => {
    // These are the answers a real artist actually types, and none of them resolve. Before
    // the loop guard, each one made CRWN re-ask the identical question forever.
    expect(normalizeDeterministic('monthly_listeners', 'honestly not that many')).toBeNull();
    expect(normalizeDeterministic('monthly_listeners', 'no idea lol')).toBeNull();
    expect(normalizeDeterministic('monthly_listeners', 'a decent amount')).toBeNull();
  });

  it('gives every field an artist is likely to fumble a concrete retry hint', () => {
    // The re-ask must not repeat the question verbatim. A hint with a real example is what
    // converts the second attempt.
    for (const key of ['monthly_listeners', 'social_followers', 'email_list_size', 'catalog_size']) {
      const def = getField(key)!;
      expect(def.retryHint, `${key} has no retryHint`).toBeTruthy();
      expect(def.retryHint).not.toBe(def.question);
    }
  });

  it('escalates to human review rather than looping (the state machine allows the exit)', () => {
    // needsHumanReview overrides everything, from any collecting state. That is the exit the
    // loop guard uses on the third failed attempt.
    const s = nextState('collecting_required_metrics', {
      missingRequiredFields: ['monthly_listeners'],
      hasConsent: true,
      hasResult: false,
      hasVerifiedEmail: false,
      isClaimed: false,
      needsHumanReview: true,
    });
    expect(s).toBe('human_review');
    expect(canTransition('collecting_required_metrics', 'human_review')).toBe(true);
  });

  it('caps attempts at 3', () => {
    expect(MAX_ATTEMPTS_PER_FIELD).toBe(3);
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

    // audience 20 + reachWithoutOwnership 15 + alignment 15 + behavior 4 = 54
    expect(s.total).toBe(54);
    expect(s.components).toMatchObject({
      audience: 20,
      reachWithoutOwnership: 15,
      alignment: 15,
      fanOwnership: 0,
    });
  });

  it('does NOT file a big-reach engaged lead as "unqualified" (regression)', () => {
    // The FIRST real lead through the live funnel: 100,000 monthly listeners, no email list,
    // opened her result, edited the assumptions. CRWN scored her 20 and filed her as
    // "unqualified", so no alert fired and no follow-up was queued.
    //
    // Two bugs caused it. The orchestrator passed EMPTY_BEHAVIOR, so nothing she DID ever
    // counted. And reach-without-ownership, which is CRWN's entire thesis, was worth zero
    // points: the reason code fired and no score came with it.
    //
    // The worth funnel asks ONE question, so it can never learn goal or blocker. It must
    // still be able to recognise a hot lead from reach + behavior alone.
    const s = scoreLead({
      profile: { monthly_listeners: 100_000 }, // one question. That is all this funnel asks.
      behavior: { ...EMPTY_BEHAVIOR, resultViewed: true, resultRecalculated: true },
    });

    expect(s.reasonCodes).toContain('reach_without_ownership');
    expect(s.reasonCodes).toContain('engaged_with_result');
    expect(s.band).not.toBe('unqualified');
    // audience 20 + reachWithoutOwnership 15 + behavior 8 (viewed 4 + recalculated 4) = 43
    expect(s.total).toBe(43);
  });

  it('the CRWN thesis is worth points, not just a reason code', () => {
    const big = scoreLead({ profile: { monthly_listeners: 100_000, email_list_size: 0 }, behavior: EMPTY_BEHAVIOR });
    const owned = scoreLead({ profile: { monthly_listeners: 100_000, email_list_size: 5_000 }, behavior: EMPTY_BEHAVIOR });

    // Big reach with NO way to reach them is exactly who CRWN is for.
    expect(big.components.reachWithoutOwnership).toBe(15);
    // An artist who already owns their list has a different (still good) problem.
    expect(owned.components.reachWithoutOwnership).toBe(0);
    expect(owned.components.fanOwnership).toBe(20);
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
describe('follow-up copy (CLAUDE.md: loss-framed, and never an em dash)', () => {
  const all = [
    copy.resultNotViewed({ headline: 'About $3,892 a month', resultUrl: 'https://thecrwn.app/x' }),
    copy.resultViewedNotClaimed({ resultUrl: 'https://thecrwn.app/x' }),
    copy.sessionAbandoned(),
  ];

  it('never uses an em dash or an en dash, anywhere', () => {
    // The rule is absolute: UI, email, DM, subject lines, buttons. All of it.
    for (const c of all) {
      expect(c.dm).not.toMatch(/[—–]/);
      expect(c.subject).not.toMatch(/[—–]/);
      expect(c.html).not.toMatch(/[—–]/);
    }
    const alert = copy.highIntentAlert({ score: 80, band: 'sales_priority', instagramUsername: 'x', reasonCodes: [] });
    expect(alert.subject).not.toMatch(/[—–]/);
    expect(alert.html).not.toMatch(/[—–]/);
  });

  it('leads with the loss, not the gain', () => {
    // Gain-framed copy ("here is what you could earn!") is ignorable. Loss-framed copy names
    // the cost of doing nothing. Every follow-up must talk about what is being lost.
    const lossWords = /leaving|losing|lose|not earning|goes to a platform|not collecting|none of it reaches you|still have not|does not change/i;
    for (const c of all) {
      expect(c.dm + c.subject + c.html).toMatch(lossWords);
    }
  });

  it('always carries a working link in the DM', () => {
    expect(all[0].dm).toContain('https://');
    expect(all[1].dm).toContain('https://');
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
