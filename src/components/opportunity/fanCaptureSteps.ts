// Pure step model for the Own Your Fans fan-capture builder. Separated from the client component so
// it can be unit-tested (node env) and so the experiment's signup-boundary variant is a pure,
// deterministic transform of the step list rather than logic buried in the component.

export interface FanCaptureStep {
  id: 'goal' | 'copy' | 'capture' | 'preview';
  group: string;
  label: string;
}

export const FAN_CAPTURE_STEPS: FanCaptureStep[] = [
  { id: 'goal', group: 'Plan', label: 'Goal' },
  { id: 'copy', group: 'Plan', label: 'Your words' },
  { id: 'capture', group: 'Plan', label: 'What you collect' },
  { id: 'preview', group: 'Preview', label: 'Preview' },
];

/** The signup boundary variant for the Own Your Fans experience (oyf-signup-timing-v1). */
export type SignupBoundary = 'save' | 'preview';

/**
 * The steps shown BEFORE the save boundary, given the experiment variant.
 *  - 'save' (control): the full flow. The artist sees the finished preview for free, then signs up
 *    to save it. Maximizes value before signup.
 *  - 'preview': the save boundary moves one step earlier. The artist signs up to see/keep the
 *    finished page, so the in-wizard preview is deferred to the post-signup plan page (which still
 *    renders it). Nothing built is lost, only re-timed.
 * Unknown/absent variant falls back to 'save', so the default behavior is unchanged.
 */
export function visibleSteps(signupBoundary: SignupBoundary | null | undefined): FanCaptureStep[] {
  return signupBoundary === 'preview'
    ? FAN_CAPTURE_STEPS.filter((s) => s.id !== 'preview')
    : FAN_CAPTURE_STEPS;
}
