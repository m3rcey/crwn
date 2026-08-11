// leaderboardPrivacy.ts — the public projection of the fan leaderboard, and the scoring it hides.
//
// PURE. Extracted from /api/leaderboard so the privacy property can be TESTED rather than asserted
// in a comment. The route is deliberately public (the leaderboard renders on the public artist
// page), which means every field in its response is a publishing decision.
//
// THE DEFECT THIS EXISTS TO PREVENT COMING BACK
// ---------------------------------------------
// `spent` was redacted from the response, and the redaction did not work. The score is
//     score = round(spent/100) + referrals*50 + comments*5 + likes*2
// and referrals, comments and likes were all shipped in the SAME response, so
//     spent = (score - referrals*50 - comments*5 - likes*2) * 100
// recovered a fan's lifetime spend on that artist to the nearest dollar, for anyone who could load
// the public page. A redaction defeated by the fields shipped beside it is not a redaction.
//
// The fix is that the score does not leave the server. Ranking is unchanged: the ORDER still comes
// from the full score, spend included. Only the invertible number is gone.

export interface FanScoreInput {
  fanId: string;
  /** Lifetime net spend with this artist, in cents. PRIVATE. Never leaves the server. */
  spentCents: number;
  referralCount: number;
  commentCount: number;
  likeCount: number;
  tier: string;
}

/** $1 spent = 1pt, 1 referral = 50pts, 1 comment = 5pts, 1 like = 2pts. Server-side only. */
export function fanScore(f: Pick<FanScoreInput, 'spentCents' | 'referralCount' | 'commentCount' | 'likeCount'>): number {
  return (
    Math.round(f.spentCents / 100) +
    f.referralCount * 50 +
    f.commentCount * 5 +
    f.likeCount * 2
  );
}

/** Exactly what a public caller receives. Adding a field here is a privacy decision. */
export interface PublicLeaderboardEntry {
  rank: number;
  fanId: string;
  name: string;
  avatar: string | null;
  referralCount: number;
  commentCount: number;
  likeCount: number;
  tier: string;
}

/**
 * Project one ranked fan into the public payload.
 *
 * Note what is absent and must stay absent: `spentCents`, and any score, points total, tier price,
 * revenue, commission or currency figure. The three counts that remain are all PUBLIC ACTIONS
 * (they referred someone, they commented, they liked) and reveal nothing about money on their own.
 */
export function toPublicLeaderboardEntry(f: FanScoreInput, rank: number, name: string, avatar: string | null): PublicLeaderboardEntry {
  return {
    rank,
    fanId: f.fanId,
    name,
    avatar,
    referralCount: f.referralCount,
    commentCount: f.commentCount,
    likeCount: f.likeCount,
    tier: f.tier,
  };
}
