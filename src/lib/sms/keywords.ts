// Inbound SMS keyword routing. Pure: no network, no database, no Twilio.
//
// SCOPE, AND WHY IT IS THIS SMALL. CRWN removed SMS in July 2026 for A2P compliance cost
// and still has no outbound SMS of any kind. This module does NOT bring that back. It
// supports exactly one thing: a person who texts a keyword to CRWN's number gets ONE
// reply containing a link they asked for. That is a user-initiated, single-response
// exchange, not a marketing program, and it enrolls nobody in anything. The free
// membership still only happens when they complete the vote on the web page.
//
// CONSENT BOUNDARY: texting a keyword is consent to receive THAT reply and nothing else.
// Never treat an inbound keyword as opt-in to recurring messages, and never write a
// marketing consent row from here.

/** Keywords the carriers and Twilio own. CRWN must not repurpose or swallow these. */
export const CARRIER_RESERVED = [
  'stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', // opt-out
  'start', 'yes', 'unstop', // opt-in
  'help', 'info', // help
] as const;

export type InboundIntent =
  /** A CRWN keyword we answer. */
  | { kind: 'keyword'; keyword: string }
  /** Carrier-reserved. Twilio's Advanced Opt-Out answers these; CRWN stays silent. */
  | { kind: 'reserved'; word: string }
  /** Anything else. Silence is the correct answer: replying to unknown text turns a
   *  webhook into an echo service and invites abuse. */
  | { kind: 'ignore' };

/**
 * Normalize an inbound message body for matching: trim, collapse whitespace, strip
 * surrounding punctuation and quotes, lowercase. Deliberately NOT fuzzy. "JUBO" matches,
 * " jubo " matches, "Jubo!" matches; "jumbo" and "I want jubo tickets" do not, because a
 * loose match would fire on unrelated conversation.
 */
export function normalizeInbound(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^["'`\p{P}]+|["'`\p{P}]+$/gu, '')
    .trim()
    .toLowerCase();
}

/**
 * Classify an inbound message against the configured keyword set. Exact match only,
 * after normalization.
 */
export function classifyInbound(body: unknown, keywords: string[]): InboundIntent {
  const text = normalizeInbound(body);
  if (!text) return { kind: 'ignore' };

  if ((CARRIER_RESERVED as readonly string[]).includes(text)) {
    return { kind: 'reserved', word: text };
  }
  const hit = keywords.map((k) => k.trim().toLowerCase()).find((k) => k && k === text);
  return hit ? { kind: 'keyword', keyword: hit } : { kind: 'ignore' };
}

/**
 * The reply for a keyword that resolves to a live voting link. Two short lines: what it
 * is and where. Kept under 160 characters where the artist name allows, so it lands as a
 * single SMS segment on every carrier.
 */
export function votingLinkReply(artistName: string, url: string): string {
  const who = (artistName || '').trim() || 'This artist';
  return `Vote for ${who}'s finale here: ${url}\nNo app needed.`;
}

/** The reply when the artist has no vote running. Never send a broken or guessed link. */
export function noActiveVoteReply(artistName: string): string {
  const who = (artistName || '').trim() || 'This artist';
  return `${who} does not have a vote running right now. Try again during the show.`;
}

/**
 * TwiML for a single SMS reply, or an empty response for "say nothing". XML-escaped,
 * because the artist controls part of this string and an unescaped ampersand in a link
 * or a name would produce malformed TwiML that Twilio drops silently.
 */
export function twimlMessage(body: string | null): string {
  if (!body) return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
  const escaped = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
}

/**
 * Format a configured number for display on a flyer: +14045551234 becomes
 * (404) 555-1234. Anything that is not a US 10-digit number is shown as configured
 * rather than mangled.
 */
export function formatSmsNumber(raw: string | null | undefined): string {
  const digits = (raw || '').replace(/\D/g, '');
  const us = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (us.length !== 10) return (raw || '').trim();
  return `(${us.slice(0, 3)}) ${us.slice(3, 6)}-${us.slice(6)}`;
}
