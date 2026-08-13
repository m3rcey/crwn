// A server-minted identity for a payment attempt that does not have a Stripe id yet.
//
// One-time rails compute the collaborator reserve BEFORE the Checkout Session exists, so the
// reservation cannot be keyed to the session id. It is keyed to this token instead, which is
// written into the session metadata and read back at settlement to fund the same reservation.
//
// Server-generated, never client-supplied: a caller who could choose the key could point a new
// payment at somebody else's reservation.

import { randomUUID } from 'crypto';

/** A fresh money key. One per payment attempt. */
export function teamSplitMoneyKey(): string {
  return `tsk_${randomUUID()}`;
}

/** Where the key rides on the Stripe object, and where settlement reads it back. */
export const MONEY_KEY_METADATA = 'team_split_money_key';

export function moneyKeyFromMetadata(metadata: unknown): string | null {
  const v = (metadata as Record<string, string> | null | undefined)?.[MONEY_KEY_METADATA];
  return typeof v === 'string' && v.startsWith('tsk_') ? v : null;
}
