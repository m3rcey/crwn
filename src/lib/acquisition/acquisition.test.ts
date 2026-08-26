// Tests for the acquisition engine's pure services.
//
// These cover the code paths where a bug is SILENT: a prompt injection that lands, a guess
// that overwrites a fact, an illegal state transition that corrupts a session, a token that
// validates when it should not. A bug in any of these produces no error and no crash, just a
// wrong answer shown to an artist as fact. That is what earns a test.

import { beforeEach, describe, expect, it } from 'vitest';
import { createHmac } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

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
import { LEAD_MAGNET_BY_SLUG } from '@/lib/leadMagnets/registry';
import { validateInbound, normalizeUsername, normalizeEmailLoose, type ManyChatInboundPayload } from '../manychat/schemas';
import { deriveIdempotencyKey } from '../manychat/idempotency';
import { verifyManyChatRequest } from '../manychat/verifyWebhook';
import { hashToken, mintToken, isExpired } from '../leadResults/resultToken';
import { DESTINATION_IDS, resolveDestination } from '../quests/destinationRegistry';
import { parseCalBooking, verifyCalcomRequest } from '../calcom/verifyWebhook';

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
  it('registers every tool (the original five plus the later batches)', () => {
    // Grew from the original 5 to the full inventory (19 LeadMagnetConfig tools + worth).
    // 2026-08-03: +2 sub-avatar calculators (fan-stack, between-tour), see docs/SUB_AVATARS.md.
    expect(ACQUISITION_TOOL_IDS).toHaveLength(20);
    expect(ACQUISITION_TOOL_IDS).toContain('worth');
    expect(ACQUISITION_TOOL_IDS).toContain('opportunity-calculator');
    expect(ACQUISITION_TOOL_IDS).toContain('vault-revenue-planner');
    expect(ACQUISITION_TOOL_IDS).toContain('proof-of-demand-test-builder');
    expect(ACQUISITION_TOOL_IDS).toContain('fan-mission-generator');
    expect(ACQUISITION_TOOL_IDS).toContain('clip-to-earn-campaign-planner');
    expect(ACQUISITION_TOOL_IDS).toContain('fan-stack-calculator');
    expect(ACQUISITION_TOOL_IDS).toContain('between-tour-calculator');
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
    // The tool's own field, then the proof question every tool ends on (see the
    // "the DM asks the proof question" suite for why it is required and why it is last).
    expect(missingRequiredFields(worth, {})).toEqual(['monthly_listeners', 'monetization_status']);
    expect(missingRequiredFields(worth, { monthly_listeners: 1000 })).toEqual(['monetization_status']);
    expect(
      missingRequiredFields(worth, { monthly_listeners: 1000, monetization_status: 'direct_some' }),
    ).toEqual([]);
  });

  it('runs every tool without throwing on an empty profile', () => {
    // A DM lead may reach a tool with almost nothing filled in. No adapter may explode.
    for (const id of ACQUISITION_TOOL_IDS) {
      expect(() => getTool(id)!.execute({})).not.toThrow();
    }
  });
});

// Z2B-2. This tool used to require a goal and a blocker in free text and then ignore both, so every
// artist got an identical "Execution leakage 68/100" and "8 to 16 weeks lost". CRWN models neither,
// so the questions and the fabricated figures are gone and the result says plainly that it is the
// same for everyone.
describe('Quest Path is honestly static (no fake personalization, no unsupported numbers)', () => {
  const questPath = () => getTool('artist-quest-path')!;

  it('asks the web visitor nothing at all', () => {
    const cfg = LEAD_MAGNET_BY_SLUG['artist-quest-path'];
    expect(cfg.inputs).toEqual([]);
    // ...and leaves behind no wizard step that would render as a blank screen.
    expect(cfg.wizardSteps.map((s) => s.id)).toEqual(['review']);
  });

  it('renders no score gauge, because nothing about the artist is measured', () => {
    const r = questPath().execute({});
    expect(r.sections.find((s) => s.kind === 'score')).toBeUndefined();
  });

  it('states no number of weeks, months or missing foundations', () => {
    const r = questPath().execute({});
    const text = JSON.stringify(r);
    expect(text).not.toMatch(/8 to 16|2 to 4 months|Execution leakage/);
    // No bare week/month counts anywhere in the result.
    expect(text).not.toMatch(/\d+\s*(wks|weeks)\b/i);
  });

  it('is identical whatever the profile says, and says so in its own assumptions', () => {
    const blank = questPath().execute({});
    const full = questPath().execute({ primary_goal: 'replace_day_job', primary_blocker: 'no_audience' });
    expect(full).toEqual(blank);
    const assumptions = blank.sections.find((s) => s.kind === 'assumptions')?.items ?? [];
    expect(assumptions.join(' ').toLowerCase()).toContain('not a diagnosis of your career');
  });

  it('stamps its own version so its analytics are not pooled with the shared loss engine', () => {
    expect(questPath().formulaVersion).toBe('questPath@1');
    expect(questPath().execute({}).generatorVersion).toBe('questPath@1');
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
  it('scores the avatar Tier 1 lead as a sales priority: real reach AND proof they sell', () => {
    // docs/ICP.md, verbatim: "These are the artists I'd build the company around." Real audience,
    // and they have already convinced fans to pay them outside of streaming.
    const s = scoreLead({
      profile: {
        monthly_listeners: 300_000,
        social_followers: 1_200_000,
        monetization_status: 'direct_established',
        song_count: 60,
        team_status: 'management',
        primary_goal: 'scale_existing_revenue',
        primary_blocker: 'platform_dependency',
      },
      behavior: { ...EMPTY_BEHAVIOR, resultViewed: true },
    });
    expect(s.reasonCodes).toContain('direct_monetization_proven');
    expect(s.reasonCodes).toContain('tier1_audience');
    expect(s.reasonCodes).toContain('deep_catalog');
    expect(s.band).toBe('sales_priority');
    expect(s.components).toMatchObject({ monetization: 40, audience: 25, catalog: 15 });
  });

  it('reach with NO evidence of a single direct sale is a red flag, not the thesis', () => {
    // v1.0.0 paid 15 points for exactly this profile. The avatar calls it a red flag: "huge
    // streaming numbers but almost no social engagement", "no evidence they've ever tried to
    // sell anything". Same inputs, opposite sign.
    const unproven = scoreLead({
      profile: { monthly_listeners: 120_000, monetization_status: 'streaming_only' },
      behavior: EMPTY_BEHAVIOR,
    });
    const proven = scoreLead({
      profile: { monthly_listeners: 120_000, monetization_status: 'direct_some' },
      behavior: EMPTY_BEHAVIOR,
    });

    expect(unproven.reasonCodes).toContain('reach_without_proof');
    expect(unproven.components.reachPenalty).toBe(-12);
    expect(proven.components.reachPenalty).toBe(0);
    // Proof is worth more than reach. That is the whole avatar in one assertion.
    expect(proven.total).toBeGreaterThan(unproven.total);
  });

  it('does NOT file a big-reach engaged lead as "unqualified" (regression)', () => {
    // The first real lead through the live funnel: 100,000 monthly listeners, opened her result,
    // edited the assumptions, and CRWN filed her as "unqualified" so no alert ever fired.
    //
    // She answered the audience question and nothing else, which is what a lead who drops out
    // before the proof question looks like: no goal, no blocker, no sales history. CRWN must
    // still recognise a warm lead from reach + behavior alone, WITHOUT promoting her to sales
    // priority on a single data point.
    const s = scoreLead({
      profile: { monthly_listeners: 100_000 }, // the audience answer, and nothing after it.
      behavior: { ...EMPTY_BEHAVIOR, resultViewed: true, resultRecalculated: true },
    });

    expect(s.reasonCodes).toContain('engaged_with_result');
    expect(s.reasonCodes).toContain('monetization_unknown');
    expect(s.band).not.toBe('unqualified');
    expect(s.band).not.toBe('sales_priority');
  });

  it('caps the fit of a lead we never asked the monetization question', () => {
    // One known dimension used to mean a perfect fit, because the prorated denominator only
    // counted what we knew. Unknown is not the same as good.
    const s = scoreLead({ profile: { monthly_listeners: 500_000 }, behavior: EMPTY_BEHAVIOR });
    expect(s.components.fit).toBe(60);
    expect(s.reasonCodes).toContain('monetization_unknown');
  });

  it('never spends sales time below the ICP floor', () => {
    // Under 50k followers and under 20k listeners. They can succeed on CRWN; the problem is
    // acquisition economics, so they nurture and never reach a human.
    const s = scoreLead({
      profile: { monthly_listeners: 4_000, monetization_status: 'direct_established', song_count: 60 },
      behavior: { ...EMPTY_BEHAVIOR, resultViewed: true, resultRecalculated: true, accountClaimed: true },
    });
    expect(s.reasonCodes).toContain('below_icp_floor');
    expect(s.band).toBe('nurture');
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
    const s = scoreLead({
      profile: { monthly_listeners: 50_000, monetization_status: 'direct_some', song_count: 30 },
      behavior: { ...EMPTY_BEHAVIOR, resultViewed: true },
      claudeSignal: 10,
    });
    // The four avatar dimensions roll up into `fit`, which carries 70 of the 100 points; the
    // rest is what she did, how well her goal matches, and Claude's bounded vote. Every one of
    // those is a named component, so the total is reproducible from the stored row.
    const c = s.components;
    const rebuilt = Math.round(c.fit * 0.7) + c.behavior + c.alignment + c.aiSignal + c.reachPenalty;
    expect(Math.min(Math.max(rebuilt, 0), 100)).toBe(s.total);
    for (const key of ['monetization', 'audience', 'engagement', 'catalog', 'fit', 'behavior', 'alignment', 'aiSignal', 'reachPenalty']) {
      expect(typeof c[key], `${key} missing from components`).toBe('number');
    }
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
describe('follow-up copy', () => {
  const all = [
    copy.resultNotViewed({ headline: 'About $3,892 a month', resultUrl: 'https://thecrwn.app/x' }),
    copy.resultViewedNotClaimed({ resultUrl: 'https://thecrwn.app/x' }),
    copy.sessionAbandoned(),
    copy.personalNudge({ amount: '$3,892' }),
    copy.offerCall({ bookingUrl: 'https://cal.com/x', resultUrl: 'https://thecrwn.app/x' }),
    copy.callBooked(),
    copy.callNoShow({ bookingUrl: 'https://cal.com/x' }),
    copy.callNoShowSecond({ bookingUrl: 'https://cal.com/x', amount: '$3,892' }),
    copy.callNoShowFinal({ bookingUrl: 'https://cal.com/x' }),
  ];

  it('EVERY DM ends with a question', () => {
    // Not a style rule. INFRASTRUCTURE.
    //
    // Meta's messaging window reopens every time she REPLIES. A DM ending in a link she
    // ignores lets the 24-hour window close, and once it closes CRWN can never message her
    // again. A DM ending in a question she answers buys another 24 hours.
    //
    // The question is what keeps the channel alive. A follow-up without one is a dead end
    // dressed as outreach.
    for (const c of all) {
      const lastLine = c.dm.trim().split('\n').filter(Boolean).pop() ?? '';
      expect(lastLine.trim().endsWith('?'), `DM does not end with a question:\n"${lastLine}"`).toBe(true);
    }
  });

  it('every EMAIL asks a question too', () => {
    for (const c of all) {
      expect(c.html, `email has no question: ${c.subject}`).toMatch(/\?/);
    }
  });

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

  it('never uses masculine-coded slang (most CRWN artists are women)', () => {
    // The funnel this was modelled on opens with "Hey mate!" and "Yo bro". That voice is
    // wrong for this audience and it will read as written-for-someone-else.
    const bro = /\b(bro|bruv|mate|my guy|dude|man)\b/i;
    for (const c of all) {
      expect(c.dm, `masculine slang in DM: ${c.subject}`).not.toMatch(bro);
      expect(c.html, `masculine slang in email: ${c.subject}`).not.toMatch(bro);
    }
  });

  it('never claims to be hand-typed when it is automated', () => {
    // The reference funnel says "Non automated Niall so you can reply haha" while being
    // automated. That is a lie, and CRWN's entire pitch is that artists finally get dealt
    // with straight. "You can reply to this, I read them" is TRUE and does the same job.
    const lie = /non.?automated|not automated|typed this myself|hand.?written/i;
    for (const c of all) {
      expect(c.dm, `claims to be non-automated: ${c.subject}`).not.toMatch(lie);
    }
    // The personal nudge still invites a reply, honestly.
    expect(copy.personalNudge({ amount: null }).dm).toMatch(/you can reply/i);
  });

  it('leads with the loss, not the gain (on messages that are PERSUADING)', () => {
    // Gain-framed copy ("here is what you could earn!") is ignorable. Loss-framed copy names
    // the cost of doing nothing.
    //
    // But this applies to messages trying to MOVE an inactive lead. A booking confirmation is
    // not persuasion: she already said yes, and loss-framing someone who just converted is
    // tone-deaf. Its job is to make the call useful, not to sell one.
    const persuading = [
      copy.resultNotViewed({ headline: 'About $3,892 a month', resultUrl: 'https://thecrwn.app/x' }),
      copy.resultViewedNotClaimed({ resultUrl: 'https://thecrwn.app/x' }),
      copy.sessionAbandoned(),
      copy.personalNudge({ amount: '$3,892' }),
      copy.offerCall({ bookingUrl: 'https://cal.com/x', resultUrl: 'https://thecrwn.app/x' }),
      copy.callNoShow({ bookingUrl: 'https://cal.com/x' }),
      copy.callNoShowSecond({ bookingUrl: 'https://cal.com/x', amount: '$3,892' }),
    ];

    // A loose net on purpose. It is a smoke alarm for gain-framed copy sneaking in ("here is
    // what you could earn!"), not a style grader. Every phrase here names a COST of doing
    // nothing: money going elsewhere, time passing, the thing still not done.
    const lossWords =
      /leaving|losing|lose|not earning|goes to a platform|not collecting|none of it reaches you|still have not|does not change|does not reach you|one answer short|sits there undone|missed you|somewhere else|sitting there|still sitting|no closer|someone who is not you|never get paid/i;
    for (const c of persuading) {
      expect(c.dm + c.subject + c.html, `not loss-framed: ${c.subject}`).toMatch(lossWords);
    }
  });

  it('the no-show ladder gets LIGHTER, never heavier', () => {
    // The instinct is to escalate: each ignored message earns a firmer one. That is exactly
    // backwards. She did not turn up because she is busy, embarrassed, or unsure, and guilt
    // converts none of those. It just confirms that dealing with CRWN feels like work.
    //
    // So: no guilt words, ever, and the last one gives her a clean way out.
    const guilt = /you (missed|blew|wasted|didn't bother)|waiting for you|i (waited|sat there)|no.?show|disrespect|rude|second chance|last chance|final (warning|notice)/i;

    for (const c of [
      copy.callNoShow({ bookingUrl: 'https://cal.com/x' }),
      copy.callNoShowSecond({ bookingUrl: 'https://cal.com/x', amount: '$3,892' }),
      copy.callNoShowFinal({ bookingUrl: 'https://cal.com/x' }),
    ]) {
      expect(c.dm, `guilt-trips a no-show: ${c.subject}`).not.toMatch(guilt);
    }

    // The breakup must offer a real exit, not a fake one. "Want me to stop?" with no way to
    // stop is worse than not asking.
    const final = copy.callNoShowFinal({ bookingUrl: 'https://cal.com/x' });
    expect(final.dm).toMatch(/take you off|keep you on|stop|leave you/i);
  });

  it('carries a working link where one is needed', () => {
    expect(all[0].dm).toContain('https://');
    expect(all[1].dm).toContain('https://');
    // offerCall must give BOTH paths and let her choose.
    expect(all[4].dm).toContain('https://thecrwn.app/x');
    expect(all[4].dm).toContain('https://cal.com/x');
  });
});

// ---------------------------------------------------------------------------
describe('Cal.com webhook (the thing that stops a booked artist being nurtured)', () => {
  const SECRET = 'cal_test_secret_value';

  function sign(body: string, secret = SECRET): string {
    return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  }

  beforeEach(() => {
    process.env.CALCOM_WEBHOOK_SECRET = SECRET;
  });

  it('FAILS CLOSED when the secret is not configured', () => {
    delete process.env.CALCOM_WEBHOOK_SECRET;
    const body = '{"triggerEvent":"BOOKING_CREATED"}';
    // Even a correctly signed request is rejected. An unconfigured deployment must reject
    // everything, never accept everything: a forged booking silently cancels a lead's entire
    // nurture sequence.
    expect(verifyCalcomRequest(body, sign(body)).ok).toBe(false);
    expect(verifyCalcomRequest(body, sign(body)).reason).toBe('not_configured');
  });

  it('accepts a correct signature and rejects a forged one', () => {
    const body = '{"triggerEvent":"BOOKING_CREATED","payload":{"uid":"abc"}}';
    expect(verifyCalcomRequest(body, sign(body)).ok).toBe(true);
    expect(verifyCalcomRequest(body, sign(body, 'wrong_secret')).ok).toBe(false);
    expect(verifyCalcomRequest(body, null).reason).toBe('missing_signature');
  });

  it('rejects a replay with a TAMPERED body', () => {
    // The whole point of HMAC over a bearer secret: capturing a real request does not let you
    // change who it is about.
    const real = '{"triggerEvent":"BOOKING_CREATED","payload":{"uid":"abc"}}';
    const tampered = '{"triggerEvent":"BOOKING_CREATED","payload":{"uid":"xyz"}}';
    expect(verifyCalcomRequest(tampered, sign(real)).ok).toBe(false);
  });

  it('does not throw on a signature of the wrong length', () => {
    // timingSafeEqual throws on a length mismatch, and that throw is itself an oracle.
    const body = '{"triggerEvent":"BOOKING_CREATED"}';
    expect(() => verifyCalcomRequest(body, 'short')).not.toThrow();
    expect(verifyCalcomRequest(body, 'short').ok).toBe(false);
  });

  it('finds the lead id in metadata, which is where the booking link puts it', () => {
    const id = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    const booking = parseCalBooking({
      triggerEvent: 'BOOKING_CREATED',
      payload: {
        uid: 'bk_1',
        startTime: '2026-07-20T15:00:00Z',
        metadata: { crwn: id },
        attendees: [{ email: 'Her@Example.com', name: 'Her' }],
      },
    });

    expect(booking?.leadIdentityId).toBe(id);
    expect(booking?.attendeeEmail).toBe('her@example.com'); // lowercased, or the join misses
    expect(booking?.triggerEvent).toBe('BOOKING_CREATED');
  });

  it('still finds the lead id when Cal.com moves it somewhere else', () => {
    // Cal.com shuffles custom values between metadata, responses and bookingFieldsResponses
    // across versions. The ManyChat integration taught this lesson expensively: bend to what
    // the other system ACTUALLY sends.
    const id = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    const inResponses = parseCalBooking({
      triggerEvent: 'BOOKING_CREATED',
      payload: { responses: { crwn: { value: id } }, attendees: [] },
    });
    expect(inResponses?.leadIdentityId).toBe(id);

    const inDescription = parseCalBooking({
      triggerEvent: 'BOOKING_CREATED',
      payload: { description: `ref ${id}`, attendees: [] },
    });
    expect(inDescription?.leadIdentityId).toBe(id);
  });

  it('returns null rather than guessing when there is no lead id', () => {
    // A booking with no id is not an error, it is an UNATTRIBUTED booking (someone found the
    // cal.com link on the site). The route records it for Josh instead of attaching it to a
    // random lead.
    const booking = parseCalBooking({
      triggerEvent: 'BOOKING_CREATED',
      payload: { uid: 'bk_2', attendees: [{ email: 'a@b.com' }] },
    });
    expect(booking?.leadIdentityId).toBe(null);
    expect(booking?.uid).toBe('bk_2');
  });

  it('rejects a payload that is not a Cal.com webhook at all', () => {
    expect(parseCalBooking({ hello: 'world' })).toBe(null);
    expect(parseCalBooking(null)).toBe(null);
    expect(parseCalBooking('BOOKING_CREATED')).toBe(null);
  });

  it('reads a no-show that a HUMAN marked, and never infers one', () => {
    // BOOKING_NO_SHOW_UPDATED is Josh's verdict relayed through Cal.com. It is the only thing
    // allowed to start the ladder.
    const marked = parseCalBooking({
      triggerEvent: 'BOOKING_NO_SHOW_UPDATED',
      payload: { bookingUid: 'bk_1', attendees: [{ email: 'a@b.com', noShow: true }] },
    });
    expect(marked?.noShow).toBe(true);
    expect(marked?.uid).toBe('bk_1'); // no-show payloads say `bookingUid`, not `uid`

    // Un-ticked: she DID attend. This is the undo, and it must be distinguishable from "no
    // information", which is why it is a tri-state and not a boolean.
    const unmarked = parseCalBooking({
      triggerEvent: 'BOOKING_NO_SHOW_UPDATED',
      payload: { bookingUid: 'bk_1', attendees: [{ email: 'a@b.com', noShow: false }] },
    });
    expect(unmarked?.noShow).toBe(false);
  });

  it('treats a MISSING no-show flag as null, never as a no-show', () => {
    // The catastrophic default. If an absent flag read as `true`, every booking created would
    // fire "sorry we missed you" at an artist who has not even had the call yet.
    const created = parseCalBooking({
      triggerEvent: 'BOOKING_CREATED',
      payload: { uid: 'bk_1', attendees: [{ email: 'a@b.com' }] },
    });
    expect(created?.noShow).toBe(null);
  });

  it('ignores noShowHost: that flag means JOSH missed the call', () => {
    // DMing an artist "sorry we missed you" because the founder did not turn up would be
    // spectacular, and it is one typo away.
    const hostMissed = parseCalBooking({
      triggerEvent: 'BOOKING_NO_SHOW_UPDATED',
      payload: { bookingUid: 'bk_1', attendees: [{ email: 'a@b.com', noShowHost: true }] },
    });
    expect(hostMissed?.noShow).toBe(null);
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

  it('sends a non-artist to the setup wizard, never into an artist route', () => {
    const route = resolveDestination({
      destinationId: 'rise_mode',
      isArtist: false,
      questEngineEnabled: true,
      setupComplete: true,
    });
    expect(route).toBe('/setup');
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

// After the audience question the DM must ask whether these fans have ever paid them. That answer
// is 40% of the ICP score and the only thing standing between a DM lead and `sales_priority`, the
// band that alerts the founder and the band a call request has to reach. Before this, every DM
// tool stopped at a follower count, so the highest-intent channel produced unqualifiable leads.
describe('the DM asks the proof question', () => {
  it('every acquisition tool requires monetization_status, and asks it LAST', () => {
    for (const id of ACQUISITION_TOOL_IDS) {
      const tool = getTool(id)!;
      expect(tool.requiredFields, id).toContain('monetization_status');
      // Last, because the ManyChat openers hand-duplicate question ONE. Reordering these
      // desyncs every live flow's opening message.
      expect(tool.requiredFields[tool.requiredFields.length - 1], id).toBe('monetization_status');
    }
  });

  it('has question copy, so the DM does not fall through to "Tell me a bit more."', () => {
    const def = getField('monetization_status')!;
    expect(def.question).toBeTruthy();
    expect(def.retryHint).toBeTruthy();
    expect(def.question).not.toMatch(/[—–]/);
    expect(def.retryHint).not.toMatch(/[—–]/);
  });

  it('reads a real typed answer with no model call', () => {
    const cases: [string, string][] = [
      ['yeah, patreon every month', 'direct_established'],
      ['I run a membership', 'direct_some'],
      ['just merch at shows', 'merch_only'],
      ['nah, only streaming so far', 'streaming_only'],
      ['no', 'none'],
      ['not yet', 'none'],
      ['a few times', 'direct_some'],
      ['yes', 'direct_some'],
      ['direct_established', 'direct_established'],
    ];
    for (const [raw, expected] of cases) {
      expect(normalizeDeterministic('monetization_status', raw), raw).toBe(expected);
    }
  });

  it('still returns null on a genuinely unreadable answer, so the retry hint fires', () => {
    expect(normalizeDeterministic('monetization_status', 'idk man')).toBeNull();
  });
});

// Josh, 2026-08-26, the day after the proof question shipped: "some of these manychat flows says
// to the user it will only ask one question but proceeds to ask the second. (example: OWN flow)".
//
// The opener lives in ManyChat, where no test can reach it, so what IS testable is the thing Josh
// copies openers out of. A guide that hands him "One question and you'll see..." rebuilds the same
// contradiction on the next flow he clones.
describe('nothing CRWN writes promises a question count', () => {
  const guide = readFileSync(join(process.cwd(), 'docs/acquisition/manychat-setup-guide.md'), 'utf-8');

  it('the setup guide never hands Josh opener copy that counts the questions', () => {
    // Scoped to quoted example copy, so the guide can still DISCUSS counts in prose (it must:
    // §12 exists to explain that every tool now asks two). The rule box states the rule with
    // BACKTICKS for exactly this reason.
    //
    // Whitespace is collapsed FIRST because markdown wraps: the guide's example openers run
    // across two source lines, and a line-anchored scan silently passed every one of them. That
    // hole was found by mutation-testing this assertion, not by reading it.
    const flat = guide.replace(/\s+/g, ' ');
    const quoted = flat.match(/"[^"]{10,300}"/g) ?? [];
    const counting = quoted.filter((q) => /\b(one|two|1|2)\s+(quick\s+)?questions?\b/i.test(q));
    expect(counting, `opener copy that states a count:\n${counting.join('\n')}`).toEqual([]);
  });

  it('the guide states the rule, so it is not just absent by luck', () => {
    expect(guide).toContain('THE OPENER NEVER STATES A QUESTION COUNT');
  });

  it('the abandonment chase asks HER question, on HER tool', () => {
    const own = copy.sessionAbandoned({
      question: 'Have your fans ever paid you directly?',
      toolUrl: 'https://thecrwn.app/tools/own-your-fans-calculator',
    });
    expect(own.dm).toContain('Have your fans ever paid you directly?');
    expect(own.html).toContain('https://thecrwn.app/tools/own-your-fans-calculator');
    // The Worth question is no longer baked into copy every tool shares.
    expect(own.dm).not.toContain('monthly listeners');
    expect(own.html).not.toContain('monthly listeners');
  });

  it('and never claims how many answers were left', () => {
    const c = copy.sessionAbandoned();
    for (const text of [c.dm, c.subject, c.html]) {
      expect(text).not.toMatch(/\bone (answer|question)\b/i);
    }
    // Rule 1 of this module: every DM still ends on a question, or the 24-hour window closes.
    expect(c.dm.trim().endsWith('?')).toBe(true);
  });
});
