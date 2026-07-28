import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes accessible without a session
const PUBLIC_PREFIXES = ['/', '/login', '/register', '/forgot-password', '/reset-password', '/pricing', '/about'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Static assets — always pass through
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico' ||
    pathname === '/manifest.json'
  ) {
    return NextResponse.next();
  }

  // Public pages — no session required
  if (PUBLIC_PREFIXES.some((p) => pathname === p || (p !== '/' && pathname.startsWith(p)))) {
    return NextResponse.next();
  }

  // Protected routes — require session cookie
  const hasSession = req.cookies.get('session');
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
