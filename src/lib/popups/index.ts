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

/**
 * The served copy for the resume prompt, NAMING the goal instead of alluding to it.
 *
 * Why this is safe against the 2026-08-11 correction (see the long comment in registry.ts):
 * that correction bans claiming the artist STARTED or ABANDONED something, because quest
 * progress is derived from DomainChecks over live database state and proves no such thing.
 * A goal's TITLE and its percentage are both facts on the row. Repeating a fact is not the
 * banned claim, and the sentence has to stay true at 4% and at 90%, so it says how far along
 * the goal is and never how far along the ARTIST is.
 *
 * Pure and total: it takes the resumable snapshot and returns copy. No client, no lookup.
 */
export function resumeCopyFor(resumable: { title: string; progressPercent: number }): {
  title: string;
  body: string;
} {
  // Quest titles are short by convention, but they are stored text rendered into a modal
  // heading, so cap them rather than trusting the convention to hold.
  const raw = (resumable.title || '').trim();
  const name = raw.length > 70 ? `${raw.slice(0, 69).trimEnd()}…` : raw;
  // Clamp defensively: the query already selects 0 < progress < 100, but this function is
  // pure and must not print "0% done" or "120% done" if that ever changes upstream.
  const pct = Math.min(99, Math.max(1, Math.round(resumable.progressPercent || 0)));

  if (!name) {
    return {
      title: 'One goal is close to done.',
      body: 'A goal you are partway through is still short of the line. Progress that stops short pays you nothing, and finishing the closest one costs less than starting something new.',
    };
  }

  return {
    title: `Finish this: ${name}`,
    body: `This goal is ${pct}% of the way there, and the last stretch is the only part that pays. Nothing is earned for a goal that stalls at ${pct}%, and finishing this one costs less than starting something new.`,
  };
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
/**
 * "We changed X" is only news to accounts that lived through X being different.
 * A def carrying `announcedAt` is skipped for any account created on/after that
 * date: those users met the current product at signup. Enforced HERE, once, so
 * no announcement def can forget it. Missing created_at fails open (show), so a
 * read hiccup can only over-inform, never silently drop a legal notice.
 */
function announcementApplies(def: PopupDef, ctx: PopupContext): boolean {
  if (!def.announcedAt || !ctx.accountCreatedAt) return true;
  const created = new Date(ctx.accountCreatedAt).getTime();
  const announced = new Date(def.announcedAt).getTime();
  if (Number.isNaN(created) || Number.isNaN(announced)) return true;
  return created < announced;
}

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
        announcementApplies(def, ctx) &&
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
