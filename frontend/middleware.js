import { NextResponse } from 'next/server';

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // ── Protect all /portal/* routes ─────────────────────────────────────────
  if (pathname.startsWith('/portal') && pathname !== '/portal/login') {
    const token = request.cookies.get('es_access_token')?.value;
    if (!token) {
      const loginUrl = new URL('/portal/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // ── Redirect logged-in users away from login page ─────────────────────────
  if (pathname === '/portal/login') {
    const token = request.cookies.get('es_access_token')?.value;
    if (token) {
      return NextResponse.redirect(new URL('/portal/dashboard', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/portal/:path*'],
};
