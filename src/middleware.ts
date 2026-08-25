import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
// Visitor identity moved to src/lib/analytics/visitorHash.ts (same algorithm, same bot list)
// because tier events need the SAME hash: a tier view and the page visit that contained it
// have to agree on who the visitor was, or the two tables can never be reconciled. Two copies
// would be one edit away from disagreeing silently.
import { hashVisitor } from '@/lib/analytics/visitorHash';

// Extract user ID from Supabase auth cookie (JWT payload)
function getUserIdFromCookie(request: NextRequest): string | null {
  const authCookie = request.cookies.getAll().find(c => c.name.includes('auth-token'));
  if (!authCookie) return null;
  try {
    // Supabase stores base64url-encoded JWT chunks — the main token has the user ID
    // For chunked cookies, the first chunk (base.0) contains the access token
    const tokenCookie = request.cookies.getAll().find(c => c.name.includes('auth-token') && !c.name.includes('.'));
    const value = tokenCookie?.value || authCookie.value;
    const parts = value.split('.');
    if (parts.length >= 2) {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload.sub || null;
    }
  } catch {
    // Silent fail
  }
  return null;
}

// DO NOT rename this file to `proxy.ts` yet, despite the Next 16.3 deprecation warning.
// Tried and reverted 2026-08-24. Next 16.3.0 accepts `src/proxy.ts` as a location and the build
// SUCCEEDS, prints no warning, and still prints "Proxy (Middleware)" in its route summary, but it
// compiles NOTHING: a clean build produced an empty `middleware-manifest.json` (no matcher) and no
// `.next/server/edge/chunks` at all, where the same build from `middleware.ts` produces both.
// A green build is not evidence here. Shipping that rename would silently stop this file running,
// and with it every protected-page auth redirect and the PKCE exchange below.
// Re-test on a later Next by diffing `.next/server/middleware-manifest.json` across the rename;
// migrate only when the matcher survives it.
export async function middleware(request: NextRequest) {
  // Update session and get response
  const response = await updateSession(request);

  // A PKCE code (email verification / password reset) means updateSession just
  // exchanged it and returned a redirect carrying the NEW session cookies in its
  // Set-Cookie headers. Return it untouched. Falling through to the auth-path
  // redirect below builds a fresh /home redirect that DROPS those cookies, so the
  // browser lands on /home with no session and useAuth sees user=null forever —
  // a blank /home that never advances to /welcome.
  if (request.nextUrl.searchParams.has('code')) {
    return response;
  }

  // Protected routes - redirect to login if not authenticated
  // '/account' covers the management screens the artist dashboard's tabs became
  // (profile, tiers, payouts, billing, referrals). They are as private as /profile.
  const protectedPaths = ['/home', '/explore', '/community', '/library', '/profile', '/account', '/setup', '/offers', '/proof-of-demand', '/missions', '/my-missions', '/earn', '/impact', '/command', '/clip-controls', '/action-plan', '/campaign-hub', '/studio', '/recruit/dashboard', '/admin', '/squads', '/my-squads', '/bounties', '/my-bounties', '/city-unlocks', '/playbooks', '/campaigns', '/artist/tools'];
  const isProtectedPath = protectedPaths.some(path =>
    request.nextUrl.pathname.startsWith(path)
  );

  // Auth routes - redirect to home if already authenticated
  const authPaths = ['/login', '/signup'];
  const isAuthPath = authPaths.some(path =>
    request.nextUrl.pathname.startsWith(path)
  );

  // Check for auth cookie - Supabase uses cookies named sb-REF-auth-token.
  // Exclude the PKCE code-verifier cookie (sb-REF-auth-token-code-verifier): it
  // also contains "auth-token" but is NOT a session, so counting it would bounce a
  // mid-signup user to /home with no session (the same black-screen failure mode).
  const hasAuthCookie = request.cookies.getAll().some(cookie =>
    cookie.name.includes('auth-token') && !cookie.name.includes('code-verifier')
  );

  if (isProtectedPath && !hasAuthCookie) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isAuthPath && hasAuthCookie) {
    return NextResponse.redirect(new URL('/home', request.url));
  }

  // Logged-in users skip the marketing homepage (an artist-acquisition pitch)
  // and land in the app.
  if (request.nextUrl.pathname === '/' && hasAuthCookie) {
    return NextResponse.redirect(new URL('/home', request.url));
  }

  // Fire-and-forget visitor tracking (non-blocking, skip bots)
  try {
    // Founder devices are never counted (src/lib/analytics/doNotTrack.ts). This gate also
    // covers /api/admin/track's visit writes, because this fetch is their only trusted caller.
    if (request.cookies.get('crwn_dnt')?.value === '1') return response;

    const visitorHash = await hashVisitor(request.headers);
    if (!visitorHash) return response; // Bot detected, skip tracking

    const userId = getUserIdFromCookie(request);

    // Detect artist page visits: /{slug} pattern (single segment, not a known route)
    const knownRoutes = ['home', 'explore', 'community', 'library', 'profile', 'account', 'login', 'signup',
      'admin', 'recruit', 'onboarding', 'support', 'terms', 'privacy', 'dmca', 'about',
      'welcome', 'setup', 'offers', 'proof-of-demand', 'missions', 'my-missions', 'earn', 'impact', 'command', 'clip-controls', 'action-plan', 'campaign-hub', 'studio', 'verify', 'reset-password', 'forgot-password', 'partner', 'join',
      'squads', 'my-squads', 'bounties', 'my-bounties', 'city-unlocks', 'city', 'playbooks', 'campaigns',
      'team', 'artist', 'artist-agreement', 'founding-artists', 'getting-started', 'embed', 'link', 'worth', 'tools'];
    const pathname = request.nextUrl.pathname;
    const segments = pathname.split('/').filter(Boolean);
    const artistSlug = segments.length === 1 && !knownRoutes.includes(segments[0])
      ? segments[0]
      : null;

    // Capture recruiter code from signup page URL for click tracking
    const recruiterCode = pathname === '/signup'
      ? request.nextUrl.searchParams.get('recruiter') || undefined
      : undefined;

    const trackUrl = new URL('/api/admin/track', request.url);
    const trackSecret = process.env.INTERNAL_TRACK_SECRET;
    fetch(trackUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Proves this call is the internal middleware, not a forged public POST.
        ...(trackSecret && { 'x-internal-secret': trackSecret }),
      },
      body: JSON.stringify({ visitorHash, userId, artistSlug, ...(recruiterCode && { recruiterCode }) }),
    }).catch(() => {}); // Silent fail
  } catch {
    // Never block page load for tracking
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|api/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
