// Live-show scheduling: which poll is the public link showing RIGHT NOW.
//
// WHY THIS EXISTS. A night can hold more than one set. Julius plays two shows and wants
// ONE printed QR code, so the same URL has to resolve to Show 1's ballot before 8pm and
// Show 2's ballot after, without the audience choosing anything and without a second
// link. Song Lab already models that shape: a PROJECT is the night and each DECISION is
// one show's poll, with its own options, its own votes (UNIQUE per fan per decision) and
// its own window. This module is the resolver on top, and nothing else.
//
// TWO RULES THAT MUST NOT DRIFT:
//   1. TIME IS SERVER-SIDE. Every caller passes `now` from the server. A phone with a
//      wrong clock, or a browser in another timezone, can never open a closed poll: the
//      landing page resolves on the server and /api/song-lab/claim re-resolves before it
//      records anything.
//   2. WALL-CLOCK TIMES ARE ZONE-AWARE, NEVER A FIXED OFFSET. "8:00 PM Eastern" in
//      Atlanta is UTC-4 in September and UTC-5 in January. Hardcoding EST would have
//      closed Julius's first show an hour late. Times are stored as UTC instants,
//      converted from a wall time plus an IANA zone id at the moment the artist sets them.

import { effectiveStatus, type SongLabDecisionCore, type DecisionOption } from './core';

/**
 * The form default for the live-show template. It is a DEFAULT, not a rule: the artist
 * picks the zone per event, and nothing in the resolver assumes Eastern.
 */
export const DEFAULT_SHOW_TIMEZONE = 'America/New_York';

/** How far a "keep it open a bit longer" extension pushes the close time, in minutes. */
export const EXTEND_MINUTES = [15, 30, 60] as const;

/* ── Timezone conversion ───────────────────────────────────────────────────── */

/**
 * Offset of `timeZone` at a given instant, in milliseconds east of UTC. Derived from
 * Intl rather than a table, so DST rules come from the platform's own tz database.
 */
export function tzOffsetMs(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
  // Some ICU builds render midnight as hour 24 under hour12:false.
  const hour = Number(map.hour) === 24 ? 0 : Number(map.hour);
  const asIfUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return asIfUtc - utcMs;
}

/** Is this a timezone identifier the platform actually knows? */
export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || !timeZone.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})$/;

/**
 * Turn a wall clock time in a zone ("2026-09-26", "20:00", "America/New_York") into the
 * UTC instant to store. Two passes: guess with the offset at the naive instant, then
 * re-check the offset at the corrected instant, which is what makes DST-boundary times
 * land correctly. Returns null on anything malformed rather than a wrong date.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date | null {
  const d = DATE_RE.exec((date || '').trim());
  const t = TIME_RE.exec((time || '').trim());
  if (!d || !t || !isValidTimeZone(timeZone)) return null;

  const [year, month, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [hour, minute] = [Number(t[1]), Number(t[2])];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;

  const naive = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const firstOffset = tzOffsetMs(naive, timeZone);
  let instant = naive - firstOffset;
  const secondOffset = tzOffsetMs(instant, timeZone);
  if (secondOffset !== firstOffset) instant = naive - secondOffset;

  const result = new Date(instant);
  return Number.isNaN(result.getTime()) ? null : result;
}

/** "8:00 PM" in the given zone. Used for the public "opens at" line and Studio labels. */
export function formatTimeInZone(when: Date | string, timeZone: string): string {
  const d = typeof when === 'string' ? new Date(when) : when;
  if (Number.isNaN(d.getTime()) || !isValidTimeZone(timeZone)) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

/* ── Which poll is live ────────────────────────────────────────────────────── */

/** The fields the resolver needs. A row from song_lab_decisions satisfies this. */
export interface ShowPoll extends SongLabDecisionCore {
  id: string;
  /** The event this poll belongs to. Null only for a legacy single-poll magnet. */
  project_id?: string | null;
  stage_label: string;
  question: string;
  options: DecisionOption[];
}

export type ShowPhase =
  /** One poll is open. This is the ballot the public link renders. */
  | { kind: 'active'; poll: ShowPoll }
  /** Nothing open yet, but a poll is scheduled. The audience is between sets. */
  | { kind: 'between'; nextPoll: ShowPoll; opensAt: string; endedPoll: ShowPoll | null }
  /** Every published poll has closed. The night is over. */
  | { kind: 'ended'; lastPoll: ShowPoll | null }
  /** Nothing published at all: this event has no ballot yet. */
  | { kind: 'none' };

function closesAtMs(p: ShowPoll): number {
  const t = p.closes_at ? new Date(p.closes_at).getTime() : NaN;
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}
function opensAtMs(p: ShowPoll): number {
  const t = p.opens_at ? new Date(p.opens_at).getTime() : NaN;
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/**
 * Resolve which of an event's polls the public page should show at `now`.
 *
 * DRAFTS ARE INVISIBLE: a draft is the artist's scratch space and never reaches a fan,
 * so it cannot make the page say "opens soon" either.
 *
 * When more than one poll is open at once (an artist can always force that by hand), the
 * one closing SOONEST wins, because that is the set currently on stage. Ties break on
 * poll id so the answer is stable across requests rather than flickering between two
 * ballots on refresh.
 */
export function resolveShowPhase(polls: ShowPoll[], now: Date): ShowPhase {
  const published = (polls || []).filter((p) => p && p.status !== 'draft');
  if (!published.length) return { kind: 'none' };

  const withStatus = published.map((p) => ({ poll: p, state: effectiveStatus(p, now) }));

  const open = withStatus.filter((x) => x.state === 'open').map((x) => x.poll);
  if (open.length) {
    const soonest = [...open].sort((a, b) => {
      const d = closesAtMs(a) - closesAtMs(b);
      return d !== 0 ? d : a.id.localeCompare(b.id);
    })[0];
    return { kind: 'active', poll: soonest };
  }

  const scheduled = withStatus.filter((x) => x.state === 'scheduled').map((x) => x.poll);
  const closed = withStatus.filter((x) => x.state === 'closed').map((x) => x.poll);

  if (scheduled.length) {
    const next = [...scheduled].sort((a, b) => {
      const d = opensAtMs(a) - opensAtMs(b);
      return d !== 0 ? d : a.id.localeCompare(b.id);
    })[0];
    const endedPoll = closed.length
      ? [...closed].sort((a, b) => closesAtMs(b) - closesAtMs(a))[0]
      : null;
    return { kind: 'between', nextPoll: next, opensAt: next.opens_at as string, endedPoll };
  }

  if (closed.length) {
    const last = [...closed].sort((a, b) => closesAtMs(b) - closesAtMs(a))[0];
    return { kind: 'ended', lastPoll: last };
  }

  return { kind: 'none' };
}

/* ── Studio labels ─────────────────────────────────────────────────────────── */

export type ScheduleLabel =
  | 'draft'
  | 'scheduled'
  | 'open'
  | 'open_no_end'
  | 'closed_early'
  | 'closed_on_time';

/**
 * What Studio should call this poll's state. The distinction the artist needs is not
 * "who closed it" as a stored flag (which would be a column that can go stale), it is
 * derivable: a poll whose status is closed while its scheduled close is still in the
 * future was closed BY HAND, and one closed at or after its scheduled time ran its
 * course. That keeps override state impossible to desynchronise from reality.
 */
export function scheduleLabel(poll: ShowPoll, now: Date): ScheduleLabel {
  const state = effectiveStatus(poll, now);
  if (state === 'draft') return 'draft';
  if (state === 'scheduled') return 'scheduled';
  if (state === 'open') return poll.closes_at ? 'open' : 'open_no_end';
  // closed
  if (poll.status === 'closed') {
    const scheduledClose = closesAtMs(poll);
    if (scheduledClose === Number.POSITIVE_INFINITY || scheduledClose > now.getTime()) {
      return 'closed_early';
    }
  }
  return 'closed_on_time';
}
