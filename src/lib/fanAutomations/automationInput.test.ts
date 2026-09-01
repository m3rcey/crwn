import { describe, it, expect } from 'vitest';
import { activationBlockers, validateAutomationInput, type OwnedResources } from './automationInput';

const OWNED: OwnedResources = {
  tierIds: ['tier-gold', 'tier-silver'],
  freeTrackIds: ['track-free'],
  magnetKeyPrefix: 'm3rcey/magnet/',
};

const BASE = {
  provider: 'instagram',
  triggerKeywords: ['Vault'],
  publicReply: 'Check your DMs 👑',
  dmMessage: 'Here it is',
  magnetKind: 'track',
  magnetTrackId: 'track-free',
  goldTierId: 'tier-gold',
  silverTierId: 'tier-silver',
};

describe('validateAutomationInput', () => {
  it('accepts a well-formed payload and lowercases keywords', () => {
    const res = validateAutomationInput(BASE, OWNED);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.triggerKeywords).toEqual(['vault']);
      expect(res.value.magnetTrackId).toBe('track-free');
    }
  });

  it("refuses another artist's tier as gold or silver", () => {
    expect(validateAutomationInput({ ...BASE, goldTierId: 'foreign-tier' }, OWNED).ok).toBe(false);
    expect(validateAutomationInput({ ...BASE, silverTierId: 'foreign-tier' }, OWNED).ok).toBe(false);
  });

  it('refuses a track the artist does not own as a free track', () => {
    expect(validateAutomationInput({ ...BASE, magnetTrackId: 'foreign-track' }, OWNED).ok).toBe(false);
  });

  it("refuses a magnet file key outside this artist's prefix (SEC-009 shape)", () => {
    const res = validateAutomationInput(
      { ...BASE, magnetKind: 'upload', magnetFileKey: 'other-artist/magnet/file.pdf' },
      OWNED,
    );
    expect(res.ok).toBe(false);
  });

  it('accepts an upload under the owned prefix', () => {
    const res = validateAutomationInput(
      { ...BASE, magnetKind: 'upload', magnetFileKey: 'm3rcey/magnet/123-pack.pdf', magnetFileName: 'pack.pdf' },
      OWNED,
    );
    expect(res.ok).toBe(true);
  });

  it('gold and silver must differ', () => {
    expect(validateAutomationInput({ ...BASE, silverTierId: 'tier-gold' }, OWNED).ok).toBe(false);
  });

  it('unknown provider is refused', () => {
    expect(validateAutomationInput({ ...BASE, provider: 'tiktok' }, OWNED).ok).toBe(false);
  });

  it('junk arrays are sanitized, not trusted', () => {
    const res = validateAutomationInput({ ...BASE, triggerMediaIds: [1, '', '  m-1  '], triggerKeywords: 'vault' }, OWNED);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.triggerMediaIds).toEqual(['m-1']);
      expect(res.value.triggerKeywords).toEqual([]);
    }
  });
});

describe('activationBlockers', () => {
  it('a complete automation has no blockers', () => {
    expect(activationBlockers({ connection_id: 'c', dm_message: 'hi', magnet_kind: 'track', gold_tier_id: 't' })).toEqual([]);
  });

  it('each missing piece is named', () => {
    const blockers = activationBlockers({ connection_id: 'c', dm_message: ' ', magnet_kind: null, gold_tier_id: null });
    expect(blockers).toHaveLength(3);
  });

  it('NO connection is not a blocker: external-traffic funnels activate link-only', () => {
    // The reusable engine rule (Build 1): an artist driving traffic with external
    // ManyChat, a bio link or a QR code needs the drop page live with no Instagram
    // connection at all. The comment matcher only routes through automations that HAVE
    // a connection, so nothing about the Meta side loosens.
    expect(activationBlockers({ connection_id: null, dm_message: '', magnet_kind: 'track', gold_tier_id: 't' })).toEqual([]);
  });

  it('WITH a connection, the DM message is required, because the connection delivers it', () => {
    const blockers = activationBlockers({ connection_id: 'c', dm_message: ' ', magnet_kind: 'track', gold_tier_id: 't' });
    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toContain('private message');
  });
});
