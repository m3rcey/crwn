// artistEmailFacts.ts: SERVER ONLY. Reads the canonical facts `artistEmailGate` decides on.
//
// Every value comes from a canonical row: milestones (reconciled from tracks, tiers, earnings
// and the setup event every night before the nudge pass), the tier table, the plan column and
// the earnings ledger. A failed read reports NOT KNOWN (null GMV, no paid tier), and the gate
// treats not-known as "do not sell a plan", never as "send".

import type { ArtistEmailFacts } from './artistEmailGate';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export interface ArtistEmailSubject {
  artistId: string;
  facts: ArtistEmailFacts;
}

/** Trailing 30-day gross GMV, the same definition the break-even upgrade pop-up reads. */
export async function trailingGmv30dCents(admin: Admin, artistId: string, now = new Date()): Promise<number | null> {
  try {
    const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
    const { data, error } = await admin
      .from('earnings')
      .select('gross_amount')
      .eq('artist_id', artistId)
      .gte('created_at', since);
    if (error) return null;
    return (data ?? []).reduce((sum: number, r: { gross_amount: number | null }) => sum + (Number(r.gross_amount) || 0), 0);
  } catch {
    return null;
  }
}

/** Facts for the artist owned by this auth user, or null when the user has no artist row. */
export async function loadArtistEmailFacts(admin: Admin, userId: string, now = new Date()): Promise<ArtistEmailSubject | null> {
  const { data: ap } = await admin
    .from('artist_profiles')
    .select('id, platform_tier, activation_milestones')
    .eq('user_id', userId)
    .maybeSingle();
  if (!ap) return null;

  const [{ data: paid }, gmv] = await Promise.all([
    admin
      .from('subscription_tiers')
      .select('id')
      .eq('artist_id', ap.id)
      .eq('is_active', true)
      .gt('price', 0)
      .limit(1),
    trailingGmv30dCents(admin, ap.id, now),
  ]);

  return {
    artistId: ap.id,
    facts: {
      milestones: (ap.activation_milestones || {}) as Record<string, string>,
      hasPaidTier: (paid ?? []).length > 0,
      platformTier: ap.platform_tier ?? null,
      gmv30dCents: gmv,
    },
  };
}
