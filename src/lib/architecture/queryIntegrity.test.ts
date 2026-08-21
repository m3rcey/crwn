// QUERY-001 — an ambiguous PostgREST embed is a SILENT total failure, not a partial one.
//
// The finding this generalises (2026-08-21). `subscriptions` has TWO foreign keys to
// `subscription_tiers`: `tier_id`, and `pending_tier_id` added later by the downgrade
// migration. From that moment every query written as `subscription_tiers(name)` became
// ambiguous, and PostgREST answers an ambiguous embed by rejecting the WHOLE statement
// with PGRST201. supabase-js surfaces that as `{ data: null }`, and nine call sites read
// `(data || [])` as "there are no subscribers".
//
// Nothing threw, nothing logged, and nothing looked broken. What actually happened:
//   - every artist's Fan CRM listed ZERO members while the rows existed,
//   - campaign sends resolved an EMPTY audience and reported success,
//   - a fan's own membership list rendered empty,
//   - the public fan leaderboard lost its tiers,
//   - the launch-partner guarantee could not see a paid tier,
//   - and a Stripe webhook read "subscription not found" on a money path.
//
// The lesson is not "remember to name the FK". It is that adding a SECOND foreign key
// between two tables retroactively breaks every existing bare embed between them, in a
// way no type checker and no test that mocks the database can see. So this scan is the
// guard: name the constraint, always, on any table that has more than one route to the
// same target.
import { describe, it, expect } from 'vitest';
import { listSourceFiles, readStripped, violation } from './sourceScan';

const files = listSourceFiles('src').filter(f => !f.startsWith('src/lib/architecture/'));
const collapsed = (f: string) => readStripped(f).replace(/\n\s*/g, '');

/**
 * Tables with MORE THAN ONE foreign key to the same target table, as
 * `queried table` -> `embedded table`. A bare embed between any of these pairs is
 * ambiguous and fails the entire statement. Add a pair here when a migration
 * introduces a second FK between two tables.
 */
const AMBIGUOUS_PAIRS: ReadonlyArray<{ from: string; embed: string; why: string }> = [
  {
    from: 'subscriptions',
    embed: 'subscription_tiers',
    why: 'tier_id and pending_tier_id both reference subscription_tiers (schema-subscription-downgrade.sql)',
  },
];

describe('QUERY-001 — ambiguous PostgREST embeds', () => {
  it('found source files to scan (positive control)', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('the scan can actually detect a bare embed (positive control)', () => {
    // Proves the regex matches the shape it claims to, so a future refactor that breaks
    // the pattern fails loudly here instead of passing over real violations.
    const bare = /(?<!!)\bsubscription_tiers\(/;
    expect(bare.test(`.select('fan_id, subscription_tiers(name)')`)).toBe(true);
    expect(bare.test(`.select('fan_id, subscription_tiers!subscriptions_tier_id_fkey(name)')`)).toBe(false);
  });

  for (const pair of AMBIGUOUS_PAIRS) {
    it(`every ${pair.embed} embed from ${pair.from} names its foreign key`, () => {
      const bare = new RegExp(`(?<!!)\\b${pair.embed}\\(`);
      const offenders = files.filter(f => {
        const src = collapsed(f);
        if (!src.includes(`from('${pair.from}')`) && !src.includes(`from("${pair.from}")`)) return false;
        return bare.test(src);
      });
      expect(
        offenders,
        violation(
          'QUERY-001',
          `file(s) embed ${pair.embed} from ${pair.from} without naming the foreign key: ${offenders.join(', ')}. ${pair.why}, so PostgREST rejects the WHOLE query with PGRST201 and supabase-js returns {data: null} — which reads as "no rows" and fails silently. Write ${pair.embed}!${pair.from}_tier_id_fkey(...) instead.`,
          { docs: 'docs/crwn-brain/13-CURRENT-STATE.md' },
        ),
      ).toEqual([]);
    });
  }
});
