// Slot maths for the social publishing queue: local wall clock in, absolute UTC instants out.
//
// This lives beside its only consumer (scripts/queue-carousels.mjs) rather than in src/, because
// a .mjs cannot be imported from TypeScript and duplicating DST-sensitive arithmetic into two
// files is exactly how a tested function and a running function come to disagree. The server half
// (isDue, the grace window) is in src/lib/social/schedule.ts. Both are covered by
// src/lib/social/schedule.test.ts.
//
// THE WHOLE REASON THIS EXISTS. Vercel crons fire on UTC, and a fixed UTC cron drifts by an hour
// twice a year when the founder's clock changes. So the cron is NOT the schedule: it is a dumb
// tick that asks "is anything due". The schedule is social_posts.scheduled_for, an absolute UTC
// instant computed HERE from the wall-clock time the founder actually typed. Daylight saving then
// becomes a non-event, because the conversion happened once, at queue time, against the real
// offset for that specific date.

/** The founder's wall clock. The repo already uses this zone for live show scheduling. */
export const DEFAULT_TIME_ZONE = 'America/New_York';

/**
 * The offset, in milliseconds, between a zone's local wall clock and UTC at a given instant.
 * Uses Intl rather than a date library, so it stays correct across DST changes with no dependency
 * and no table to maintain.
 */
function zoneOffsetMs(instant, timeZone) {
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
  const parts = dtf.formatToParts(instant);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  // Interpreting the zone's wall clock AS IF it were UTC gives local-minus-UTC directly.
  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second')
  );
  return asIfUtc - instant.getTime();
}

/**
 * Convert a local wall-clock time in a zone to the absolute UTC instant.
 *
 * Two passes, which is not an optimisation but a correctness requirement: the offset depends on
 * the instant, and the instant depends on the offset. One pass is wrong for times near a DST
 * boundary. The second pass re-reads the offset at the candidate instant and settles it.
 */
export function zonedWallClockToUtc(year, month, day, hour, minute, timeZone = DEFAULT_TIME_ZONE) {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const firstPass = naive - zoneOffsetMs(new Date(naive), timeZone);
  const secondPass = naive - zoneOffsetMs(new Date(firstPass), timeZone);
  return new Date(secondPass);
}

/** Parse "HH:MM" strictly. Returns null rather than guessing at malformed input. */
export function parseWallClock(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/** Parse "YYYY-MM-DD" strictly. */
export function parseDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? '').trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/**
 * Spread `count` posts evenly from `start` to `end` on `date`, inclusive of BOTH ends.
 *
 * Inclusive of both ends is the behaviour that matches how a person says it: "10 posts from 9am
 * to noon" means the first lands at 9:00 and the last at 12:00, which is one every 20 minutes.
 * Dividing by `count` instead of `count - 1` would put the last post at 11:42 and quietly
 * contradict the request.
 */
export function buildSlots(req) {
  const errors = [];
  const timeZone = req.timeZone || DEFAULT_TIME_ZONE;

  const d = parseDate(req.date);
  if (!d) errors.push(`date must be YYYY-MM-DD, got "${req.date}"`);

  const s = parseWallClock(req.start);
  if (!s) errors.push(`start must be HH:MM, got "${req.start}"`);

  const count = Number(req.count);
  if (!Number.isInteger(count) || count < 1) {
    errors.push(`count must be a positive whole number, got "${req.count}"`);
  }

  let e = null;
  if (count > 1) {
    if (!req.end) {
      errors.push('end is required when scheduling more than one post');
    } else {
      e = parseWallClock(req.end);
      if (!e) errors.push(`end must be HH:MM, got "${req.end}"`);
    }
  }

  if (errors.length || !d || !s) return { ok: false, errors, slots: [], spacingMinutes: null };

  const first = zonedWallClockToUtc(d.year, d.month, d.day, s.hour, s.minute, timeZone);

  if (count === 1) return { ok: true, errors: [], slots: [first], spacingMinutes: null };

  const last = zonedWallClockToUtc(d.year, d.month, d.day, e.hour, e.minute, timeZone);
  if (last.getTime() <= first.getTime()) {
    return {
      ok: false,
      errors: [`end (${req.end}) must be after start (${req.start})`],
      slots: [],
      spacingMinutes: null,
    };
  }

  const spanMs = last.getTime() - first.getTime();
  const stepMs = spanMs / (count - 1);
  const slots = [];
  for (let i = 0; i < count; i++) {
    // Round to the minute. A schedule with seconds in it is noise nobody asked for, and it makes
    // the queue harder to read.
    slots.push(new Date(Math.round((first.getTime() + stepMs * i) / 60000) * 60000));
  }

  return { ok: true, errors: [], slots, spacingMinutes: Math.round(stepMs / 60000) };
}

/** Render an instant in the founder's zone, for confirmation output. */
export function formatInZone(instant, timeZone = DEFAULT_TIME_ZONE) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).format(instant);
}
