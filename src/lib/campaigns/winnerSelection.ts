// Recording a campaign winner. Pure rules only; the write lives in store.ts.
//
// THE BOUNDARY THIS FILE EXISTS TO HOLD: **CRWN records a winner. CRWN never chooses one.**
//
// A sweepstakes winner is determined by a legally-governed process (the artist's Official
// Rules), and for V1 that process happens OUTSIDE the product. Nothing in CRWN draws, shuffles,
// weights, seeds a random number, ranks participants, reads anyone's spend, or judges
// eligibility. This module answers one question: may the result of an already-completed
// selection be written down right now? If a drawing engine ever appears in this codebase, it
// did not come from here, and it would need its own founder decision.
//
// SELECTION IS NOT FULFILMENT. Two separate facts, deliberately in two places:
//   fan_campaign_participants.selected_winner_at  ->  WHO won
//   subscriptions.prize_campaign_id               ->  which campaign is funding a membership
// A recorded winner may sit unfulfilled indefinitely, and that is a legitimate state.

import type { CampaignStatus } from './lifecycle';

export type WinnerRecordingRefusal =
  /** The campaign never ran, so nobody entered it. */
  | 'campaign_never_ran'
  /** Entries are still open. Selecting mid-window would be selecting from a moving list. */
  | 'entries_still_open';

export interface WinnerRecordingGate {
  ok: boolean;
  refusal?: WinnerRecordingRefusal;
  reason?: string;
}

/**
 * May a winner be recorded for a campaign in this state?
 *
 * The rule is the campaign spine's OWN vocabulary, not a new one. `ended` is already defined as
 * "window closed or the artist closed it, results readable, NO new participants", which is
 * precisely "entries are closed". `archived` is documented as the same thing put away, so a
 * winner recorded after tidying up is still valid.
 *
 * `active` is refused on purpose and is NOT reinterpreted: while a campaign is live the
 * participant list is still changing, so a selection made from it could exclude someone who
 * entered legitimately a minute later. That is a fairness property, and it is exactly the kind
 * of thing a sweepstakes gets challenged on.
 */
export function canRecordWinner(status: CampaignStatus): WinnerRecordingGate {
  if (status === 'draft') {
    return { ok: false, refusal: 'campaign_never_ran', reason: 'This campaign has not run, so it has no entrants.' };
  }
  if (status === 'active') {
    return {
      ok: false,
      refusal: 'entries_still_open',
      reason: 'Entries are still open. End the campaign first, then record the winner.',
    };
  }
  return { ok: true };
}
