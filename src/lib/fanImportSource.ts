// Where an imported contact list came from, as a single tag applied to the whole file.
//
// This exists because of the launch order that actually works: proven buyers first, then engaged
// known fans, then the wider owned audience, then social. CRWN could already TARGET a contact tag
// in a campaign, and /api/fan-contacts/import already ACCEPTED tags, but only the Patreon path
// ever wrote one. So a CSV of merch or ticket buyers arrived indistinguishable from a cold email
// list, and the first and most important audience in a membership launch could not be assembled.
//
// The values are deliberately about EVIDENCE OF DEMAND, not about file provenance. "Where did you
// get this CSV" is a question about the artist's tooling; "have these people paid you before" is
// the question that decides who gets the offer first.
//
// These strings are stored on fan_contacts and read back by the campaign composer's tag picker.
// Treat them as identifiers: renaming one orphans every contact already tagged with it.

export interface ImportSourceOption {
  value: string;
  label: string;
  hint?: string;
}

export const IMPORT_SOURCE_OPTIONS: ImportSourceOption[] = [
  {
    value: '',
    label: 'No label',
    hint: 'Import without tagging. You can still email the whole list.',
  },
  {
    value: 'proven-buyers',
    label: 'People who bought from me before',
    hint: 'The strongest evidence there is. This group hears about a new offer first.',
  },
  {
    value: 'ticket-buyers',
    label: 'Ticket buyers',
    hint: 'Paid to be in the room. Proximity already has value to them.',
  },
  {
    value: 'merch-buyers',
    label: 'Merch buyers',
    hint: 'Paid for an object. They have crossed the line from following to buying.',
  },
  {
    value: 'paying-elsewhere',
    label: 'Already paying me somewhere else',
    hint: 'Patreon, a private community, a subscription. Closest to a membership already.',
  },
  {
    value: 'email-list',
    label: 'Email list, no purchase yet',
    hint: 'They opted in but have not bought. They come after the buyers.',
  },
];

/** The tags that mean "this person has already exchanged money with the artist". */
export const PROVEN_BUYER_TAGS: readonly string[] = [
  'proven-buyers',
  'ticket-buyers',
  'merch-buyers',
  'paying-elsewhere',
];

/** True when a contact's tags carry evidence of a past purchase. */
export function hasProvenBuyerTag(tags: string[] | null | undefined): boolean {
  if (!tags || tags.length === 0) return false;
  return tags.some((t) => PROVEN_BUYER_TAGS.includes(t));
}
