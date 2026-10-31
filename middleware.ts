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
  const isProtected = path === `/${locale}/dashboard` || path.startsWith(`/${locale}/dashboard/`) ||
    path === `/${locale}/admin` || path.startsWith(`/${locale}/admin/`) || path === `/${locale}/onboarding`;
  requestHeaders.set('x-siteguard-path', path);
  let response = isApi ? NextResponse.next({request: {headers: requestHeaders}}) : intlMiddleware(request);
  if (!isApi && !response.headers.has('Location')) {
    const overrides = new Set((response.headers.get('x-middleware-override-headers') ?? '').split(',').filter(Boolean));
    overrides.add('x-nonce');
    overrides.add('content-security-policy');
    overrides.add('x-siteguard-path');
    response.headers.set('x-middleware-override-headers', [...overrides].join(','));
    response.headers.set('x-middleware-request-x-nonce', nonce);
    response.headers.set('x-middleware-request-content-security-policy', csp);
    response.headers.set('x-middleware-request-x-siteguard-path', path);
  }

  const refreshedCookies: {name: string; value: string; options: Parameters<NextResponse['cookies']['set']>[2]}[] = [];
  if (isProtected) {
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        supabase.auth.getClaims(),
        new Promise<null>((resolve) => {timer = setTimeout(() => resolve(null), 3000);})
      ]);
      // A timeout falls through to the server layout, which still uses getUser
      // and RLS. Claims are only a quick navigation hint, never authorization.
      if (result && !result.data?.claims) response = NextResponse.redirect(new URL(`/${locale}/sign-in${path.includes('/dashboard/team/invite') ? `?next=${encodeURIComponent(`${path.slice(locale.length + 1)}${request.nextUrl.search}`)}` : ''}`, request.url));
    } catch {
      // Protected layouts remain the source of truth when Supabase is slow.
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  for (const cookie of refreshedCookies) response.cookies.set(cookie.name, cookie.value, cookie.options);
  return securityHeaders(response, nonce, csp);
}

export const config = {
  matcher: ['/((?!_next/|api/cron/|api/webhooks/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|css|js|map|woff2?)$).*)']
};
