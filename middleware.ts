import createMiddleware from 'next-intl/middleware';
import {createServerClient} from '@supabase/ssr';
import {NextResponse, type NextRequest} from 'next/server';
import {getPublicSupabaseEnv} from '@/lib/public-env';
import {routing} from '@/i18n/routing';

const intlMiddleware = createMiddleware(routing);

function contentSecurityPolicy(nonce: string, supabaseUrl: string) {
  const origin = new URL(supabaseUrl);
  const websocket = `wss://${origin.host}`;
  return [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${origin.origin} ${websocket} https://challenges.cloudflare.com`,
    "frame-src https://challenges.cloudflare.com",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests'
  ].join('; ');
}

function securityHeaders(response: NextResponse, nonce: string, csp: string) {
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('x-nonce', nonce);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (process.env.NODE_ENV === 'production') response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  return response;
}

export async function middleware(request: NextRequest) {
  const env = getPublicSupabaseEnv();
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  const csp = contentSecurityPolicy(nonce, env.NEXT_PUBLIC_SUPABASE_URL);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const path = request.nextUrl.pathname;
  const locale = routing.locales.find((value) => path === `/${value}` || path.startsWith(`/${value}/`)) ?? routing.defaultLocale;
  const isApi = path.startsWith('/api/');
  let response = isApi ? NextResponse.next({request: {headers: requestHeaders}}) : intlMiddleware(request);
  if (!isApi && !response.headers.has('Location')) {
    const overrides = new Set((response.headers.get('x-middleware-override-headers') ?? '').split(',').filter(Boolean));
    overrides.add('x-nonce');
    overrides.add('content-security-policy');
    response.headers.set('x-middleware-override-headers', [...overrides].join(','));
    response.headers.set('x-middleware-request-x-nonce', nonce);
    response.headers.set('x-middleware-request-content-security-policy', csp);
  }

  const needsSession = !isApi || path.startsWith('/api/profile/');
  const refreshedCookies: {name: string; value: string; options: Parameters<NextResponse['cookies']['set']>[2]}[] = [];
  if (needsSession) {
    const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          for (const cookie of cookies) {
            request.cookies.set(cookie.name, cookie.value);
            refreshedCookies.push(cookie);
          }
        }
      }
    });
    if (!isApi && !path.startsWith(`/${locale}/maintenance`) && !path.startsWith(`/${locale}/admin`)) {
      const {data: maintenance} = await supabase.rpc('maintenance_enabled');
      if (maintenance || process.env.MAINTENANCE_MODE === 'true') {
        response = NextResponse.redirect(new URL(`/${locale}/maintenance`, request.url));
        return securityHeaders(response, nonce, csp);
      }
    }
    const {data: {user}} = await supabase.auth.getUser();
    const isDashboard = path === `/${locale}/dashboard` || path.startsWith(`/${locale}/dashboard/`);
    const isAdmin = path === `/${locale}/admin` || path.startsWith(`/${locale}/admin/`);
    const isOnboarding = path === `/${locale}/onboarding`;
    if (isDashboard || isAdmin || isOnboarding) {
      if (!user) response = NextResponse.redirect(new URL(`/${locale}/sign-in${path.includes('/dashboard/team/invite') ? `?next=${encodeURIComponent(`${path.slice(locale.length + 1)}${request.nextUrl.search}`)}` : ''}`, request.url));
      else if (!user.email_confirmed_at) response = NextResponse.redirect(new URL(`/${locale}/verify-email${path.includes('/dashboard/team/invite') ? `?next=${encodeURIComponent(`${path.slice(locale.length + 1)}${request.nextUrl.search}`)}` : ''}`, request.url));
      else {
        const {data: profile} = await supabase.from('profiles').select('role,suspended').eq('id', user.id).single();
        if (!profile) response = NextResponse.redirect(new URL(`/${locale}/not-authorized`, request.url));
        else if (profile.suspended) response = NextResponse.redirect(new URL(`/${locale}/suspended`, request.url));
        else if (isAdmin) {
          const {data: allowed} = await supabase.rpc('is_admin');
          if (!allowed) response = NextResponse.redirect(new URL(`/${locale}/not-authorized`, request.url));
        }
      }
    }
  }
  for (const cookie of refreshedCookies) response.cookies.set(cookie.name, cookie.value, cookie.options);
  return securityHeaders(response, nonce, csp);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)']
};
