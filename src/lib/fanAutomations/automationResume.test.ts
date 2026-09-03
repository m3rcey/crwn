import { describe, it, expect } from 'vitest';
import { funnelResumeScreen, magnetResumeScreen, type ResumableAutomation } from './automationResume';

const row = (over: Partial<ResumableAutomation> = {}): ResumableAutomation => ({
  magnet_kind: 'track',
  magnet_file_key: null,
  magnet_track_id: 't1',
  magnet_title: 'Unreleased: Midnight Tape',
  gold_tier_id: 'gold',
  gold_item_title: 'The full vault',
  silver_tier_id: null,
  ...over,
});
const has = (id: string) => id === 't1';

describe('magnetResumeScreen derives the open decision from the row', () => {
  it('no row or no kind starts at the kind', () => {
    expect(magnetResumeScreen(null, has)).toBe('magnet-kind');
    expect(magnetResumeScreen(row({ magnet_kind: null }), has)).toBe('magnet-kind');
  });
  it('a missing asset reopens the asset screen, including a track deleted elsewhere', () => {
    expect(magnetResumeScreen(row({ magnet_kind: 'upload', magnet_file_key: null }), has)).toBe('magnet-detail');
    expect(magnetResumeScreen(row({ magnet_track_id: 'gone' }), has)).toBe('magnet-detail');
    expect(magnetResumeScreen(row({ magnet_track_id: null }), has)).toBe('magnet-detail');
  });
  it('a missing title reopens the title; a whole magnet lands on review', () => {
    expect(magnetResumeScreen(row({ magnet_title: ' ' }), has)).toBe('magnet-title');
    expect(magnetResumeScreen(row(), has)).toBe('magnet-review');
    expect(magnetResumeScreen(row({ magnet_kind: 'upload', magnet_file_key: 'gb/magnet/x.zip' }), has)).toBe('magnet-review');
  });
});

describe('funnelResumeScreen', () => {
  it('a stale or foreign tier pointer reopens the tier question when there is one to ask', () => {
    expect(funnelResumeScreen(row({ gold_tier_id: 'gone' }), ['gold', 'silver'], true)).toBe('gold-tier');
    expect(funnelResumeScreen(row({ gold_tier_id: null }), ['gold'], false)).toBe('gold-item');
  });
  it('a missing standout item reopens it; a whole funnel lands on review', () => {
    expect(funnelResumeScreen(row({ gold_item_title: '' }), ['gold'], false)).toBe('gold-item');
    expect(funnelResumeScreen(row(), ['gold'], false)).toBe('funnel-review');
  });
});
