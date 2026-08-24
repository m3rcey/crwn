import { defineConfig } from 'vitest/config';
import path from 'node:path';

// The CRWN architecture / drift-prevention suite: npm run verify:architecture.
//
// Deterministic repository contracts only — no live Supabase, no Stripe, no
// network. The live counterparts are npm run verify:migrations (schema state)
// and npm run verify:stripe (price state).
//
// This include list is the SUITE MANIFEST, protected by TWO assertions in
// architecture.test.ts, because one of them was never enough:
//
//   1. Every test file named in an invariant's enforcedBy
//      (src/lib/architecture/invariants.ts) must appear here.
//   2. Every file in REQUIRED_SECURITY_SUITES must appear here.
//
// Assertion 2 exists because assertion 1 does not cover the cybersecurity
// suites: no invariant names security.test.ts or headers.test.ts in enforcedBy,
// so until 2026-08-12 deleting their two lines below shrank the security gate
// and the whole suite still went green. This comment previously claimed the
// parity check covered them. It did not. Verified by mutation on 2026-08-12:
// with the security.test.ts line removed, assertion 1 passed and only
// assertion 2 failed.
//
// All of these files also run in plain `npm test` — this config is a fast,
// named subset, not a second test system.
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
      // QUERY-001. In the GATE because the failure mode is total and silent: an ambiguous
      // embed returns {data: null}, which nine call sites read as "no rows". It emptied
      // every artist's Fan CRM and every campaign audience for as long as it existed.
      'src/lib/architecture/queryIntegrity.test.ts',
      // Security invariants from the 2026-08-12 cybersecurity audit. These belong in
      // the GATE, not merely in `npm test`: the whole lesson of SEC-001 is that a
      // security assertion nobody runs on the way to production is decoration.
      'src/lib/architecture/security.test.ts',
      'src/lib/architecture/headers.test.ts',
      // The send-ledger / webhook pairing. In the gate because the failure mode is silence: the
      // lifecycle sequences emailed real artists for four months with no ledger and nothing broke,
      // which is exactly the class of drift a build-time assertion catches and a human does not.
      'src/lib/architecture/emailFeedback.test.ts',
      // What a COMPROMISED model can actually do. Asserts the non-model control behind each
      // AI security claim, never the wording of a system prompt.
      'src/lib/ai/agentSecurityBoundaries.test.ts',
      // Drift gate for the Claude Code subagents in .claude/agents. They sat outside every gate
      // until 2026-08-12, which is how the build agent drifted into certifying a fake-passing build.
      'src/lib/architecture/agentContracts.test.ts',
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
      // Fan Testimonials V1. In the GATE and not merely in `npm test`, because two of its nine
      // invariants are P0: publishing without fan consent, and pairing tier with tenure into a
      // lifetime-spend disclosure. Both are irreversible for a real fan.
      // TS-MONEY-006 (D4): over-commitment refusal. In the GATE because accepting an
      // unhonourable percentage is a money defect that reaches two real people.
      'src/lib/teamSplits/commitment.test.ts',
      'src/lib/teamSplits/feePercent.test.ts',
      'src/lib/teamSplits/cashoutBalance.test.ts',
      'src/lib/stripe/refundRecovery.test.ts',
      'src/lib/teamSplits/funding.test.ts',
      'src/lib/architecture/testimonials.test.ts',
      'src/lib/testimonials/core.test.ts',
      'src/lib/brainContract.test.ts',
      // The public legal pages. In the GATE because the failure is silent and external: the
      // A2P 10DLC campaign for JNW Creative Enterprises, Inc. is vetted against the live text
      // of /privacy and /terms, so a disclosure quietly edited out stops the founder's
      // speed-to-lead alert without anything in the product going red.
      'src/lib/legal/legalPages.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
