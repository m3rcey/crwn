import { describe, it, expect } from 'vitest';
import { buildLaunchKit, suggestLaunchDate, type LaunchKitInput } from './launchCampaign';

const input = (over: Partial<LaunchKitInput> = {}): LaunchKitInput => ({
  artistName: 'M3rcey',
  shareUrl: 'https://thecrwn.app/m3rcey',
  freeTierName: 'Bronze',
  paidTierName: 'Silver',
  paidPriceLabel: '$10/mo',
  contactCount: 200,
  patreonCount: 0,
  ...over,
});

describe('buildLaunchKit', () => {
  it('builds every asset with the share link and the artist voice', () => {
    const kit = buildLaunchKit(input());
    expect(kit.announcement.body).toContain('https://thecrwn.app/m3rcey');
    expect(kit.announcement.body).toContain('Bronze');
    expect(kit.announcement.body).toContain('Silver ($10/mo)');
    expect(kit.announcement.body).toContain('M3rcey');
    expect(kit.followUp.body).toContain('https://thecrwn.app/m3rcey');
    expect(kit.socialCaption).toContain('https://thecrwn.app/m3rcey');
    expect(kit.dmCopy).toContain('https://thecrwn.app/m3rcey');
    expect(kit.storyCopy.toLowerCase()).toContain('link in bio');
    expect(kit.suggestedTestCount).toBe(20);
  });

  it('uses personalization tokens the campaign sender resolves', () => {
    const kit = buildLaunchKit(input());
    expect(kit.announcement.subject).toContain('{{first_name}}');
    expect(kit.followUp.subject).toContain('{{first_name}}');
  });

  it('degrades gracefully with no tiers yet', () => {
    const kit = buildLaunchKit(input({ freeTierName: null, paidTierName: null, paidPriceLabel: null }));
    expect(kit.announcement.body).toContain('Joining is free.');
    expect(kit.announcement.body).not.toContain('null');
  });

  it('suggests Patreon members first when they exist', () => {
    expect(buildLaunchKit(input({ patreonCount: 40 })).segmentSuggestion).toContain('40 Patreon members');
    expect(buildLaunchKit(input()).segmentSuggestion).toContain('test group');
    expect(buildLaunchKit(input({ contactCount: 0 })).segmentSuggestion).toContain('Import your fan contacts first');
  });

  it('never uses an em dash anywhere', () => {
    const kit = buildLaunchKit(input({ patreonCount: 3 }));
    const all = JSON.stringify(kit);
    expect(all).not.toContain('—');
    expect(all).not.toContain('–');
  });
});

describe('suggestLaunchDate', () => {
  it('picks the coming Friday at least two days out, at noon', () => {
    // Wednesday Jul 29 2026 → +2 days = Friday Jul 31.
    const fromWed = suggestLaunchDate(new Date('2026-07-29T09:00:00'));
    expect(fromWed.getDay()).toBe(5);
    expect(fromWed.getDate()).toBe(31);
    expect(fromWed.getHours()).toBe(12);

    // Friday → two days lands Sunday, so it rolls to NEXT Friday.
    const fromFri = suggestLaunchDate(new Date('2026-07-31T09:00:00'));
    expect(fromFri.getDay()).toBe(5);
    expect(fromFri.getDate()).toBe(7);
  });
});
