// Reading a Stripe account id out of Postgres.
//
// `artist_profiles.stripe_connect_id`, `platform_stripe_customer_id` and
// `platform_stripe_subscription_id` have their SELECT privilege REVOKED from
// `anon` and `authenticated` (schema-phase2-stripe-id-column-privs.sql). That is
// correct and must stay: a browser session has no business reading an artist's
// Stripe account id.
//
// The trap is what happens when you forget. Postgres rejects the WHOLE statement
// with 42501 "permission denied for table artist_profiles" the moment ONE revoked
// column is named, and PostgREST applies the same rule to embedded joins. So
// `select('id, title, artist:artist_profiles(slug, stripe_connect_id)')` returns
// no row at all, not a row with that field missing. Callers read that as "not
// found" and fail closed, which is how every checkout route on the platform came
// to answer "Artist not found" while looking completely healthy in the code.
//
// Route these reads through here instead. Service role only, always looked up by
// an id the CALLER already proved they may act on.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function serviceRole(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/** Connect account for an artist, by `artist_profiles.id`. */
export async function getConnectAccountByArtistId(artistId: string): Promise<string | null> {
  if (!artistId) return null;
  const { data } = await serviceRole()
    .from('artist_profiles')
    .select('stripe_connect_id')
    .eq('id', artistId)
    .maybeSingle();
  return (data?.stripe_connect_id as string) || null;
}

/** Connect account for an artist, by the owning `auth.users` id. */
export async function getConnectAccountByUserId(userId: string): Promise<string | null> {
  if (!userId) return null;
  const { data } = await serviceRole()
    .from('artist_profiles')
    .select('stripe_connect_id')
    .eq('user_id', userId)
    .maybeSingle();
  return (data?.stripe_connect_id as string) || null;
}

/** Connect account for a fan / recruiter, which lives on `profiles`. */
export async function getProfileConnectAccount(userId: string): Promise<string | null> {
  if (!userId) return null;
  const { data } = await serviceRole()
    .from('profiles')
    .select('stripe_connect_id')
    .eq('id', userId)
    .maybeSingle();
  return (data?.stripe_connect_id as string) || null;
}

/** The artist's Stripe CUSTOMER id (they pay CRWN), not their Connect account. */
export async function getPlatformCustomerId(userId: string): Promise<string | null> {
  if (!userId) return null;
  const { data } = await serviceRole()
    .from('artist_profiles')
    .select('platform_stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();
  return (data?.platform_stripe_customer_id as string) || null;
}

/** The artist's CRWN plan subscription id. */
export async function getPlatformSubscriptionId(userId: string): Promise<string | null> {
  if (!userId) return null;
  const { data } = await serviceRole()
    .from('artist_profiles')
    .select('platform_stripe_subscription_id')
    .eq('user_id', userId)
    .maybeSingle();
  return (data?.platform_stripe_subscription_id as string) || null;
}
