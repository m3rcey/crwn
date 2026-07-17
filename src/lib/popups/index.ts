// Pop-up Engine — server surface. Eligibility, the frequency governor, and event
// recording. All functions take the service-role admin client and are best-effort
// (log-and-degrade, never throw on the hot path). Mirrors the quest-engine shape.

import { POPUPS, popupArmedForPage, getPopup } from './registry';
import type { PopupContext, PopupDef } from './registry';

export * from './registry';

export type PopupAction = 'shown' | 'dismissed' | 'clicked' | 'completed';

interface PopupEventRow {
  popup_key: string;
  action: PopupAction;
  created_at: string;
}

/** Is the Pop-up Engine dark-launch flag on? Reads admin_settings.popup_engine. */
export async function isPopupEngineEnabled(admin: any): Promise<boolean> {
  try {
    const { data } = await admin
      .from('admin_settings')
      .select('value')
      .eq('key', 'popup_engine')
      .maybeSingle();
    return !!data?.value?.enabled;
  } catch {
    return false;
  }
}

function isSameCalendarDay(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate()
  );
}

const TERMINAL: PopupAction[] = ['dismissed', 'clicked', 'completed'];

/**
 * Per-pop-up frequency check against this user's event history.
 * `shown` events count toward caps; a terminal action (dismiss/click/complete)
 * retires the pop-up so we never nag after the user has answered it.
 */
function passesFrequency(def: PopupDef, events: PopupEventRow[], now: Date): boolean {
  const mine = events.filter((e) => e.popup_key === def.key);
  const shownCount = mine.filter((e) => e.action === 'shown').length;
  const actedOn = mine.some((e) => TERMINAL.includes(e.action));

  switch (def.frequency.type) {
    case 'once':
      return mine.length === 0;
    case 'max':
      return !actedOn && shownCount < def.frequency.max;
    case 'everyN': {
      if (actedOn) {
        // For repeating surveys we allow re-asking after the interval even once
        // completed; for one-shot nudges a terminal action retires them. Surveys
        // opt back in by having max and a long interval; a click/dismiss on a
        // nudge should stop it. Treat any terminal action as retirement EXCEPT
        // when the pop-up is a survey (which is meant to recur).
        if (def.kind !== 'survey') return false;
      }
      if (def.frequency.max != null && shownCount >= def.frequency.max) return false;
      const lastShown = mine
        .filter((e) => e.action === 'shown')
        .map((e) => new Date(e.created_at).getTime())
        .sort((a, b) => b - a)[0];
      if (lastShown == null) return true;
      const daysSince = (now.getTime() - lastShown) / 86_400_000;
      return daysSince >= def.frequency.days;
    }
    default:
      return false;
  }
}

/**
 * Resolve the single highest-priority pop-up this user should see on `pathname`,
 * or null. Enforces the global governor: if the user has already been shown ANY
 * pop-up today, return null (one interruption per day, period).
 */
export async function eligiblePopupFor(
  admin: any,
  ctx: PopupContext,
  pathname: string,
): Promise<PopupDef | null> {
  try {
    if (ctx.role === 'admin') return null; // never interrupt the founder

    const since = new Date(Date.now() - 120 * 86_400_000).toISOString();
    const { data } = await admin
      .from('popup_events')
      .select('popup_key, action, created_at')
      .eq('user_id', ctx.userId)
      .gte('created_at', since);
    const events: PopupEventRow[] = data ?? [];

    // Global governor: at most one shown pop-up per calendar day.
    const now = new Date();
    const shownToday = events.some((e) => e.action === 'shown' && isSameCalendarDay(e.created_at, now));
    if (shownToday) return null;

    const candidates = POPUPS.filter(
      (def) =>
        popupArmedForPage(def, pathname) &&
        safeAudience(def, ctx) &&
        passesFrequency(def, events, now),
    ).sort((a, b) => b.priority - a.priority);

    return candidates[0] ?? null;
  } catch (err) {
    console.error('[popups] eligiblePopupFor failed:', err);
    return null;
  }
}

function safeAudience(def: PopupDef, ctx: PopupContext): boolean {
  try {
    return def.audience(ctx);
  } catch {
    return false;
  }
}

/** Record a pop-up interaction. Best-effort; a failed insert never blocks the UI. */
export async function recordPopupEvent(
  admin: any,
  userId: string,
  popupKey: string,
  action: PopupAction,
): Promise<void> {
  if (!getPopup(popupKey)) return;
  try {
    await admin.from('popup_events').insert({ user_id: userId, popup_key: popupKey, action });
  } catch (err) {
    console.error('[popups] recordPopupEvent failed:', err);
  }
}

/**
 * Store a pop-up survey answer (1-5 + optional feedback). Upserts one row per
 * (user, popup). Returns the stored rating so the caller can decide whether to
 * fire a low-score alert.
 */
export async function recordSurveyResponse(
  admin: any,
  userId: string,
  popupKey: string,
  rating: number,
  feedback: string | null,
): Promise<void> {
  const clamped = Math.max(1, Math.min(5, Math.round(rating)));
  try {
    await admin
      .from('popup_survey_responses')
      .upsert(
        { user_id: userId, popup_key: popupKey, rating: clamped, feedback: feedback || null },
        { onConflict: 'user_id,popup_key' },
      );
  } catch (err) {
    console.error('[popups] recordSurveyResponse failed:', err);
  }
}
