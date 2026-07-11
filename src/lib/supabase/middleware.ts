import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy-key-for-build';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Handle PKCE code exchange (email verification, password reset)
  const code = request.nextUrl.searchParams.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    // Redirect to same URL without code param
    const url = request.nextUrl.clone();
    url.searchParams.delete('code');
    if (error) {
      // Exchange fails whenever the link is opened in a different browser/webview
      // than signup (e.g. Gmail's in-app browser) — there's no PKCE code-verifier
      // cookie to exchange. The email is still verified (Supabase confirms it
      // before redirecting here); we just can't establish a session in THIS
      // browser. Send them to login WITH the verified banner (not a blank login
      // page) so they know it worked and can sign in. Password-reset links land
      // on /reset-password, so only the signup-verification path (/verify) gets
      // the banner.
      const isVerification = request.nextUrl.pathname.startsWith('/verify');
      const dest = isVerification ? '/login?verified=true' : '/login';
      return NextResponse.redirect(new URL(dest, request.url));
    }
    // supabaseResponse already has the cookies set by exchangeCodeForSession
    // Just update it to redirect instead of passing through
    return NextResponse.redirect(url, {
      headers: supabaseResponse.headers,
    });
  }

  // Refresh session if expired
  await supabase.auth.getUser();

  return supabaseResponse;
}
