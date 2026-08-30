// Instagram OAuth callback (Instagram API with Instagram Login).
//
// Authority is TWO independent checks, both required:
//   1. The signed `state` (mintOAuthState) proves CRWN started this flow for a specific
//      artist and user within the last 15 minutes.
//   2. requireArtistOwner proves the CURRENT session still owns that artist, and the user id
//      must equal the one baked into the state, so a state minted in one browser cannot
//      complete in another.
// Only then is the code exchanged (server-side, app secret never leaves the server), the
// long-lived token encrypted into artist_social_connections, and the account subscribed to
// comment webhooks. The browser receives a redirect and nothing else.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireArtistOwner } from '@/lib/apiAuth';
import { verifyOAuthState } from '@/lib/fanAutomations/oauthState';
import { igApp, igRedirectUri, siteBase } from '@/lib/fanAutomations/config';
import { igExchangeCode, igMe, igSubscribeWebhooks } from '@/lib/fanAutomations/metaGraph';
import { saveConnection, getActiveConnection, markConnection } from '@/lib/fanAutomations/connections';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function done(result: string): NextResponse {
  return NextResponse.redirect(`${siteBase()}/studio/automations?${result}`);
}

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get('code') || '';
    const state = verifyOAuthState(req.nextUrl.searchParams.get('state'));
    if (!state || state.provider !== 'instagram') return done('connect_error=state');
    if (!code) return done('connect_error=denied');

    const owner = await requireArtistOwner(state.artistId);
    if (!owner.ok || owner.userId !== state.userId) return done('connect_error=session');

    const app = igApp();
    if (!app) return done('connect_error=unavailable');

    const exchanged = await igExchangeCode({
      appId: app.id,
      appSecret: app.secret,
      redirectUri: igRedirectUri(),
      code,
    });
    if (!exchanged.ok || !exchanged.data) {
      console.error('[social-connect] IG exchange failed:', exchanged.status, exchanged.error);
      return done('connect_error=exchange');
    }

    const me = await igMe(exchanged.data.access_token);
    const accountId = me.data?.user_id ? String(me.data.user_id) : exchanged.data.user_id || '';
    if (!accountId) {
      console.error('[social-connect] IG me failed:', me.status, me.error);
      return done('connect_error=account');
    }

    const saved = await saveConnection(supabaseAdmin, {
      artistId: state.artistId,
      provider: 'instagram',
      providerAccountId: accountId,
      providerUsername: me.data?.username ?? null,
      accessToken: exchanged.data.access_token,
      expiresInSeconds: exchanged.data.expires_in ?? 60 * 60 * 24 * 60,
    });
    if (!saved) return done('connect_error=save');

    // Without this per-account subscription Meta never delivers a single comment event.
    const sub = await igSubscribeWebhooks(exchanged.data.access_token);
    if (sub.ok) {
      await markConnection(supabaseAdmin, saved.id, { webhookSubscribed: true });
    } else {
      console.error('[social-connect] IG subscribe failed:', sub.status, sub.error);
    }

    // Sanity read-back through the one reader; failure here means encryption or the write
    // silently regressed, and the honest answer is an error, not a green banner.
    const check = await getActiveConnection(supabaseAdmin, state.artistId, 'instagram');
    if (!check?.accessToken) return done('connect_error=save');

    return done('connected=instagram');
  } catch (err) {
    console.error('[social-connect] IG callback error:', err);
    return done('connect_error=unknown');
  }
}
