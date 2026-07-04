// Single source of truth for the CRWN Live-Streaming Agreement gate.
// Imported by BOTH the client (pre-stream modal) and the server (session-start
// enforcement) so the version can never drift between the two.
//
// Bump LIVE_AGREEMENT_VERSION whenever the agreement text materially changes.
// Acceptance is recorded per (fan_id, version), so a new version automatically
// re-prompts every artist at their next go-live — old acceptances no longer
// satisfy the gate.
export const LIVE_AGREEMENT_VERSION = '2026-07-04';

// The affirmative checkboxes shown on the pre-stream screen. The artist must
// check ALL of them before "Go Live" is enabled. Kept here so the copy is
// defined once and the count is unambiguous.
export const LIVE_AGREEMENT_CHECKBOXES: { id: string; label: string }[] = [
  {
    id: 'owns_content',
    label: 'I own or control all music, audio, and content I am about to broadcast.',
  },
  {
    id: 'no_third_party',
    label: "I am not playing other artists' masters, uncleared samples, or DSP audio.",
  },
  {
    id: 'guests_consent',
    label: 'Any guests have agreed to appear and be recorded.',
  },
  {
    id: 'agrees_terms',
    label: 'I agree to the CRWN Live-Streaming Agreement.',
  },
];
