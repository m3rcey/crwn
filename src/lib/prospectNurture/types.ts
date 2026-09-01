// Shared types for the prospect nurture system.
//
// The CONTENT is code, versioned in git (like the quest catalog). These types describe one
// versioned universal core sequence plus per-calculator modules. Nothing here does I/O, imports a
// React component, or holds a secret: it is pure, client-safe data + pure render helpers.
//
// Financial numbers are NEVER computed here. They are read from a stored result's result_data
// (the deterministic calculator output) and passed in as already-formatted strings.

import type { NurtureArtKey } from './art';

// v3 phases. Deliberately FOUR, not eight: the old eight-phase split scheduled a belief by the
// calendar (objections at day 56, proof at day 150) rather than by when the artist actually has the
// thought. v3 groups by DECISION STATE, and objections/proof are distributed into whichever phase
// the objection naturally arises in.
export type NurturePhase =
  | 'diagnose' //   days 1-6    the result is real, the problem is fragmentation, one first move
  | 'believe' //    days 8-18   mechanism, proven buyers, switching risk, effort
  | 'decide' //     days 24-45  compounding, worked example, cost of "fine", the assisted path
  | 'evergreen'; // days 60-365 re-run the numbers, ownership, one-reply ask, final invite

// A block of an email body. The renderer turns these into both HTML and plain text.
// `moduleQuickWin` / `moduleUseCase` inject the calculator-specific module content at render time,
// which is what makes one core sequence serve every calculator.
export type NurtureBlock =
  | { kind: 'p'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'callout'; text: string }
  | { kind: 'moduleQuickWin' }
  | { kind: 'moduleUseCase' }
  // A line that reads well WITH the lead's real dollar figure and also WITHOUT it (score-only tools
  // like Royalty Readiness and the Quest Path have no dollar, so we must never render a blank).
  | { kind: 'numberOrFallback'; withNumber: string; withoutNumber: string }
  // A VSL, referenced by its catalog slug. Renders as a POSTER IMAGE with a play badge linking to
  // the watch page, because no email client plays an embedded video: that is not a limitation being
  // worked around, it is the only thing that works in Gmail and Outlook.
  //
  // It renders NOTHING when the referenced video has no hosted URL yet. So this block can ship into
  // a live sequence before a single video is cut, and the email simply reads as it does today.
  | { kind: 'video'; vsl: string };

export interface NurtureCta {
  // 'signup' opens the existing /signup handoff carrying the calculator + result token.
  // 'result'  reopens the secure result page.
  // 'auto'    resolves SERVER-SIDE per lead: a canonically-qualified opportunity-calculator lead is
  //           pointed at the existing launch-call hand-raiser on their own result page; everyone
  //           else falls through to 'signup'. The lead never self-declares the branch, and the
  //           hand-raiser itself re-scores server-side before any founder alert fires, so this only
  //           ever changes which EXISTING surface is linked, never who qualifies.
  kind: 'signup' | 'result' | 'auto';
  // Optional override label. For 'signup' the default is the calculator's continuation CTA.
  label?: string;
  // Label used only when 'auto' resolves to the qualified branch.
  qualifiedLabel?: string;
}

export interface NurtureEmail {
  // Stable, unique id. Also the idempotency key in prospect_nurture_sends (enrollment_id, email_id).
  // Never renumber or reuse an id: a changed id re-sends to everyone mid-sequence.
  id: string;
  phase: NurturePhase;
  // Days after ENROLLMENT. Enrollment happens at calculator capture, where the day-0 transactional
  // result email is already sent by the capture route, so this list starts at day >= 1.
  dayOffset: number;
  // One-line internal statement of what this email is for (shown in admin, not to the lead).
  objective: string;
  subject: string; // may contain {{tokens}}
  preview: string; // inbox preview text; may contain {{tokens}}
  // The banner rendered ABOVE the copy. Required on every v3 email: the founder decision is that
  // nurture is image-led, and a required field is what stops a future email shipping without one.
  art: NurtureArtKey;
  body: NurtureBlock[];
  primaryCta: NurtureCta;
  secondaryCta?: NurtureCta;
}

export interface NurtureSequence {
  version: number;
  emails: NurtureEmail[]; // MUST be sorted by dayOffset ascending
}

// Per-calculator module. Everything a core email needs to become calculator-specific. Any slug not
// given an explicit module derives one from the registry (see calculatorModules.ts), so all tools
// are covered without bespoke copy.
export interface CalculatorModule {
  slug: string;
  featureName: string;
  // One low-effort thing they can do THIS WEEK, tied to what this calculator revealed.
  quickWin: string;
  // The smallest first build inside the CRWN app for this calculator's opportunity.
  firstBuild: string;
  // How the revealed opportunity becomes a real offer (the use-case line).
  useCase: string;
  // The in-app destination for the recommended first action (from the registry conversionTarget).
  destinationRoute: string;
}

// The fully-resolved, already-validated values a renderer interpolates. Every field is a string so
// a missing value is an empty string, never `undefined` printed into an email.
export interface NurtureTokens {
  first_name: string;
  artist_name: string;
  tool_name: string;
  feature_name: string;
  hero_value: string; // formatted display, e.g. "$1,240" or "" when the tool has no dollar
  monthly_value: string; // e.g. "$1,240 a month" or ""
  annual_value: string; // e.g. "$14,880 a year" or ""
  result_url: string;
  signup_url: string;
  cta_label: string;
  unsubscribe_url: string;
}
