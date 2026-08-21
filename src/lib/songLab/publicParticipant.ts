// PUBLIC VOTE PARTICIPANT: how a live-show vote is counted when the email that was typed
// belongs to somebody else's verified CRWN account.
//
// WHY THIS EXISTS, AND WHY IT COULD NOT REUSE AN EXISTING TABLE.
//
// `song_lab_votes.fan_id` is `NOT NULL REFERENCES profiles(id)`, and `profiles.id`
// REFERENCES `auth.users(id)`. So a counted vote requires an auth identity, and one email
// can only ever have one auth user. For a brand-new address that is fine: CRWN creates the
// unverified CAPTURED CONTACT and the vote hangs off it. For an address that already
// belongs to a VERIFIED account there is no safe identity available:
//
//   * writing the vote against that account's fan_id would attribute an opinion to a real
//     person who did not express it, award them a participation badge, and let anyone put
//     words in a stranger's mouth by typing their address;
//   * `song_lab_offer_claims` has the same NOT NULL fan_id, so it cannot hold it either;
//   * `fan_contacts` and `lead_magnet_results` have no decision or option concept at all.
//
// Hence one narrow table whose whole purpose is "an unauthenticated person cast this
// advisory vote", holding no account link and no readable address.
//
// THE KEY IS A KEYED HASH, NOT AN EMAIL AND NOT A USER ID. Storing the address would put a
// list of attendee emails in a table nobody needs to read; storing the matched user id
// would assert "this user voted", which is exactly the claim CRWN cannot make. An HMAC of
// the normalized address gives the one property actually needed, stable deduplication, and
// nothing else. It is also what makes later reconciliation possible WITHOUT storing a link:
// the same address hashes to the same key, so a signed-in fan's key can be recomputed on
// demand rather than persisted.

import { createHmac } from 'crypto';
import { normalizeEmail } from './liveClaim';
import type { DecisionOption } from './core';

/**
 * Derive the participant key. Purpose-bound: the service key is never used directly as an
 * HMAC key, it derives a subkey first, so this value cannot be replayed against anything
 * else that might one day key off the same secret.
 *
 * Rotating the service role key changes every future key, which would let one person vote
 * twice in a poll that was open across the rotation. That is an acceptable and documented
 * limit: rotations are rare, and the alternative (a second env var the founder must set
 * before the feature works) fails closed at a live show for a worse reason.
 */
export function participantKey(email: string, secret: string | undefined): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized || !secret) return null;
  const subkey = createHmac('sha256', secret).update('song-lab:public-participant:v1').digest();
  return createHmac('sha256', subkey).update(normalized).digest('hex');
}

export interface OptionResult {
  id: string;
  label: string;
  votes: number;
  /** Whole percent of the total. Guaranteed to sum to exactly 100 when any vote exists. */
  percent: number;
}

/**
 * Merge the two vote sources into one result set for a decision.
 *
 * Both sources are equally "somebody at the show picked this": the only difference is
 * whether CRWN could hang an account off the address. Counting them together is the honest
 * tally, and it is what the artist needs to know what the room wanted.
 *
 * Percentages use the largest-remainder method so two options never render as 54% and 47%.
 * A room reading a phone in the dark should not have to wonder whether the maths is broken.
 */
export function mergedResults(
  options: DecisionOption[],
  accountVotes: Array<{ option_id: string }>,
  publicVotes: Array<{ option_id: string }>,
): { options: OptionResult[]; total: number } {
  const counts = new Map<string, number>();
  for (const o of options) counts.set(o.id, 0);
  for (const v of [...(accountVotes || []), ...(publicVotes || [])]) {
    if (counts.has(v.option_id)) counts.set(v.option_id, (counts.get(v.option_id) ?? 0) + 1);
  }

  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (total === 0) {
    return { options: options.map((o) => ({ id: o.id, label: o.label, votes: 0, percent: 0 })), total: 0 };
  }

  // Largest remainder: floor everything, then hand the leftover points to the biggest
  // fractional parts, so the column always adds up to 100.
  const raw = options.map((o) => {
    const votes = counts.get(o.id) ?? 0;
    const exact = (votes / total) * 100;
    return { id: o.id, label: o.label, votes, floor: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let left = 100 - raw.reduce((sum, r) => sum + r.floor, 0);
  const order = [...raw].sort((a, b) => (b.remainder - a.remainder) || (b.votes - a.votes) || a.id.localeCompare(b.id));
  const bump = new Set<string>();
  for (const r of order) {
    if (left <= 0) break;
    bump.add(r.id);
    left--;
  }

  return {
    options: raw.map((r) => ({
      id: r.id,
      label: r.label,
      votes: r.votes,
      percent: r.floor + (bump.has(r.id) ? 1 : 0),
    })),
    total,
  };
}
