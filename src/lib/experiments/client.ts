// Client experiment entry. Records ELIGIBILITY ('assigned') and EXPOSURE ('exposed') for an
// experience, deduped locally so each fires once per browser. The server derives the variant from
// the durable anon id (the client never chooses its arm) and no-ops entirely when no experiment is
// running, so this is inert by default and changes nothing for visitors.

import { getAnonId, isLikelyBot } from './anonId';

const firedKey = (experienceKey: string, event: string) => `crwn_exp_${experienceKey}_${event}`;

async function post(aid: string, experienceKey: string, eventName: string, dims?: Record<string, string | undefined>) {
  try {
    const res = await fetch('/api/experiments/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aid, experienceKey, eventName, dims }),
      keepalive: true,
    });
    return await res.json().catch(() => ({ active: false }));
  } catch {
    return { active: false };
  }
}

/**
 * Record entry into an experience. Fires 'assigned' then 'exposed' once each. Returns the assigned
 * variant (or null / holdout) so a caller MAY render a variant, though the foundation does not yet
 * change any rendering. Safe to call on every result view: local dedup + server dedup collapse repeats.
 */
export async function recordExperimentEntry(
  experienceKey: string,
  dims?: Record<string, string | undefined>,
): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  if (isLikelyBot()) return null; // exclude obvious automation from exposure
  const aid = getAnonId();
  if (!aid) return null;

  try {
    if (!localStorage.getItem(firedKey(experienceKey, 'assigned'))) {
      const r = await post(aid, experienceKey, 'assigned', dims);
      localStorage.setItem(firedKey(experienceKey, 'assigned'), '1');
      if (!r?.active) return null; // no experiment running -> nothing to expose
    }
    if (!localStorage.getItem(firedKey(experienceKey, 'exposed'))) {
      const r = await post(aid, experienceKey, 'exposed', dims);
      localStorage.setItem(firedKey(experienceKey, 'exposed'), '1');
      return r?.variant ?? null;
    }
  } catch {
    /* never break the experience */
  }
  return null;
}

/**
 * Record a post-signup OUTCOME for the visitor's experience, tagged with their variant. The same
 * durable `aid` (cookie) that was exposed pre-signup is sent again; the server RE-DERIVES the variant
 * (never trusted) and, because the caller is now authenticated, stamps `user_id` from the session.
 * This is what closes the loop so a variant's exposure can be compared to its outcome. `eventName`
 * must be a taxonomy event (e.g. 'signup_completed'). Deduped once per browser per event, and again
 * server-side by `aid:experiment:event`. Inert when no experiment is running.
 */
export async function recordExperimentOutcome(
  experienceKey: string,
  eventName: string,
  dims?: Record<string, string | undefined>,
): Promise<void> {
  if (typeof window === 'undefined') return;
  const aid = getAnonId();
  if (!aid) return;
  try {
    if (localStorage.getItem(firedKey(experienceKey, eventName))) return;
    await post(aid, experienceKey, eventName, dims);
    localStorage.setItem(firedKey(experienceKey, eventName), '1');
  } catch {
    /* never break the flow */
  }
}
