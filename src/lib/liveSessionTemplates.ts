// Live-session templates (release strategy spec, section 28.5).
//
// The live form was a blank page, and a blank page is exactly what the spec says
// to avoid: fans have to be TRAINED into paid live sessions (free check-ins
// teach the habit, paid rooms sell the access), and the artist should not have
// to invent the format each time. A template is a PREFILL, nothing more: it
// fills the fields the form already has, and the artist edits everything.
//
// Only fields the live form actually supports appear here. No promo timelines,
// no reminder schedules: those belong to campaigns and the Promise Calendar.

export interface LiveSessionTemplate {
  key: string;
  /** Dropdown label. */
  name: string;
  /** Dropdown hint: what this session is for, duration and cadence included. */
  hint: string;
  /** Prefilled session title (the artist renames freely). */
  title: string;
  /** Prefilled description: the suggested agenda, artist-editable. */
  agenda: string;
  /** Who gets in. 'everyone' = free session; 'paid' = all paid tiers; 'top' = highest tier only. */
  audience: 'everyone' | 'paid' | 'top';
  /** Suggested capacity (small rooms are the product for high tiers). Null = leave the form default. */
  maxSlots: number | null;
  /** Executive Producer Session: pre-wires fan submissions (only offered when the flag is on). */
  producerSession?: boolean;
  submissionPrompt?: string;
}

export const LIVE_SESSION_TEMPLATES: LiveSessionTemplate[] = [
  {
    key: 'free_check_in',
    name: 'Free Monthly Check-In',
    hint: 'Free for everyone, 20 to 45 minutes, same time every month. This trains the live habit.',
    title: 'Monthly Check-In',
    agenda: 'A casual monthly hang: what I am working on, what is coming next, and your questions. Free for everyone, every month, same place.',
    audience: 'everyone',
    maxSlots: null,
  },
  {
    key: 'listening_party',
    name: 'Private Listening Party',
    hint: 'Paid members, 45 to 90 minutes. First listens are the clearest reason to be a member.',
    title: 'Private Listening Party',
    agenda: 'Members-only first listen. We play it top to bottom, then talk about it: what you heard, what surprised you, what you want more of.',
    audience: 'paid',
    maxSlots: null,
  },
  {
    key: 'studio_session',
    name: 'Studio Session',
    hint: 'Paid members, 45 to 90 minutes. The process is the product: let members watch it happen.',
    title: 'In the Studio',
    agenda: 'Working session, cameras on. Watch the track come together, hear the takes that do not make it, and drop your reactions live.',
    audience: 'paid',
    maxSlots: null,
  },
  {
    key: 'track_breakdown',
    name: 'Track Breakdown',
    hint: 'Paid members, about 45 minutes. One song, taken apart layer by layer.',
    title: 'Track Breakdown',
    agenda: 'One track, taken apart: the story, the stems, the decisions. Bring questions; this is the session where nothing is a secret.',
    audience: 'paid',
    maxSlots: null,
  },
  {
    key: 'release_night',
    name: 'Release-Night Live',
    hint: 'Paid members on release day, 45 to 60 minutes. The drop becomes an event, not a link.',
    title: 'Release Night',
    agenda: 'It is out. We play it together first, then the stories behind every track and what almost did not make it. Release day belongs to members.',
    audience: 'paid',
    maxSlots: null,
  },
  {
    key: 'member_qa',
    name: 'Member Q&A',
    hint: 'Paid members, 30 to 60 minutes. Ask anything; proximity is the perk.',
    title: 'Member Q&A',
    agenda: 'No agenda but yours: career, process, the business, the music. Members ask, I answer.',
    audience: 'paid',
    maxSlots: null,
  },
  {
    key: 'executive_producer',
    name: 'Executive Producer Session',
    hint: 'Top tier, small room, monthly or quarterly. Fans help shape the next release.',
    title: 'Executive Producer Session',
    agenda: 'Small room, real decisions. Hear the candidates, vote between versions, and weigh in on what gets finished next. Your name is on this one.',
    audience: 'top',
    maxSlots: 20,
    producerSession: true,
    submissionPrompt: 'Send the idea you want in the room: a beat, a hook, a reference, or the question you want answered about the next release.',
  },
];

export function liveTemplate(key: string): LiveSessionTemplate | undefined {
  return LIVE_SESSION_TEMPLATES.find((t) => t.key === key);
}

/**
 * Resolve a template's audience to tier ids against the artist's real ladder.
 * 'top' means the single highest-priced paid tier (the small-room, high-touch
 * audience); 'paid' means every paid tier; 'everyone' selects none (free).
 */
export function audienceTierIds(
  audience: LiveSessionTemplate['audience'],
  tiers: { id: string; price: number }[],
): string[] {
  const paid = tiers.filter((t) => t.price > 0).sort((a, b) => b.price - a.price);
  if (audience === 'everyone' || paid.length === 0) return [];
  if (audience === 'top') return [paid[0].id];
  return paid.map((t) => t.id);
}
