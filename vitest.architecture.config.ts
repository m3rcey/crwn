import { defineConfig } from 'vitest/config';
import path from 'node:path';

// The CRWN architecture / drift-prevention suite: npm run verify:architecture.
//
// Deterministic repository contracts only — no live Supabase, no Stripe, no
// network. The live counterparts are npm run verify:migrations (schema state)
// and npm run verify:stripe (price state).
//
// This include list is the SUITE MANIFEST. Every test file named in an
// invariant's enforcedBy (src/lib/architecture/invariants.ts) must appear here;
// architecture.test.ts asserts that parity, so removing a line fails the suite
// instead of silently shrinking it. All of these files also run in plain
// `npm test` — this config is a fast, named subset, not a second test system.
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      // The registry-driven suites
      'src/lib/architecture/architecture.test.ts',
      'src/lib/architecture/ownership.test.ts',
      'src/lib/architecture/financial.test.ts',
      'src/lib/architecture/communications.test.ts',
      'src/lib/architecture/attribution.test.ts',
      'src/lib/architecture/navigation.test.ts',
      'src/lib/architecture/terminology.test.ts',
      'src/lib/architecture/identifiers.test.ts',
      'src/lib/architecture/reachability.test.ts',
      'src/lib/architecture/authorization.test.ts',
      // Existing boundary/contract suites the registry references
      'src/lib/stripe/payoutOwnership.test.ts',
      'src/lib/earningsNet.test.ts',
      'src/lib/postWinReferral.test.ts',
      'src/lib/campaigns/boundaries.test.ts',
      'src/lib/constraint/ownership.test.ts',
      'src/lib/constraint/readership.test.ts',
      'src/lib/operatingFlow.test.ts',
      'src/lib/artistRoadmap.test.ts',
      'src/lib/needsYouBoundary.test.ts',
      'src/lib/ai/managerBoundaries.test.ts',
      'src/lib/ai/actionValidity.test.ts',
      'src/lib/crossArtistEvidence.test.ts',
      'src/lib/fanPromiseBoundary.test.ts',
      'src/lib/promiseEmailBoundary.test.ts',
      'src/lib/promiseReminderBoundary.test.ts',
      'src/lib/comms/chokepoint.test.ts',
      'src/lib/comms/governor.test.ts',
      'src/lib/analytics/paidConversion.test.ts',
      'src/lib/analytics/adminActivation.test.ts',
      'src/lib/analytics/campaignAttribution.test.ts',
      'src/lib/analytics/attributionLookup.test.ts',
      'src/lib/milestoneReconcile.test.ts',
      'src/lib/tierTemplate.test.ts',
      'src/lib/leadMagnets/conversionContract.test.ts',
      'src/lib/leaderboardPrivacy.test.ts',
      'src/lib/brainContract.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
