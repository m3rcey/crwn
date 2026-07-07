import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Bot detection — filter out crawlers, monitors, and preview generators
const BOT_PATTERNS = /bot|crawl|spider|slurp|facebookexternalhit|twitterbot|linkedinbot|discordbot|telegrambot|whatsapp|preview|monitor|uptime|pingdom|headless|phantom|selenium|puppeteer|lighthouse|pagespeed|gtmetrix/i;

function isBot(ua: string): boolean {
  return BOT_PATTERNS.test(ua);
}

// Simple hash for visitor fingerprinting (no PII stored)
// Uses only the client IP (first in x-forwarded-for chain) + user-agent
async function hashVisitor(request: NextRequest): Promise<string | null> {
  const ua = request.headers.get('user-agent') || 'unknown';

  // Skip bots entirely — they're not real visitors
  if (isBot(ua)) return null;

  // Use only the first IP (actual client), not the full proxy chain
  const forwardedFor = request.headers.get('x-forwarded-for');
  const ip = forwardedFor
    ? forwardedFor.split(',')[0].trim()
    : request.headers.get('x-real-ip') || 'unknown';

  const raw = `${ip}:${ua}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

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
  const protectedPaths = ['/home', '/explore', '/community', '/library', '/profile', '/setup', '/offers', '/proof-of-demand', '/missions', '/my-missions', '/earn', '/impact', '/command', '/clip-controls', '/action-plan', '/campaign-hub', '/studio', '/recruit/dashboard', '/admin', '/squads', '/my-squads', '/bounties', '/my-bounties', '/city-unlocks', '/playbooks'];
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
    const visitorHash = await hashVisitor(request);
    if (!visitorHash) return response; // Bot detected, skip tracking

    const userId = getUserIdFromCookie(request);

    // Detect artist page visits: /{slug} pattern (single segment, not a known route)
    const knownRoutes = ['home', 'explore', 'community', 'library', 'profile', 'login', 'signup',
      'admin', 'recruit', 'onboarding', 'support', 'terms', 'privacy', 'dmca', 'about',
      'welcome', 'setup', 'offers', 'proof-of-demand', 'missions', 'my-missions', 'earn', 'impact', 'command', 'clip-controls', 'action-plan', 'campaign-hub', 'studio', 'verify', 'reset-password', 'forgot-password', 'partner', 'join',
      'squads', 'my-squads', 'bounties', 'my-bounties', 'city-unlocks', 'city', 'playbooks',
      'artist', 'artist-agreement', 'founding-artists', 'getting-started', 'embed', 'link', 'worth'];
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
    fetch(trackUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
