// Facebook OAuth callback (Facebook Login for Pages).
//
// Same two-check authority as the Instagram callback: signed state AND a live session that
// owns the artist named in it. The exchange yields the user's Pages with long-lived PAGE
// tokens (which carry no expiry). One Page connects immediately; several become 'candidate'
// rows the artist picks from on /studio/automations. Candidates are never resolved by the
// webhook and hold their own encrypted Page token, so the picker needs no cookie state.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireArtistOwner } from '@/lib/apiAuth';
import { verifyOAuthState } from '@/lib/fanAutomations/oauthState';
import { fbApp, fbRedirectUri, siteBase } from '@/lib/fanAutomations/config';
import { fbExchangeCodeForPages, fbSubscribePage } from '@/lib/fanAutomations/metaGraph';
import { saveConnection, markConnection } from '@/lib/fanAutomations/connections';

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
    if (!state || state.provider !== 'facebook') return done('connect_error=state');
    if (!code) return done('connect_error=denied');

    const owner = await requireArtistOwner(state.artistId);
    if (!owner.ok || owner.userId !== state.userId) return done('connect_error=session');

    const app = fbApp();
    if (!app) return done('connect_error=unavailable');

    const pages = await fbExchangeCodeForPages({
      appId: app.id,
      appSecret: app.secret,
      redirectUri: fbRedirectUri(),
      code,
    });
    if (!pages.ok || !pages.data) {
      console.error('[social-connect] FB exchange failed:', pages.status, pages.error);
      return done('connect_error=exchange');
    }
    const usable = pages.data.filter((p) => p.id && p.access_token);
    if (usable.length === 0) return done('connect_error=no_pages');

    if (usable.length === 1) {
      const page = usable[0];
      const saved = await saveConnection(supabaseAdmin, {
        artistId: state.artistId,
        provider: 'facebook',
        providerAccountId: page.id,
        providerUsername: page.name || null,
        accessToken: page.access_token,
        expiresInSeconds: null,
      });
      if (!saved) return done('connect_error=save');
      const sub = await fbSubscribePage(page.access_token, page.id);
      if (sub.ok) await markConnection(supabaseAdmin, saved.id, { webhookSubscribed: true });
      else console.error('[social-connect] FB subscribe failed:', sub.status, sub.error);
      return done('connected=facebook');
    }

    // Several Pages: store each as a candidate, let the artist pick one in the UI.
    let stored = 0;
    for (const page of usable.slice(0, 10)) {
      const saved = await saveConnection(supabaseAdmin, {
        artistId: state.artistId,
        provider: 'facebook',
        providerAccountId: page.id,
        providerUsername: page.name || null,
        accessToken: page.access_token,
        expiresInSeconds: null,
        status: 'candidate',
      });
      if (saved) stored += 1;
    }
    if (stored === 0) return done('connect_error=save');
    return done('pick_page=1');
  } catch (err) {
    console.error('[social-connect] FB callback error:', err);
    return done('connect_error=unknown');
  }
}
