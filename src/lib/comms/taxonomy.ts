// taxonomy.ts — the ONE vocabulary for governing CRWN-originated ARTIST communication.
//
// SCOPE, and it is narrow on purpose. V1 governs communications where ALL of these hold:
//   • the audience is the ARTIST, and
//   • CRWN wrote it (coaching, lifecycle, system), not the artist.
//
// Everything else passes through UNGOVERNED, by design, not by omission:
//   • fan-facing notifications (a fan's purchase, a livestream reminder) are the fan's own truth,
//   • artist-authored messages to fans (a new track, a post, a broadcast) are the ARTIST's voice.
//     CRWN must never suppress an artist speaking to their own fans because CRWN has a priority.
//     A governor that could do that is a censorship layer, and that is not what this is.
//
// This file is DATA plus a lookup. It contains no decision logic: `governor.ts` decides. Splitting
// them is what lets the precedence rules be tested without knowing anything about notifications,
// and lets a second channel adopt the taxonomy later without inheriting notification specifics.

/**
 * Communication classes, in PRECEDENCE ORDER (index 0 is most important).
 *
 * Derived from CRWN's existing ownership decisions rather than invented: `critical` is
 * transactional/financial truth, `fan_obligation` is the Promise Calendar's, `launch_blocker` is
 * the Roadmap's, `constraint` is the Constraint Engine's, `event_deadline` is Needs You's. The
 * ordering below mirrors the ordering those systems already have; it is not a second opinion about
 * what matters, only a restatement of theirs in one place so a channel can sort by it.
 */
export const CLASS_ORDER = [
  'critical',
  'fan_obligation',
  'launch_blocker',
  'constraint',
  'event_deadline',
  'continuation',
  'growth',
  'celebration',
] as const;

export type CommunicationClass = (typeof CLASS_ORDER)[number];

/** Lower is more important. Read off CLASS_ORDER so there is no second ranking to drift. */
export function classRank(c: CommunicationClass): number {
  return CLASS_ORDER.indexOf(c);
}

/**
 * Who legitimately owns this communication's truth.
 *
 * `manager` is deliberately NOT an owner of business priority. When Manager coaches the canonical
 * priority, the owner is `constraint` and Manager is merely the voice. That distinction is the
 * whole of Z4/Z5 and must survive into communications.
 */
export type CommunicationOwner =
  | 'security'
  | 'billing'
  | 'promise_calendar'
  | 'roadmap'
  | 'constraint'
  | 'needs_you'
  | 'setup'
  | 'mission'
  | 'campaign'
  | 'manager'
  | 'system';

export type CommunicationAudience = 'artist' | 'fan';
/** Who authored it. `artist_authored` is never governed. */
export type CommunicationOrigin = 'crwn' | 'artist_authored';

export interface CommunicationCandidate {
  /** Stable identity for the KIND of communication. For notifications this is the `type` string. */
  key: string;
  audience: CommunicationAudience;
  origin: CommunicationOrigin;
  class: CommunicationClass;
  owner: CommunicationOwner;
  /**
   * May this wait for a better moment without losing its meaning? A payment failure may not. A
   * growth nudge may. Deferral NEVER means deletion.
   */
  deferrable: boolean;
}

/** Only artist-facing, CRWN-authored communication is subject to governance. */
export function isGovernable(c: Pick<CommunicationCandidate, 'audience' | 'origin'>): boolean {
  return c.audience === 'artist' && c.origin === 'crwn';
}

// ---------------------------------------------------------------------------
// Notification type registry (G2)
// ---------------------------------------------------------------------------
//
// Classification is keyed on the `type` string every producer ALREADY passes to
// `createNotification`. That is why G2 needed no changes to the twelve producers: the information
// required to govern was already flowing, it was simply never read.
//
// An unlisted type is UNGOVERNED and delivers. That is the correct failure direction: a new
// notification type appearing in the product must never be silently swallowed by a governor that
// has not been taught about it yet.

type Classification = Omit<CommunicationCandidate, 'key'>;

const artist = (
  cls: CommunicationClass,
  owner: CommunicationOwner,
  deferrable: boolean,
): Classification => ({ audience: 'artist', origin: 'crwn', class: cls, owner, deferrable });

/** Fan-facing, or the artist's own voice reaching their fans. Never governed. */
const passthrough = (audience: CommunicationAudience, origin: CommunicationOrigin): Classification => ({
  audience,
  origin,
  // Class/owner are recorded for completeness; `isGovernable` short-circuits before they matter.
  class: 'event_deadline',
  owner: 'system',
  deferrable: false,
});

export const NOTIFICATION_TAXONOMY: Record<string, Classification> = {
  // ── Artist money and account truth. Transactional: never deferred, never suppressed. ──
  earning: artist('critical', 'billing', false),
  cashout: artist('critical', 'billing', false),
  new_purchase: artist('critical', 'billing', false),
  new_subscriber: artist('critical', 'billing', false),
  subscription_canceled: artist('critical', 'billing', false),
  team_split_payout: artist('critical', 'billing', false),
  system: artist('critical', 'system', false),
  // F-06 (2026-08-12): the webhook money types the governor most needed to rank were the ones
  // it had never heard of. All artist money truth; all fail open through governance.
  refund: artist('critical', 'billing', false),
  dispute: artist('critical', 'billing', false),
  live_ticket: artist('critical', 'billing', false),
  live_tip: artist('critical', 'billing', false),
  new_booking: artist('critical', 'billing', false),

  // ── Events and deadlines. Factual: they report that something HAPPENED, so they are not
  //    suppressed for being strategically less important. Governance shapes urgency, not truth. ──
  mission_suggestion: artist('event_deadline', 'needs_you', true),
  squad_application: artist('event_deadline', 'needs_you', true),
  squad_invite: artist('event_deadline', 'needs_you', true),
  squad_joined: artist('event_deadline', 'needs_you', true),
  team_split_invite: artist('event_deadline', 'needs_you', true),
  team_split_response: artist('event_deadline', 'needs_you', true),
  team_split_deliverable: artist('event_deadline', 'needs_you', true),
  team_split_viewed: artist('event_deadline', 'needs_you', true),
  // COMMS-002 (2026-08-12): a fan submitted a clip to the artist's bounty; the artist reviews it.
  bounty_submission: artist('event_deadline', 'needs_you', true),

  // ── Coaching. Owner is `constraint`, NOT `manager`: Manager is the voice, never the owner of
  //    the priority. `revenue` and `sync_match` are opportunity nudges, so they are growth. ──
  ai_insight: artist('constraint', 'constraint', true),
  revenue: artist('growth', 'manager', true),
  sync_match: artist('growth', 'manager', true),

  // ── Celebration. Coexists with everything in a feed; loses (but is only DEFERRED, never
  //    suppressed) where a channel admits one winner. Founder decision, 2026-08-11. ──
  quest_completed: artist('celebration', 'system', true),
  quest_milestone: artist('celebration', 'system', true),
  level_up: artist('celebration', 'system', true),
  // F-06: the earnings-milestone unlock ("first $100" etc.) is a celebration, same as quests.
  milestone: artist('celebration', 'system', true),
  // COMMS-002 (2026-08-12): a road campaign hit its goal — the artist's win, same family as quests.
  campaign_reached: artist('celebration', 'system', true),

  // ── NOT GOVERNED. The artist's own voice reaching their fans, or a fan's own truth. ──
  new_track: passthrough('fan', 'artist_authored'),
  new_post: passthrough('fan', 'artist_authored'),
  new_shop_item: passthrough('fan', 'artist_authored'),
  direct_message: passthrough('fan', 'artist_authored'),
  new_comment: passthrough('fan', 'crwn'),
  live_session: passthrough('fan', 'crwn'),
  // Calendar reminders are fan-facing as of 2026-08-11: livestreams they can attend and deadlines
  // for artists they support. Previously this path inserted into `notifications` DIRECTLY,
  // bypassing the chokepoint entirely, which is why it had no classification until now.
  calendar_reminder: passthrough('fan', 'crwn'),
  invited: passthrough('fan', 'crwn'),
  active: passthrough('fan', 'crwn'),
  // F-06: fan-facing truths that were unclassified. A referrer's commission, a clipper's rate
  // change, a contributor's unlocked city, a credited release, an open bounty and a kept
  // promise are all the FAN's own truth — recorded here so the registry is complete, exempt
  // from governance by isGovernable exactly like the rest of this block.
  referral_earning: passthrough('fan', 'crwn'),
  // The buyer's ticket confirmation. Split from the artist's 'live_ticket' sale notice
  // (F-06) because one type string carries exactly one classification, and the same webhook
  // used to write both audiences under one type.
  live_ticket_confirmed: passthrough('fan', 'crwn'),
  clipper_rate_change: passthrough('fan', 'crwn'),
  city_unlocked: passthrough('fan', 'crwn'),
  release_credit: passthrough('fan', 'crwn'),
  bounty_available: passthrough('fan', 'crwn'),
  promise_fulfilled: passthrough('fan', 'crwn'),
  // COMMS-002 (2026-08-12): three more fan truths that shipped unclassified — the clipper's own
  // bounty win, a badge they earned, and their own support milestone. Same block, same exemption.
  bounty_won: passthrough('fan', 'crwn'),
  badge_awarded: passthrough('fan', 'crwn'),
  fan_milestone: passthrough('fan', 'crwn'),
};

/**
 * Classify a notification type. Returns null for an unknown type, and the caller must treat null
 * as "deliver, ungoverned" rather than as a reason to withhold.
 */
export function classifyNotification(type: string): CommunicationCandidate | null {
  const found = NOTIFICATION_TAXONOMY[type];
  return found ? { key: type, ...found } : null;
}
