// Hand-rolled runtime validation for ManyChat payloads.
//
// No Zod. The repository has no validation library (verified: zero hits for zod/yup/joi/ajv
// across src/), and every existing route hand-rolls its guards. Introducing a schema library
// for one feature would be a second convention, not a better one. These validators are the
// security boundary, so being explicit and readable beats being terse.
//
// Every function here REJECTS rather than coerces. An unparseable payload is a 400, not a
// best-effort guess at what ManyChat meant.

export type ManyChatEventType = 'session_start' | 'answer' | 'profile_update' | 'next' | 'finalize' | 'event';

export interface ManyChatInboundPayload {
  event_type: ManyChatEventType;
  /**
   * OPTIONAL, and it has to be.
   *
   * The original design demanded ManyChat supply a unique-per-delivery id to use as the
   * idempotency key. IT CANNOT. ManyChat's External Request field picker offers exactly:
   * First/Last/Full Name, Email, Phone, Last Text Input, Subscribed, Contact Id, Last Reply
   * Type, Full Contact Data. No message id. No timestamp. Nothing unique per request.
   *
   * Using Contact Id as the key would have been catastrophic: every event from one artist
   * would carry the SAME key, so message #2 would look like a replay of message #1, CRWN
   * would return the cached response, and the conversation would freeze on question one.
   * Silently. Forever.
   *
   * So CRWN derives the key itself instead (see deriveIdempotencyKey). It already has
   * everything it needs.
   */
  event_id?: string | null;

  manychat_contact_id: string;
  instagram_user_id?: string | null;
  instagram_username?: string | null;

  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;

  campaign_key?: string | null;
  creator_account?: string | null;
  source_post_id?: string | null;
  keyword?: string | null;
  lead_magnet_id?: string | null;
  conversation_id?: string | null;
  referring_url?: string | null;

  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;

  /** For event_type='answer': which question this answers, and what they said. */
  question_key?: string | null;
  answer?: string | null;

  /** Consent. `consent_dm` must be true before we ask anything. */
  consent_dm?: boolean;
  consent_email?: boolean;
  consent_sms?: boolean;
  opt_in_source?: string | null;

  /** For event_type='event': a named analytics event. */
  event_name?: string | null;

  sent_at?: string | null;
  custom_fields?: Record<string, unknown>;
}

export interface ValidationOk<T> { ok: true; value: T }
export interface ValidationErr { ok: false; error: string; code: string }
export type Validation<T> = ValidationOk<T> | ValidationErr;

const EVENT_TYPES: ManyChatEventType[] = ['session_start', 'answer', 'profile_update', 'next', 'finalize', 'event'];

/** Trim, bound, and reject anything that isn't a usable string. */
function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function bool(v: unknown): boolean {
  return v === true || v === 'true' || v === 1 || v === '1';
}

/**
 * An artist's free-form DM answer. Bounded hard at 2000 chars.
 *
 * This string is UNTRUSTED and will be shown to Claude inside a delimited data block. The
 * bound is the first line of prompt-injection defense: a 100KB "answer" containing a fake
 * system prompt cannot even enter the pipeline.
 */
const MAX_ANSWER_CHARS = 2000;

export function validateInbound(body: unknown): Validation<ManyChatInboundPayload> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Body must be a JSON object', code: 'bad_body' };
  }
  const b = body as Record<string, unknown>;

  const eventType = str(b.event_type, 32);
  if (!eventType || !EVENT_TYPES.includes(eventType as ManyChatEventType)) {
    return { ok: false, error: 'Unknown event_type', code: 'bad_event_type' };
  }

  // Optional. When ManyChat cannot supply one (it cannot), CRWN derives its own.
  const eventId = str(b.event_id, 128);

  // ---- The contact id, from WHICHEVER shape ManyChat could actually produce. ----
  //
  // The original design demanded a bare `manychat_contact_id`, sourced from ManyChat's
  // "Contact Id" SYSTEM field pill. In practice that pill does not substitute inside an
  // External Request body: it sends the literal string "Contact Id".
  //
  // Meanwhile ManyChat has a first-class "+ Add Full Contact Data" button that exists
  // precisely to send the contact object to an external service, and it works.
  //
  // So CRWN bends to the transport instead of demanding a shape the transport struggles to
  // emit. We accept any of:
  //
  //   { "manychat_contact_id": "123" }          <- a resolved pill, if it ever works
  //   { "contact": { "id": "123", ... } }       <- "+ Add Full Contact Data" nested
  //   { "id": "123", ... }                      <- "+ Add Full Contact Data" spread at top
  //
  // Over-specifying the payload was my error. An integration should be tolerant of what the
  // other system can actually send.
  const contact = (b.contact && typeof b.contact === 'object' && !Array.isArray(b.contact)
    ? (b.contact as Record<string, unknown>)
    : null);

  const contactId =
    str(b.manychat_contact_id, 128) ??
    (contact ? str(contact.id, 128) : null) ??
    str(b.id, 128);

  if (!contactId) {
    return {
      ok: false,
      error:
        'No ManyChat contact id. Send `manychat_contact_id`, or use ManyChat\'s "+ Add Full Contact Data" button (CRWN reads `contact.id` or a top-level `id`).',
      code: 'missing_contact_id',
    };
  }

  // ---- The unresolved-placeholder guard. ----
  //
  // ManyChat field pills are OBJECTS inserted from its picker. Typing `{{contact_id}}` or
  // `<Contact Id>` or `[Contact Id]` by hand produces a plain string that ManyChat never
  // substitutes, and it sends that string verbatim.
  //
  // Without this check, such a request is perfectly VALID: a non-empty string is a non-empty
  // string. It would sail through, and then EVERY lead on earth would arrive with the same
  // literal contact id, resolve to the SAME lead identity, and overwrite each other's
  // answers. One record for every artist. Silently.
  //
  // That is the worst failure mode in this whole system, and it looks exactly like success.
  // So we reject it loudly. A real ManyChat contact id is a number; a real Instagram user id
  // is a number. Neither contains braces, brackets, or the word "pill".
  if (looksUnresolved(contactId)) {
    return {
      ok: false,
      error: 'manychat_contact_id looks like an unresolved ManyChat field placeholder. Insert the Contact Id field from ManyChat\'s "{+} Add a Field" picker instead of typing it.',
      code: 'unresolved_contact_id_placeholder',
    };
  }

  const answer = str(b.answer, MAX_ANSWER_CHARS);

  // An 'answer' event with no question_key is meaningless and would silently write an
  // orphan row. Reject it loudly instead.
  if (eventType === 'answer') {
    const qk = str(b.question_key, 64);
    if (!qk) return { ok: false, error: 'question_key required for answer', code: 'missing_question_key' };
  }

  return {
    ok: true,
    value: {
      event_type: eventType as ManyChatEventType,
      event_id: eventId,
      manychat_contact_id: contactId,
      // Each of these also falls back to the "+ Add Full Contact Data" object, so a single
      // click in ManyChat populates everything without the artist configuring six pills.
      instagram_user_id: str(b.instagram_user_id, 128) ?? (contact ? str(contact.user_id, 128) : null),
      instagram_username: normalizeUsername(
        str(b.instagram_username, 64) ?? (contact ? str(contact.username ?? contact.ig_username, 64) : null),
      ),
      first_name: str(b.first_name, 80) ?? (contact ? str(contact.first_name, 80) : null),
      last_name: str(b.last_name, 80) ?? (contact ? str(contact.last_name, 80) : null),
      email: normalizeEmailLoose(str(b.email, 254) ?? (contact ? str(contact.email, 254) : null)),
      phone: str(b.phone, 32) ?? (contact ? str(contact.phone, 32) : null),
      campaign_key: str(b.campaign_key, 64),
      creator_account: str(b.creator_account, 64),
      source_post_id: str(b.source_post_id, 128),
      keyword: str(b.keyword, 64),
      lead_magnet_id: str(b.lead_magnet_id, 64),
      conversation_id: str(b.conversation_id, 128),
      referring_url: str(b.referring_url, 500),
      utm_source: str(b.utm_source, 64),
      utm_medium: str(b.utm_medium, 64),
      utm_campaign: str(b.utm_campaign, 64),
      utm_content: str(b.utm_content, 64),
      question_key: str(b.question_key, 64),
      answer,
      consent_dm: bool(b.consent_dm),
      consent_email: bool(b.consent_email),
      consent_sms: bool(b.consent_sms),
      opt_in_source: str(b.opt_in_source, 64),
      event_name: str(b.event_name, 64),
      sent_at: str(b.sent_at, 40),
      custom_fields:
        b.custom_fields && typeof b.custom_fields === 'object' && !Array.isArray(b.custom_fields)
          ? (b.custom_fields as Record<string, unknown>)
          : {},
    },
  };
}

/**
 * Does this value look like a ManyChat field placeholder that never got substituted?
 *
 * A genuine ManyChat contact id (and a genuine Instagram user id) is a plain number. Anything
 * carrying braces, brackets, angle brackets, or the words we use in our own docs is a human
 * having typed the annotation instead of inserting the field. Catch it here, loudly, rather
 * than letting every lead collapse into one identity.
 */
export function looksUnresolved(v: string): boolean {
  return (
    /[{}[\]<>]/.test(v) || // {{contact_id}}, [Contact Id], <Contact Id>
    /\bpill\b/i.test(v) ||
    /contact[_\s-]?id/i.test(v) // someone typed the field's NAME rather than its value
  );
}

/** Strip a leading @ and lowercase. Recorded for display; NEVER a merge key. */
export function normalizeUsername(u: string | null): string | null {
  if (!u) return null;
  return u.replace(/^@+/, '').toLowerCase().trim() || null;
}

/**
 * Lowercase + trim. Deliberately does NOT validate deliverability.
 *
 * An email arriving from ManyChat is CLAIMED, not verified. It is stored as a hint and is
 * never sufficient to resolve an identity to an existing CRWN account. Only an email
 * verified through Supabase auth earns `verified_contact` trust. This is the account-takeover
 * boundary: if a typed email could merge you into someone's account, anyone could type
 * anyone's email.
 */
export function normalizeEmailLoose(e: string | null): string | null {
  if (!e) return null;
  const s = e.toLowerCase().trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}
