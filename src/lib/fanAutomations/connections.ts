// The ONE reader/writer of artist_social_connections. SERVER ONLY.
//
// Same single-reader rule as src/lib/stripe/connectAccount.ts: the table is closed to every
// client role (RLS on, zero policies, ALL revoked), tokens are stored as AES-256-GCM
// ciphertext (src/lib/social/connectionTokens.ts), and NOTHING outside this module may
// select the table or touch access_token_enc. Routes hand browsers only the sanitized
// shape below, which cannot carry a token by construction.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { encryptToken, decryptToken } from '@/lib/social/connectionTokens';

export type SocialProvider = 'instagram' | 'facebook';

export interface SocialConnection {
  id: string;
  artistId: string;
  provider: SocialProvider;
  providerAccountId: string;
  providerUsername: string | null;
  status: string;
  webhookSubscribed: boolean;
  tokenExpiresAt: string | null;
  /** Decrypted, in server memory only. Never serialize this object to a response. */
  accessToken: string | null;
}

/** The browser-safe projection. No token field EXISTS on this type. */
export interface SanitizedConnection {
  id: string;
  provider: SocialProvider;
  providerUsername: string | null;
  providerAccountId: string;
  status: string;
  webhookSubscribed: boolean;
  tokenExpiresAt: string | null;
}

export function sanitizeConnection(c: SocialConnection | RawRow): SanitizedConnection {
  const row = 'artistId' in c ? c : fromRow(c as RawRow);
  return {
    id: row.id,
    provider: row.provider,
    providerUsername: row.providerUsername,
    providerAccountId: row.providerAccountId,
    status: row.status,
    webhookSubscribed: row.webhookSubscribed,
    tokenExpiresAt: row.tokenExpiresAt,
  };
}

interface RawRow {
  id: string;
  artist_id: string;
  provider: SocialProvider;
  provider_account_id: string;
  provider_username: string | null;
  access_token_enc: string;
  token_expires_at: string | null;
  status: string;
  webhook_subscribed: boolean;
}

function fromRow(row: RawRow): SocialConnection {
  return {
    id: row.id,
    artistId: row.artist_id,
    provider: row.provider,
    providerAccountId: row.provider_account_id,
    providerUsername: row.provider_username,
    status: row.status,
    webhookSubscribed: row.webhook_subscribed,
    tokenExpiresAt: row.token_expires_at,
    accessToken: decryptToken(row.access_token_enc),
  };
}

const COLS = 'id, artist_id, provider, provider_account_id, provider_username, access_token_enc, token_expires_at, status, webhook_subscribed';

export async function getActiveConnection(
  admin: any,
  artistId: string,
  provider: SocialProvider,
): Promise<SocialConnection | null> {
  const { data } = await admin
    .from('artist_social_connections')
    .select(COLS)
    .eq('artist_id', artistId)
    .eq('provider', provider)
    .eq('status', 'active')
    .maybeSingle();
  return data ? fromRow(data as RawRow) : null;
}

/** Webhook resolution: provider-owned account id -> the ONE active connection. */
export async function getConnectionByAccount(
  admin: any,
  provider: SocialProvider,
  providerAccountId: string,
): Promise<SocialConnection | null> {
  const { data } = await admin
    .from('artist_social_connections')
    .select(COLS)
    .eq('provider', provider)
    .eq('provider_account_id', providerAccountId)
    .eq('status', 'active')
    .maybeSingle();
  return data ? fromRow(data as RawRow) : null;
}

/** Owner-scoped: the row must belong to `artistId`, so a foreign id resolves to null. */
export async function getConnectionById(
  admin: any,
  artistId: string,
  connectionId: string,
): Promise<SocialConnection | null> {
  const { data } = await admin
    .from('artist_social_connections')
    .select(COLS)
    .eq('id', connectionId)
    .eq('artist_id', artistId)
    .maybeSingle();
  return data ? fromRow(data as RawRow) : null;
}

export async function listConnections(admin: any, artistId: string): Promise<SanitizedConnection[]> {
  const { data } = await admin
    .from('artist_social_connections')
    .select(COLS)
    .eq('artist_id', artistId)
    .in('status', ['active', 'candidate', 'expired'])
    .order('created_at', { ascending: true });
  return ((data as RawRow[]) || []).map((r) => sanitizeConnection(r));
}

/**
 * Store or replace an artist's connection for a provider. Encrypts the token here so no
 * caller ever holds a plaintext token and a row at the same time. Refuses (returns null)
 * when encryption is not configured, so a missing SOCIAL_TOKEN_ENC_KEY can never store
 * plaintext or silently drop the token.
 */
export async function saveConnection(
  admin: any,
  input: {
    artistId: string;
    provider: SocialProvider;
    providerAccountId: string;
    providerUsername?: string | null;
    accessToken: string;
    expiresInSeconds?: number | null;
    status?: 'active' | 'candidate';
    webhookSubscribed?: boolean;
  },
): Promise<{ id: string } | null> {
  const enc = encryptToken(input.accessToken);
  if (!enc) return null;

  const expiresAt = input.expiresInSeconds
    ? new Date(Date.now() + input.expiresInSeconds * 1000).toISOString()
    : null;
  const status = input.status ?? 'active';

  if (status === 'active') {
    // One active connection per (artist, provider): retire any previous one first, and clear
    // stale candidates from an abandoned picker.
    await admin
      .from('artist_social_connections')
      .update({ status: 'disconnected', updated_at: new Date().toISOString() })
      .eq('artist_id', input.artistId)
      .eq('provider', input.provider)
      .eq('status', 'active');
    await admin
      .from('artist_social_connections')
      .delete()
      .eq('artist_id', input.artistId)
      .eq('provider', input.provider)
      .eq('status', 'candidate');
    // The same social account may not be active under another artist either; the partial
    // unique index enforces it, and the insert below surfaces 23505 if contested.
  }

  const { data, error } = await admin
    .from('artist_social_connections')
    .insert({
      artist_id: input.artistId,
      provider: input.provider,
      provider_account_id: input.providerAccountId,
      provider_username: input.providerUsername ?? null,
      access_token_enc: enc,
      token_expires_at: expiresAt,
      token_refreshed_at: new Date().toISOString(),
      status,
      webhook_subscribed: input.webhookSubscribed ?? false,
    })
    .select('id')
    .single();
  if (error || !data) {
    console.error('[fan-automations] connection save failed:', error?.code, error?.message);
    return null;
  }
  return { id: data.id };
}

export async function updateConnectionToken(
  admin: any,
  connectionId: string,
  accessToken: string,
  expiresInSeconds: number | null,
): Promise<boolean> {
  const enc = encryptToken(accessToken);
  if (!enc) return false;
  const { error } = await admin
    .from('artist_social_connections')
    .update({
      access_token_enc: enc,
      token_expires_at: expiresInSeconds ? new Date(Date.now() + expiresInSeconds * 1000).toISOString() : null,
      token_refreshed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', connectionId);
  return !error;
}

export async function markConnection(
  admin: any,
  connectionId: string,
  patch: { status?: string; webhookSubscribed?: boolean },
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status) update.status = patch.status;
  if (typeof patch.webhookSubscribed === 'boolean') update.webhook_subscribed = patch.webhookSubscribed;
  await admin.from('artist_social_connections').update(update).eq('id', connectionId);
}
