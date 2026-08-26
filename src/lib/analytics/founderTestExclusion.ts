// founderTestExclusion.ts — which artist accounts are the founder's test accounts.
//
// The acquisition funnel and the 90-day scorecard count ACCOUNTS (artist_profiles rows), so
// the analytics wipe cannot clean them: the founder's test accounts sit in the roster itself.
// artist_profiles.is_founder_test (migration schema-phase2-founder-test-exclusion.sql) marks
// them, and ADMIN metric routes exclude them through this one helper.
//
// Fail-soft BY DESIGN: before the migration runs (or on any read error) this returns empty
// sets and the dashboards count everyone, exactly as they did before. Admin routes only; the
// column has no browser grant, so never select it from a client component.

type Db = { from: (t: string) => any };

export interface FounderTestSets {
  artistIds: Set<string>;
  userIds: Set<string>;
}

const EMPTY: FounderTestSets = { artistIds: new Set(), userIds: new Set() };

export async function founderTestArtists(db: Db): Promise<FounderTestSets> {
  try {
    const { data, error } = await db
      .from('artist_profiles')
      .select('id, user_id')
      .eq('is_founder_test', true);
    if (error || !Array.isArray(data)) return EMPTY;
    return {
      artistIds: new Set(data.map((r: { id: string }) => r.id).filter(Boolean)),
      userIds: new Set(data.map((r: { user_id: string }) => r.user_id).filter(Boolean)),
    };
  } catch {
    return EMPTY;
  }
}
