import { createClient } from '@supabase/supabase-js';
import { classifyNotification } from '@/lib/comms/taxonomy';
import { governCommunications, type CommsContext, type CommunicationDecision } from '@/lib/comms/governor';

/**
 * THE notification chokepoint, and as of 2026-08-11 the Communications Governor's G2 integration.
 *
 * Every CRWN notification is written here, by twelve different producers, and until now this was a
 * bare INSERT: no class, no owner, no precedence, no governance of any kind. Production had reached
 * 41 notifications in a single day with nothing able to tell an artist's payout from a quest badge.
 *
 * WHY NO PRODUCER CHANGED. Classification is keyed on the `type` string every caller already
 * passes, so the information needed to govern was flowing all along and simply was not read. That
 * is the whole reason this integration is one function rather than twelve.
 *
 * WHAT IT COSTS. Nothing measurable: `classifyNotification` is an object lookup and
 * `governCommunications` is pure. There is no added query. A governor that assembled its own
 * context would have put a Constraint Engine read on every notification write, which is exactly
 * what was refused.
 *
 * WHAT IT WILL NOT DO. It will not withhold a fan's notification, an artist's own message to their
 * fans, a payment or account fact, or a type it has never heard of. The default direction is
 * ALWAYS to deliver: a boundary introduced under live traffic that fails closed would turn an
 * unclassified new feature into silence.
 */
export async function createNotification(
  supabaseAdmin: any,
  userId: string,
  type: string,
  title: string,
  message?: string,
  link?: string,
  /**
   * Optional, and only what the CALLER already knows. Omitted means UNKNOWN, never false: a
   * producer that knows nothing gets exactly today's behavior.
   */
  context?: Omit<CommsContext, 'channel'>,
): Promise<{ decision: CommunicationDecision; reason: string; written: boolean }> {
  const candidate = classifyNotification(type);

  // Unknown type: ungoverned, delivered, and reported as such so it shows up as an unclassified
  // type rather than disappearing.
  if (!candidate) {
    await supabaseAdmin.from('notifications').insert({ user_id: userId, type, title, message, link });
    return { decision: 'deliver', reason: 'ungoverned:unknown_type', written: true };
  }

  // A notification list is a FEED, not an interruption, so the governor is asked the feed question.
  const [result] = governCommunications({ channel: 'feed', ...(context ?? {}) }, [candidate]);

  // `defer` is the only non-delivering outcome V1 can produce, and only for a growth-class message
  // when the caller POSITIVELY knows the artist is launch-blocked or owes a paying fan. It is a
  // deferral, not a deletion: the underlying opportunity is unchanged and the producer may raise it
  // again when the blocking state clears.
  if (result.decision === 'defer') {
    return { decision: result.decision, reason: result.reason, written: false };
  }

  await supabaseAdmin.from('notifications').insert({ user_id: userId, type, title, message, link });
  return { decision: result.decision, reason: result.reason, written: true };
}

// Notify artist of new subscriber
export async function notifyNewSubscriber(
  supabaseAdmin: any,
  artistUserId: string,
  fanName: string,
  tierName: string
) {
  return createNotification(
    supabaseAdmin,
    artistUserId,
    'new_subscriber',
    'New subscriber!',
    `${fanName} joined ${tierName}`,
    '/profile/analytics'
  );
}

// Notify artist of new purchase
export async function notifyNewPurchase(
  supabaseAdmin: any,
  artistUserId: string,
  fanName: string,
  productTitle: string
) {
  return createNotification(
    supabaseAdmin,
    artistUserId,
    'new_purchase',
    'New sale!',
    `${fanName} purchased ${productTitle}`,
    '/profile/shop'
  );
}

// Notify artist that a cashout payout was created
export async function notifyCashout(
  supabaseAdmin: any,
  artistUserId: string,
  amount: number
) {
  const formatted = `$${(amount / 100).toFixed(2)}`;
  return createNotification(
    supabaseAdmin,
    artistUserId,
    'cashout',
    `Cashout sent: ${formatted}`,
    'On its way to your linked bank or debit card. Bank transfers arrive in 1 to 2 business days.',
    '/account/payouts'
  );
}

// Notify artist of canceled subscription
export async function notifySubscriptionCanceled(
  supabaseAdmin: any,
  artistUserId: string,
  fanName: string
) {
  return createNotification(
    supabaseAdmin,
    artistUserId,
    'subscription_canceled',
    'Subscription canceled',
    `${fanName} canceled their subscription`,
    '/profile/analytics'
  );
}

// Notify fan of new track from subscribed artist
export async function notifyNewTrack(
  supabaseAdmin: any,
  subscriberUserId: string,
  artistName: string,
  trackTitle: string,
  artistSlug: string
) {
  return createNotification(
    supabaseAdmin,
    subscriberUserId,
    'new_track',
    `${artistName} dropped a new track`,
    trackTitle,
    `/${artistSlug}`
  );
}

// Notify fan of new post from subscribed artist
export async function notifyNewPost(
  supabaseAdmin: any,
  subscriberUserId: string,
  artistName: string
) {
  return createNotification(
    supabaseAdmin,
    subscriberUserId,
    'new_post',
    `${artistName} posted in the community`,
    '/community'
  );
}

// Notify fan of new shop item from subscribed artist
export async function notifyNewShopItem(
  supabaseAdmin: any,
  subscriberUserId: string,
  artistName: string,
  productTitle: string,
  artistSlug: string
) {
  return createNotification(
    supabaseAdmin,
    subscriberUserId,
    'new_shop_item',
    `${artistName} added ${productTitle} to the shop`,
    `/${artistSlug}`
  );
}

// Notify a DM recipient (fan or artist) of a new direct message
export async function notifyNewMessage(
  supabaseAdmin: any,
  recipientUserId: string,
  senderName: string,
  preview: string,
  link: string = '/messages'
) {
  return createNotification(
    supabaseAdmin,
    recipientUserId,
    'direct_message',
    `New message from ${senderName}`,
    preview,
    link
  );
}

// Notify artist of new comment on their post
export async function notifyNewComment(
  supabaseAdmin: any,
  artistUserId: string,
  fanName: string
) {
  return createNotification(
    supabaseAdmin,
    artistUserId,
    'new_comment',
    'New comment',
    `${fanName} commented on your post`,
    '/community'
  );
}
