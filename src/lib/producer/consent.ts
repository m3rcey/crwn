// The fan agreement a submitter must accept before sending a beat/vocal/idea.
//
// PLACEHOLDER. The real text is a founder/attorney deliverable (originality
// attestation, sample-clearance responsibility, likeness release, no-guarantee-
// of-use, confidentiality of unreleased music). Until it exists this stays
// 'DRAFT-unpublished', and the dark-launch flag admin_settings.producer_sessions
// stays OFF, so no real fan ever submits. When the agreement ships:
//   1. write the page + version stamp,
//   2. bump this constant to the version,
//   3. require acceptance in the submit UI + route,
//   4. only then flip the flag.
export const PRODUCER_SUBMISSION_AGREEMENT_VERSION = 'DRAFT-unpublished';
