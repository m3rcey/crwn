// The live-show template: the boilerplate an artist should never retype.
//
// Running the same experiment every week means only two things actually change: WHICH
// SHOW (venue and date) and WHICH SONGS. Everything else (the project title, the stage
// label, the question, the public headline, the supporting line, the benefit kind, the
// close times) is the same night after night, so it is generated here and merely
// confirmed in the form.
//
// Nothing in this file is artist-specific. The copy interpolates whatever name the
// artist's profile carries, and the times are FORM DEFAULTS for this template, editable
// per event. There is no Julius branch anywhere in CRWN.

import { slugify } from '@/lib/slugify';

/** Default close times for a two-set night, as local wall clock in the event's zone. */
export const DEFAULT_SHOW_TIMES = [
  { label: 'Show 1', closesAt: '20:00' },
  { label: 'Show 2', closesAt: '23:00' },
] as const;

/** Longest event name we will accept, matching the offer name column's practical limit. */
export const MAX_EVENT_NAME = 80;

/**
 * The artist's first name, for copy that reads like a person wrote it. Falls back to the
 * whole name, then to a neutral noun, so a single-word or missing name never produces
 * "What should  sing for the finale?".
 */
export function artistFirstName(displayName: string | null | undefined): string {
  const n = (displayName || '').trim();
  if (!n) return 'the artist';
  return n.split(/\s+/)[0];
}

export interface LiveShowDefaults {
  projectTitle: string;
  stageLabels: string[];
  question: string;
  headline: string;
  description: string;
  benefitKind: 'vote';
  offerName: string;
  offerSlug: string;
}

/**
 * Everything the create form should arrive pre-filled with. `eventName` is the ONE thing
 * the artist types first (e.g. "St. James Live Sept 26"); the internal magnet name and
 * the link slug derive from it, so the link is self-describing per show without anyone
 * naming it twice.
 */
export function liveShowDefaults(displayName: string | null | undefined, eventName: string): LiveShowDefaults {
  const first = artistFirstName(displayName);
  const name = (eventName || '').trim();
  const offerName = name ? `${name} Finale Vote` : '';
  return {
    projectTitle: name || 'Live Show',
    stageLabels: DEFAULT_SHOW_TIMES.map((s) => s.label),
    question: `What should ${first} sing for the finale?`,
    headline: 'YOU PICK THE FINALE',
    description: `You're part of the show. Vote for what ${displayName || first} should sing to close the night.`,
    benefitKind: 'vote',
    offerName,
    // The link is derived, never typed: a printed QR points at it forever, so it must be
    // stable and it must not depend on anyone retyping punctuation the same way twice.
    offerSlug: name ? slugify(name).slice(0, 60) : '',
  };
}

/** A show as submitted by the create form. */
export interface LiveShowInput {
  label: string;
  /** 2 to 4 song titles. */
  options: string[];
  /** Local wall time, "HH:MM", in the event's timezone. */
  opensAt?: string | null;
  closesAt?: string | null;
}

/**
 * Validate the shows as a set. Two rules the UI cannot be trusted to hold:
 * every show needs a real ballot, and their windows must not overlap, because two open
 * polls behind one URL means the audience's vote lands somewhere they cannot predict.
 */
export function validateShowWindows(shows: LiveShowInput[]): string | null {
  if (!shows.length) return 'Add at least one show';
  if (shows.length > 4) return 'Four shows in one night is the maximum';

  for (const show of shows) {
    const songs = (show.options || []).map((o) => (o || '').trim()).filter(Boolean);
    if (songs.length < 2) return `${show.label || 'Each show'} needs at least 2 songs`;
    if (songs.length > 4) return `${show.label || 'Each show'} can have at most 4 songs`;
  }

  const timed = shows
    .map((s, i) => ({ i, label: s.label, opens: s.opensAt || null, closes: s.closesAt || null }))
    .filter((s) => s.closes);

  for (let a = 0; a < timed.length; a++) {
    for (let b = a + 1; b < timed.length; b++) {
      const first = timed[a].closes! <= timed[b].closes! ? timed[a] : timed[b];
      const second = first === timed[a] ? timed[b] : timed[a];
      // The later show must not be open while the earlier one is still running.
      if (second.opens && second.opens < first.closes!) {
        return `${second.label} opens before ${first.label} closes. Two votes cannot run at once behind one link.`;
      }
      if (!second.opens) {
        return `${second.label} needs an opening time, or it would run at the same time as ${first.label}.`;
      }
    }
  }
  return null;
}
