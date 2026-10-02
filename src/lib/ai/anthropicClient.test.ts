import { describe, expect, it } from 'vitest';
import { APIConnectionError, APIConnectionTimeoutError } from '@anthropic-ai/sdk';
import { ANTHROPIC_MODEL, DECISION_TIMEOUT_MS, decisionRequestOptions } from './anthropicClient';
import { categorize } from '../acquisition/claudeDecisionService';

describe('decision model defaults', () => {
  it('defaults to Haiku 4.5 with a timeout inside the ManyChat budget', () => {
    if (!process.env.ANTHROPIC_MODEL) expect(ANTHROPIC_MODEL).toBe('claude-haiku-4-5');
    if (!process.env.ANTHROPIC_DECISION_TIMEOUT_MS) expect(DECISION_TIMEOUT_MS).toBeLessThanOrEqual(4500);
  });
});

describe('decisionRequestOptions', () => {
  it('omits effort on Haiku 4.5 and Sonnet 4.5, which reject it with a 400', () => {
    expect(decisionRequestOptions('claude-haiku-4-5')).toEqual({});
    expect(decisionRequestOptions('claude-sonnet-4-5')).toEqual({});
  });

  it('disables thinking on Sonnet 5 and Opus 5, where omitting it runs adaptive thinking', () => {
    for (const m of ['claude-sonnet-5', 'claude-opus-5']) {
      expect(decisionRequestOptions(m)).toEqual({ output_config: { effort: 'low' }, thinking: { type: 'disabled' } });
    }
  });

  it('keeps low effort and no thinking param on the Opus 4.x line', () => {
    expect(decisionRequestOptions('claude-opus-4-8')).toEqual({ output_config: { effort: 'low' } });
    expect(decisionRequestOptions('claude-opus-4-8').thinking).toBeUndefined();
  });

  it('does not treat Opus 5.5 as Opus 5', () => {
    expect(decisionRequestOptions('claude-opus-5-5').thinking).toBeUndefined();
  });
});

describe('categorize (provider errors)', () => {
  const err = (status: number, message: string) => Object.assign(new Error(message), { status });

  it('names the billing cause without copying the message', () => {
    const c = categorize(err(400, '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}'));
    expect(c).toBe('http_400:billing');
  });

  it('names model and parameter causes', () => {
    expect(categorize(err(404, 'not_found_error'))).toBe('http_404:model');
    expect(categorize(err(400, 'output_config.effort: not supported on this model'))).toBe('http_400:params');
    expect(categorize(err(400, 'tool_choice: type "tool" and "any" are not supported for this model.'))).toBe('http_400:tool_choice');
  });

  it('keeps the old categories and never returns message text', () => {
    expect(categorize(err(429, 'slow down'))).toBe('rate_limit');
    expect(categorize(err(401, 'bad key'))).toBe('auth');
    expect(categorize(err(503, 'overloaded'))).toBe('provider_5xx');
    const c = categorize(err(400, 'something about the artist: I have 40k listeners'));
    expect(c).toBe('http_400');
    expect(categorize(Object.assign(new Error('x'), { name: 'APITimeoutError' }))).toBe('timeout');
  });

  it('labels the SDK timeout as timeout, not unknown (its name is plain "Error")', () => {
    expect(categorize(new APIConnectionTimeoutError())).toBe('timeout');
    expect(categorize(new APIConnectionError({ message: 'socket hang up' }))).toBe('connection');
  });
});
