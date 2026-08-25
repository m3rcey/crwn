// The internal speed-to-lead SMS alert consent, as data.
//
// WHAT THIS IS. JNW Creative Enterprises, Inc. registered ONE A2P 10DLC campaign whose only
// recipients are its own authorized personnel: when a qualified artist asks to speak with the
// CRWN team, an operational alert goes to a representative so they can return the call. Twilio
// refused "we hold a signed paper form" as an opt-in description and asked to SEE the consent
// experience, so /sms-alert-consent is that experience, publicly reachable and unauthenticated
// because a reviewer has no CRWN account.
//
// WHAT THIS IS NOT. Not fan messaging, not artist marketing texts, not a CRM channel, not a
// campaign tool, not a general SMS capability. Broad CRWN SMS marketing was removed 2026-07-31
// and stays removed. Nothing here sends a message: this module and its route record consent and
// stop. The outbound sender is separate work, gated on the campaign being approved.
//
// WHY THE COPY LIVES HERE. The disclosure a person agreed to is the evidence. If the browser
// posted its own consent text, anyone could store any sentence against any number and the record
// would prove nothing. The server reads the text from THIS FILE, stores that, and ignores what
// the client claims. The form renders the same constant, so what is shown and what is stored
// cannot drift.

import { normalizeCallbackPhone } from '@/lib/acquisition/callRequest';

/**
 * Version stamped on every stored consent. Bump when any disclosure string below changes, so a
 * stored row still says which words that person actually saw.
 */
export const ALERT_CONSENT_VERSION = 'internal-sms-alert-consent-2026-08-25.v1';

/** The legal entity that sends. Named in the consent itself, because a brand must identify itself. */
export const ALERT_CONSENT_BRAND = 'JNW Creative Enterprises, Inc.';

/**
 * The checkbox label. This exact string is what a person agrees to and what the server stores.
 *
 * It carries every element Twilio vets a web opt-in for: who is sending (brand), what is being
 * sent (low-volume internal operational lead alerts), that the number is the one being provided,
 * message frequency, "Message and data rates may apply", STOP, and HELP.
 */
export const ALERT_CONSENT_TEXT =
  'I agree to receive low-volume internal CRWN operational lead alerts by SMS from ' +
  'JNW Creative Enterprises, Inc. at the mobile number I provide. Message frequency varies. ' +
  'Message and data rates may apply. Reply STOP to opt out or HELP for help.';

/**
 * Shown beneath the checkbox. Consent is never a condition of anything here (the recipient is
 * staff, not a customer), and saying so is a standing CTIA expectation that costs nothing.
 */
export const ALERT_CONSENT_FOOTNOTE =
  'Consent is not a condition of purchase or of employment. You can stop the alerts at any time ' +
  'by replying STOP.';

/** What the page tells a reviewer, in one sentence, before anything else. */
export const ALERT_CONSENT_PURPOSE =
  'This form is for authorized personnel of JNW Creative Enterprises, Inc., which operates the ' +
  'CRWN platform (thecrwn.app). It records their consent to receive internal operational alerts ' +
  'by text message. It is not a signup for customers, artists, or fans, and CRWN sends no ' +
  'marketing or promotional text messages to anyone.';

/** Plain description of the one message type this campaign sends. */
export const ALERT_CONSENT_PROGRAM =
  'When an artist requests a call through a CRWN calculator and qualifies, the system sends one ' +
  'alert to an authorized representative with the information needed to identify that artist and ' +
  'return their call. Message frequency varies and depends on how many artists ask to speak with ' +
  'us. This is a low volume program.';

/** Where the consent came from. Stored verbatim so the record names its own origin. */
export const ALERT_CONSENT_SOURCE = 'web_form:/sms-alert-consent';

export interface AlertConsentSubmission {
  phone?: unknown;
  consent?: unknown;
}

export type AlertConsentRejection =
  | 'consent_required'
  | 'invalid_phone';

export interface AlertConsentDecision {
  ok: boolean;
  /** E.164, server-normalized. Present only when ok. */
  phone?: string;
  reason?: AlertConsentRejection;
}

/**
 * The whole server-side gate, pure so it can be tested without a database.
 *
 * Consent is checked BEFORE the phone number on purpose: an unchecked box is a refusal, and a
 * refusal should never be reported back as "your number looks wrong".
 */
export function decideAlertConsent(body: AlertConsentSubmission): AlertConsentDecision {
  if (body.consent !== true) return { ok: false, reason: 'consent_required' };
  const phone = normalizeCallbackPhone(body.phone);
  if (!phone) return { ok: false, reason: 'invalid_phone' };
  return { ok: true, phone };
}

/** Human message for a rejection. Never leaks anything about stored records. */
export function alertConsentError(reason: AlertConsentRejection): string {
  return reason === 'consent_required'
    ? 'Check the consent box to enable alerts.'
    : 'Enter a valid mobile number, including the area code.';
}

/**
 * The row written for an accepted consent. Deliberately small: a phone number, what they agreed
 * to, when, from where. No name, no email, no account, no role, no staff metadata. Twilio needs
 * to know a specific number consented to specific words at a specific time, and nothing else
 * here would make that proof stronger.
 */
export interface AlertConsentRecord {
  phone_e164: string;
  consent_version: string;
  consent_text: string;
  source: string;
  ip_address: string | null;
  user_agent: string | null;
}

export function buildAlertConsentRecord(
  phone: string,
  ip: string | null,
  userAgent: string | null,
): AlertConsentRecord {
  return {
    phone_e164: phone,
    consent_version: ALERT_CONSENT_VERSION,
    // The SERVER's copy of the disclosure, never the client's.
    consent_text: ALERT_CONSENT_TEXT,
    source: ALERT_CONSENT_SOURCE,
    ip_address: ip ? ip.slice(0, 64) : null,
    user_agent: userAgent ? userAgent.slice(0, 256) : null,
  };
}

/**
 * Last 4 digits only, for logs and for the founder's own copy of the record. A consent log that
 * prints whole phone numbers into a hosting provider's log stream is its own privacy problem.
 */
export function maskPhone(e164: string): string {
  const tail = e164.slice(-4);
  return `••••${tail}`;
}
