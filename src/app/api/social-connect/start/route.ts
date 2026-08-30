// Start a Meta OAuth connect for the signed-in artist owner.
//
// Returns the provider authorize URL with a signed, time-boxed `state` binding this artist
// and this user. The browser never sees an app secret; the state is the only thing it
// carries, and the callback re-verifies both the signature and the session.

import { NextRequest, NextResponse } from 'next/server';
import { requireArtistOwner } from '@/lib/apiAuth';
import { mintOAuthState } from '@/lib/fanAutomations/oauthState';
import { igApp, fbApp, igRedirectUri, fbRedirectUri, providerAvailability } from '@/lib/fanAutomations/config';
import { igAuthorizeUrl, fbAuthorizeUrl } from '@/lib/fanAutomations/metaGraph';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const artistId = typeof body.artistId === 'string' ? body.artistId : '';
    const provider = body.provider === 'facebook' ? 'facebook' : body.provider === 'instagram' ? 'instagram' : null;
    if (!provider) return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });

    const owner = await requireArtistOwner(artistId);
    if (!owner.ok) return owner.error;

    const availability = providerAvailability();
    if (!availability.storageReady) {
      return NextResponse.json({ error: 'Connections are not available yet. CRWN is finishing setup on this feature.' }, { status: 503 });
    }

    const state = mintOAuthState({ artistId, userId: owner.userId, provider });
    if (!state) return NextResponse.json({ error: 'Could not start the connection. Try again.' }, { status: 500 });

    if (provider === 'instagram') {
      const app = igApp();
      if (!app) return NextResponse.json({ error: 'Instagram connections are not available yet.' }, { status: 503 });
      return NextResponse.json({ url: igAuthorizeUrl(app.id, igRedirectUri(), state) });
    }

    const app = fbApp();
    if (!app) return NextResponse.json({ error: 'Facebook connections are not available yet.' }, { status: 503 });
    return NextResponse.json({ url: fbAuthorizeUrl(app.id, fbRedirectUri(), state) });
  } catch (err) {
    console.error('[social-connect] start error:', err);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
