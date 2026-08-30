// Server-side Meta app configuration for Fan Automations. SERVER ONLY.
//
// Every value is read at call time and trimmed: a trailing space in a pasted Vercel var has
// already broken one Meta integration (code 100/33 on the publishing engine), so the trim
// is load-bearing, not cosmetic. Nothing here is ever NEXT_PUBLIC_.

import { socialTokenKeyConfigured } from '@/lib/social/connectionTokens';

const env = (name: string): string => (process.env[name] ?? '').trim();

export function siteBase(): string {
  return env('NEXT_PUBLIC_SITE_URL') || env('NEXT_PUBLIC_BASE_URL') || 'https://thecrwn.app';
}

export function igApp(): { id: string; secret: string } | null {
  const id = env('IG_APP_ID');
  const secret = env('IG_APP_SECRET');
  return id && secret ? { id, secret } : null;
}

export function fbApp(): { id: string; secret: string } | null {
  const id = env('FB_APP_ID');
  const secret = env('FB_APP_SECRET');
  return id && secret ? { id, secret } : null;
}

export function metaWebhookVerifyToken(): string {
  return env('META_WEBHOOK_VERIFY_TOKEN');
}

/** The candidate secrets for X-Hub-Signature-256 (either configured app may sign). */
export function metaAppSecrets(): Array<string | undefined> {
  return [igApp()?.secret, fbApp()?.secret];
}

export function igRedirectUri(): string {
  return `${siteBase()}/api/social-connect/callback/instagram`;
}

export function fbRedirectUri(): string {
  return `${siteBase()}/api/social-connect/callback/facebook`;
}

/** What the artist-facing UI may know: which providers are configured, never any secret. */
export function providerAvailability(): { instagram: boolean; facebook: boolean; storageReady: boolean } {
  return {
    instagram: !!igApp(),
    facebook: !!fbApp(),
    storageReady: socialTokenKeyConfigured(),
  };
}
