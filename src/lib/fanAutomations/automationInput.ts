// Pure validation for artist-submitted automation payloads.
//
// The route resolves what the artist OWNS (their connection, their tiers, their tracks) and
// passes those sets in; this module then refuses anything outside them. A tier or track id
// in the body is a POINTER the artist may only aim at their own rows, never authority.

export interface AutomationInput {
  provider: 'instagram' | 'facebook' | 'link';
  triggerMediaIds: string[];
  triggerKeywords: string[];
  publicReply: string;
  dmMessage: string;
  magnetKind: 'upload' | 'track' | null;
  magnetTitle: string;
  magnetDescription: string;
  magnetFileKey: string | null;
  magnetFileName: string | null;
  magnetTrackId: string | null;
  goldTierId: string | null;
  goldItemTitle: string;
  goldItemDescription: string;
  silverTierId: string | null;
  /** Optional artist-owned sequence a claim through this funnel enrolls into. */
  nurtureSequenceId: string | null;
}

export interface OwnedResources {
  /** Active paid tier ids belonging to this artist. */
  tierIds: string[];
  /** The artist's own sequence ids; a nurture pointer outside this set is refused. */
  sequenceIds?: string[];
  /** FREE track ids belonging to this artist (a magnet may never be a gated track). */
  freeTrackIds: string[];
  /** R2 keys minted for this artist by the magnet-upload route (prefix check). */
  magnetKeyPrefix: string;
}

export type ValidationResult =
  | { ok: true; value: AutomationInput }
  | { ok: false; error: string };

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strOrNull = (v: unknown, max: number): string | null => {
  const s = str(v, max);
  return s || null;
};

function stringList(v: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim().slice(0, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function validateAutomationInput(body: unknown, owned: OwnedResources): ValidationResult {
  const b = (body ?? {}) as Record<string, unknown>;

  // 'link' is a real source: a funnel whose traffic comes from a bio link, a QR code or
  // an external tool, with no social account listening. It reaches the same engine.
  const provider = b.provider === 'facebook' ? 'facebook' : b.provider === 'link' ? 'link' : b.provider === 'instagram' ? 'instagram' : null;
  if (!provider) return { ok: false, error: 'Pick where CRWN should listen for comments.' };

  const magnetKind = b.magnetKind === 'upload' ? 'upload' : b.magnetKind === 'track' ? 'track' : null;
  const magnetFileKey = strOrNull(b.magnetFileKey, 512);
  const magnetTrackId = strOrNull(b.magnetTrackId, 64);

  if (magnetKind === 'upload') {
    if (!magnetFileKey) return { ok: false, error: 'Upload the file fans get.' };
    if (!magnetFileKey.startsWith(owned.magnetKeyPrefix)) {
      return { ok: false, error: 'That file does not belong to this artist.' };
    }
  }
  if (magnetKind === 'track') {
    if (!magnetTrackId || !owned.freeTrackIds.includes(magnetTrackId)) {
      return { ok: false, error: 'Pick one of your own free tracks.' };
    }
  }

  const goldTierId = strOrNull(b.goldTierId, 64);
  if (goldTierId && !owned.tierIds.includes(goldTierId)) {
    return { ok: false, error: 'That tier does not belong to this artist.' };
  }
  const silverTierId = strOrNull(b.silverTierId, 64);
  if (silverTierId && !owned.tierIds.includes(silverTierId)) {
    return { ok: false, error: 'That tier does not belong to this artist.' };
  }
  const nurtureSequenceId = strOrNull(b.nurtureSequenceId, 64);
  if (nurtureSequenceId && !(owned.sequenceIds || []).includes(nurtureSequenceId)) {
    return { ok: false, error: 'That nurture sequence is not one of yours' };
  }

  if (goldTierId && silverTierId && goldTierId === silverTierId) {
    return { ok: false, error: 'The offer and the downsell must be different tiers.' };
  }

  return {
    ok: true,
    value: {
      provider,
      triggerMediaIds: stringList(b.triggerMediaIds, 20, 128),
      triggerKeywords: stringList(b.triggerKeywords, 20, 64).map((k) => k.toLowerCase()),
      publicReply: str(b.publicReply, 300),
      dmMessage: str(b.dmMessage, 900),
      magnetKind,
      magnetTitle: str(b.magnetTitle, 120),
      magnetDescription: str(b.magnetDescription, 500),
      magnetFileKey: magnetKind === 'upload' ? magnetFileKey : null,
      magnetFileName: magnetKind === 'upload' ? strOrNull(b.magnetFileName, 160) : null,
      magnetTrackId: magnetKind === 'track' ? magnetTrackId : null,
      goldTierId,
      goldItemTitle: str(b.goldItemTitle, 120),
      goldItemDescription: str(b.goldItemDescription, 500),
      silverTierId,
      nurtureSequenceId,
    },
  };
}

/**
 * What an automation still needs before it may be activated. Empty list = ready.
 *
 * A Meta connection is deliberately NOT a blocker any more (Build 1 of the fan sales
 * engine, 2026-09-01). The drop page is the reusable funnel, and an artist driving
 * traffic with EXTERNAL tooling (ManyChat, a link in bio, a QR code) needs the funnel
 * live with no Instagram connection at all. The comment-matching engine already only
 * routes events through automations that HAVE a connection, so an active connection-less
 * automation simply never receives a comment: nothing about the Meta side loosens. The
 * DM message is required only when a connection exists, because it is the one thing a
 * connection delivers.
 */
export function activationBlockers(a: {
  connection_id: string | null;
  dm_message: string;
  magnet_kind: string | null;
  gold_tier_id: string | null;
}): string[] {
  const blockers: string[] = [];
  if (!a.magnet_kind) blockers.push('Choose what fans get when they comment.');
  if (a.connection_id && !a.dm_message.trim()) blockers.push('Write the private message fans receive.');
  if (!a.gold_tier_id) blockers.push('Pick the membership tier to offer after the drop.');
  return blockers;
}
