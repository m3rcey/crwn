// The first honesty rule a raw Tier Offer Experience config breaks, in the artist's words.
// Shared by the publish route (so a refusal names the decision to go back to) and the guided
// flow (so the artist sees it before pressing publish). Null when the config passes.

import { isBenefitCta } from './normalize';

export function refusalReason(raw: unknown, tierName: string): string | null {
  if (!raw || typeof raw !== 'object') return 'The page is empty.';
  const r = raw as Record<string, unknown>;
  const promise = typeof r.promise === 'string' ? r.promise.trim() : '';
  const description = typeof r.description === 'string' ? r.description.trim() : '';
  const cta = typeof r.cta === 'string' ? r.cta.trim() : '';
  if (!promise) return 'Write the promise: what a fan gets by joining.';
  if (!description) return 'Add a line or two under the promise.';
  if (!cta) return 'Write the button.';
  if (!isBenefitCta(cta, tierName)) return 'The button has to say what the fan gets, not "Join" or the tier name.';
  if (Array.isArray(r.previews)) {
    for (const p of r.previews) {
      const truth = (p as Record<string, unknown>)?.truth;
      if (truth !== 'real' && truth !== 'example') return 'Every preview has to say whether it is real or an example.';
    }
  }
  return null;
}
