// Deriving an idempotency key when ManyChat cannot give us one.
//
// WHY THIS EXISTS
// The original design required ManyChat to send a unique-per-delivery `event_id`. It cannot.
// Its External Request field picker offers exactly: First/Last/Full Name, Email, Phone,
// Last Text Input, Subscribed, Contact Id, Last Reply Type, Full Contact Data. There is no
// message id, no timestamp, nothing that varies per request.
//
// The tempting shortcut is to use Contact Id. That would be catastrophic: every event from
// one artist would carry the SAME key, so her second message would look like a replay of her
// first, CRWN would return the cached response, and the conversation would freeze on question
// one. Silently, forever, for every lead.
//
// So CRWN computes the key from what it already receives. The property we need is:
//
//     a RETRY  of the same event  -> SAME key  (so it dedupes)
//     a NEW    event              -> DIFFERENT key (so it processes)
//
// contact + event_type + question_key + answer gets us most of the way: a retry carries
// identical values, and a different answer to a different question obviously doesn't.
//
// The one collision left is the artist genuinely re-sending the SAME text for the SAME
// question (which happens: the loop guard exists precisely because people repeat themselves).
// A coarse TIME BUCKET fixes it. A ManyChat retry lands within seconds, so it shares a
// bucket and dedupes. A deliberate re-answer a minute later gets a new bucket and is
// processed, so the loop guard's attempt counter still increments and she still gets
// escalated to a human after three tries.

import { createHash } from 'crypto';
import type { ManyChatInboundPayload } from './schemas';

/**
 * Retries land within seconds. 60s is comfortably wider than any retry window and
 * comfortably narrower than a human re-typing an answer.
 */
const BUCKET_SECONDS = 60;

export function deriveIdempotencyKey(payload: ManyChatInboundPayload, nowMs = Date.now()): string {
  // If ManyChat ever does gain a real per-message id, we use it and skip all of this.
  if (payload.event_id) return payload.event_id;

  const bucket = Math.floor(nowMs / (BUCKET_SECONDS * 1000));

  const material = [
    payload.manychat_contact_id,
    payload.event_type,
    payload.question_key ?? '',
    payload.answer ?? '',
    String(bucket),
  ].join('|');

  // Hashed rather than concatenated: the raw material contains the artist's message text, and
  // the key is stored in a database column and shows up in admin views. No PII in keys.
  return 'd_' + createHash('sha256').update(material, 'utf8').digest('hex').slice(0, 40);
}
