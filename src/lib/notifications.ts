import { createClient } from '@supabase/supabase-js';

// Helper function to create notifications
export async function createNotification(
  supabaseAdmin: any,
  userId: string,
  type: string,
  title: string,
  message?: string,
  link?: string
) {
  return supabaseAdmin.from('notifications').insert({
    user_id: userId,
    type,
    title,
    message,
    link,
  });
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
    '/profile/artist?tab=payouts'
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
