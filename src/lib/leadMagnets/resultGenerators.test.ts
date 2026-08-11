import { describe, it, expect } from 'vitest';
import { generateResult, GENERATOR_VERSION } from './resultGenerators';

// Z2B-2: Clip-to-Earn now carries the artist's own answers into the builder through
// conversionPayload. The rendered result must be untouched by that, and the payload must never
// drift from what the artist actually read on the page.
describe('clip-to-earn conversion payload (builder prefill without a formula change)', () => {
  const answers = {
    sourceContent: 'my new single "Crown"',
    sourceType: 'song',
    platforms: ['TikTok', 'Reels'],
    clipTypes: ['hook moment', 'beat drop'],
    clipLength: '7-15s',
    rewardType: 'badge',
    topClipAward: 'a signed vinyl',
    requiredCaption: 'out now',
    requiredHashtags: ['crown'],
    approvalRequired: true,
  };

  it('carries the source, moments and rules the artist already gave', () => {
    const r = generateResult('clipToEarnCampaign', answers);
    const cp = r.conversionPayload;
    expect(cp.sourceContent).toBe('my new single "Crown"');
    expect(cp.moments).toEqual(['A hook moment from my new single "Crown"', 'A beat drop from my new single "Crown"']);
    expect(cp.rules).toContain('Length: 7-15s');
    expect(cp.rules).toContain('Platforms: TikTok, Reels');
    expect(cp.rules).toContain('Caption must include: out now');
    expect(cp.rules).toContain('Hashtags: #crown');
    expect(cp.rules).toContain('Clips are reviewed before they count');
  });

  it('never shows the builder something different from what the result showed', () => {
    const r = generateResult('clipToEarnCampaign', answers);
    expect(r.conversionPayload.rules).toEqual(r.sections.find((s) => s.key === 'rules')?.items);
    expect(r.conversionPayload.moments).toEqual(r.sections.find((s) => s.key === 'bestMoments')?.items);
  });

  it('leaves the rendered result and the generator version unchanged', () => {
    const r = generateResult('clipToEarnCampaign', answers);
    expect(r.generatorVersion).toBe(GENERATOR_VERSION);
    expect(GENERATOR_VERSION).toBe('1.0.0');
    expect(r.headline).toBe('Your clip-to-earn campaign');
    expect(r.sections.map((s) => s.key)).toEqual([
      'brief',
      'rules',
      'bestMoments',
      'reward',
      'captions',
      'moderation',
      'launch',
      'nextSteps',
    ]);
    // The keys the bounty adapter reads are untouched.
    expect(r.conversionPayload.bountyType).toBe('most_clicks');
    expect(r.conversionPayload.rewardDetail).toBe('a signed vinyl');
    expect(r.conversionPayload.approvalRequired).toBe(true);
  });

  it('degrades to empty rather than inventing a source when the artist gave none', () => {
    const r = generateResult('clipToEarnCampaign', { ...answers, sourceContent: '' });
    expect(r.conversionPayload.sourceContent).toBe('');
  });
});
