// Shared types for the prospect nurture system.
//
// The CONTENT is code, versioned in git (like the quest catalog). These types describe one
// versioned universal core sequence plus per-calculator modules. Nothing here does I/O, imports a
// React component, or holds a secret: it is pure, client-safe data + pure render helpers.
//
// Financial numbers are NEVER computed here. They are read from a stored result's result_data
// (the deterministic calculator output) and passed in as already-formatted strings.

export type NurturePhase =
  | 'delivery' //     P1  days 0-3     deliver + immediate momentum
  | 'belief' //       P2  days 4-14    problem awareness + belief building
  | 'education' //    P3  weeks 3-6    practical education + quick wins
  | 'objections' //   P4  weeks 8-12   handle the fragmented-stack objections
  | 'mechanism' //    P5  months 3-4   how consolidation actually works
  | 'proof' //        P6  months 5-6   transparent walkthroughs + identity
  | 'reengagement' // P7  months 7-9   reintroduce the result, ask the blocker
  | 'authority'; //   P8  months 10-12 cost of delay, one-year contrast, final invite
// P9 evergreen (a low-frequency post-12-month track) slots in later as more emails with larger
// dayOffsets, or as a behavior-triggered branch, without any schema change.

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
  | { kind: 'numberOrFallback'; withNumber: string; withoutNumber: string };

export interface NurtureCta {
  // 'signup' opens the existing /signup handoff carrying the calculator + result token.
  // 'result' reopens the secure result page. 'route' deep-links a specific app route (post-signup).
  kind: 'signup' | 'result';
  // Optional override label. For 'signup' the default is the calculator's continuation CTA.
  label?: string;
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
