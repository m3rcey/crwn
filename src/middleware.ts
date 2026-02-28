import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  // Update session and get response
  const response = await updateSession(request);

  // Protected routes - redirect to login if not authenticated
  const protectedPaths = ['/home', '/explore', '/community', '/library', '/profile'];
  const isProtectedPath = protectedPaths.some(path => 
    request.nextUrl.pathname.startsWith(path)
  );

  // Auth routes - redirect to home if already authenticated
  const authPaths = ['/login', '/signup'];
  const isAuthPath = authPaths.some(path => 
    request.nextUrl.pathname.startsWith(path)
  );

  // Check for auth cookie
  const hasAuthCookie = request.cookies.has('sb-access-token') || 
                        request.cookies.has('sb-refresh-token');

  if (isProtectedPath && !hasAuthCookie) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isAuthPath && hasAuthCookie) {
    return NextResponse.redirect(new URL('/home', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
