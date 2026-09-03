// followupSteps.ts: the PURE step model for "Follow up with fans who do not buy yet".
//
// CRWN drafts a starter free-join sequence from facts (src/lib/sequences/freeJoinStarter.ts);
// the artist reviews the shape, personalizes each message, and switches it on. The trigger,
// the conversion goal and the funnel pointer are never asked: they are known.

import type { StarterStep } from '@/lib/sequences/freeJoinStarter';

export type FollowupStepKey = 'shape' | 'message' | 'review';

export interface FollowupStepDef {
  key: FollowupStepKey;
  /** For message screens, which message (0-based). */
  messageIndex?: number;
  group: string;
  title: string;
  subtitle: string;
}

export interface FollowupState {
  steps: StarterStep[];
  primaryTierName: string;
  /** True when an active free-join sequence with messages already exists (edit, not create). */
  existing: boolean;
}

export function visibleSteps(s: FollowupState): FollowupStepDef[] {
  const out: FollowupStepDef[] = [
    {
      key: 'shape',
      group: 'The shape',
      title: 'What should fans hear if they love the free thing but are not ready to pay?',
      subtitle: `Five short messages over two weeks, to everyone who joins free. They stop the moment someone buys ${s.primaryTierName}.`,
    },
  ];
  s.steps.forEach((m, i) => {
    out.push({
      key: 'message',
      messageIndex: i,
      group: 'Make it yours',
      title: `Message ${i + 1} of ${s.steps.length}: day ${m.delay_days}`,
      subtitle: 'CRWN filled in the facts. Change anything so it sounds like you.',
    });
  });
  out.push({
    key: 'review',
    group: 'Turn it on',
    title: s.existing ? 'Update and keep it on' : 'Turn it on',
    subtitle: 'From now on, every fan who joins free through your funnel hears from you.',
  });
  return out;
}

export function canContinue(step: FollowupStepDef, s: FollowupState): boolean {
  if (step.key === 'message' && typeof step.messageIndex === 'number') {
    const m = s.steps[step.messageIndex];
    return !!m && m.subject.trim().length > 0 && m.body.trim().length > 0;
  }
  if (step.key === 'review') return s.steps.length > 0 && s.steps.every((m) => m.subject.trim() && m.body.trim());
  return true;
}

/** An existing, whole sequence resumes at review; a fresh one starts at the shape. */
export function resumeIndex(steps: FollowupStepDef[], s: FollowupState): number {
  if (s.existing && canContinue(steps[steps.length - 1], s)) return steps.length - 1;
  const firstEmpty = steps.findIndex((st) => st.key === 'message' && !canContinue(st, s));
  return firstEmpty >= 0 ? firstEmpty : 0;
}
