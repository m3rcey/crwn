import { describe, it, expect } from 'vitest';
import { resolveSessionKeyword } from './sessionKeyword';

describe('resolveSessionKeyword: the keyword a DM session is recorded under', () => {
  it('keeps a keyword that belongs to the tool that ran', () => {
    expect(resolveSessionKeyword('VAULT', 'vault-revenue-planner')).toEqual({ keyword: 'vault', mislabeled: false });
    expect(resolveSessionKeyword('WORTH', 'worth')).toEqual({ keyword: 'worth', mislabeled: false });
    expect(resolveSessionKeyword('demand', 'proof-of-demand-test-builder')).toEqual({ keyword: 'demand', mislabeled: false });
  });

  it('corrects the half-edited clone: VAULT flow reporting WORTH records vault', () => {
    // The exact 2026-09-25 production case: 21 vault sessions were stored as "WORTH".
    expect(resolveSessionKeyword('WORTH', 'vault-revenue-planner')).toEqual({ keyword: 'vault', mislabeled: true });
  });

  it('never guesses between several keywords: a multi-keyword tool gets null, not the wrong word', () => {
    expect(resolveSessionKeyword('WORTH', 'proof-of-demand-test-builder')).toEqual({ keyword: null, mislabeled: true });
  });

  it('leaves everything it cannot judge unchanged', () => {
    expect(resolveSessionKeyword(null, 'vault-revenue-planner')).toEqual({ keyword: null, mislabeled: false });
    expect(resolveSessionKeyword('banana', 'vault-revenue-planner')).toEqual({ keyword: 'banana', mislabeled: false });
    expect(resolveSessionKeyword('WORTH', 'not-a-tool')).toEqual({ keyword: 'worth', mislabeled: false });
    expect(resolveSessionKeyword('two words', 'vault-revenue-planner')).toEqual({ keyword: 'two words', mislabeled: false });
  });
});
