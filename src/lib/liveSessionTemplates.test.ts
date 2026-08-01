// Live-session templates: prefills only, and the free-to-paid progression the
// spec trains fans through must survive edits to the catalog.

import { describe, expect, it } from 'vitest';
import { LIVE_SESSION_TEMPLATES, audienceTierIds, liveTemplate } from './liveSessionTemplates';

describe('LIVE_SESSION_TEMPLATES', () => {
  it('has unique keys', () => {
    const keys = LIVE_SESSION_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps at least one FREE template: the progression starts free', () => {
    expect(LIVE_SESSION_TEMPLATES.some((t) => t.audience === 'everyone')).toBe(true);
  });

  it('the Executive Producer template is small-room, top-tier, and submission-wired', () => {
    const ep = liveTemplate('executive_producer')!;
    expect(ep.audience).toBe('top');
    expect(ep.producerSession).toBe(true);
    expect(ep.maxSlots).not.toBeNull();
    expect(ep.maxSlots!).toBeLessThanOrEqual(25);
    expect(ep.submissionPrompt!.length).toBeGreaterThan(10);
  });

  it('never promises ownership, royalties, or producer credit', () => {
    // The spec is explicit: "Executive Producer" communicates access, not rights.
    const text = JSON.stringify(LIVE_SESSION_TEMPLATES).toLowerCase();
    for (const banned of ['royalt', 'ownership', 'producer credit', 'master rights']) {
      expect(text).not.toContain(banned);
    }
  });

  it('uses no em dashes anywhere', () => {
    expect(JSON.stringify(LIVE_SESSION_TEMPLATES)).not.toContain('—');
  });
});

describe('audienceTierIds', () => {
  const tiers = [
    { id: 'bronze', price: 0 },
    { id: 'silver', price: 1000 },
    { id: 'gold', price: 2500 },
    { id: 'platinum', price: 10000 },
  ];

  it('everyone selects no tiers (free session)', () => {
    expect(audienceTierIds('everyone', tiers)).toEqual([]);
  });

  it('paid selects every paid tier and never the free one', () => {
    const ids = audienceTierIds('paid', tiers);
    expect(ids).toHaveLength(3);
    expect(ids).not.toContain('bronze');
  });

  it('top selects exactly the highest-priced tier', () => {
    expect(audienceTierIds('top', tiers)).toEqual(['platinum']);
  });

  it('degrades to free when the artist has no paid tiers yet', () => {
    expect(audienceTierIds('top', [{ id: 'bronze', price: 0 }])).toEqual([]);
    expect(audienceTierIds('paid', [])).toEqual([]);
  });
});
