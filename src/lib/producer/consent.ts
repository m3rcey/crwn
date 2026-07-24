// The fan agreement a submitter must accept before sending a beat/vocal/idea.
// Rendered at /submission-agreement; enforced by the submit route + panel.
//
// Operative agreement, founder-approved 2026-07-24. Conservative model: a
// submission transfers NOTHING (no license, no guarantee of use/credit/pay; the
// fan warrants originality + clears samples; unreleased material stays
// confidential). Mirrors the hand-written Live Agreement pattern.
//
// The submit route requires the fan's client to echo this exact version, so
// bumping it when the agreement text materially changes automatically re-prompts
// every submitter (their old acceptance no longer matches). Submissions recorded
// under an earlier version keep that version as their historical record.
export const PRODUCER_SUBMISSION_AGREEMENT_VERSION = '2026-07-24.v1';
