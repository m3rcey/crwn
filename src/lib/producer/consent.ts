// The fan agreement a submitter must accept before sending a beat/vocal/idea.
// Rendered at /submission-agreement; enforced by the submit route + panel.
//
// DRAFT, PENDING LEGAL REVIEW. The text at /submission-agreement is a conservative
// starting point (a submission transfers NOTHING; no license, no guarantee of use,
// credit, or pay; fan warrants originality + clears samples; unreleased material
// stays confidential). It mirrors the hand-written Live Agreement pattern but has
// NOT been reviewed by an attorney.
//
// The '.draft' suffix is a deliberate tripwire: the stored consent_version on every
// submission will carry it, so it is obvious in the data if the feature ever went
// live on unreviewed terms. Before flipping admin_settings.producer_sessions ON:
//   1. have an attorney review/redline /submission-agreement,
//   2. bump this to a clean stamp (e.g. '2026-08-01.v1') and drop the draft banner,
//   3. only then flip the flag.
// See TODO.md.
export const PRODUCER_SUBMISSION_AGREEMENT_VERSION = '2026-07-24.draft1';
