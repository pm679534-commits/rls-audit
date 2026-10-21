import {getBadgeScore} from '@/lib/reports';
import {checkRouteRateLimit} from '@/lib/rate-limit';
import {BRAND_NAME} from '@/lib/config';
import {toRouteError} from '@/lib/errors';
import {getTranslations} from 'next-intl/server';

export const runtime = 'nodejs';

export async function GET(request: Request, {params}: {params: Promise<{token: string}>}) {
  const locale = new URL(request.url).searchParams.get('lang') === 'az' ? 'az' : 'en';
  try {
    const rate = await checkRouteRateLimit(request, 'score-badge', 300, 3600);
    const score = await getBadgeScore((await params).token);
    const value = score === null ? '—' : String(score);
    const t = await getTranslations({locale, namespace: 'Phase7'});
    const name = BRAND_NAME.replace(/[<>&"']/g, (character) => ({'<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'}[character]!));
    const color = score === null ? '#64748b' : score >= 80 ? '#15803d' : score >= 50 ? '#b45309' : '#b91c1c';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="28" role="img" aria-label="${name} ${t('securityScore')} ${value}"><rect width="150" height="28" rx="5" fill="#1e293b"/><path d="M96 0h49a5 5 0 0 1 5 5v18a5 5 0 0 1-5 5H96z" fill="${color}"/><text x="48" y="18" text-anchor="middle" fill="white" font-family="Arial,sans-serif" font-size="12">${name}</text><text x="123" y="18" text-anchor="middle" fill="white" font-family="Arial,sans-serif" font-size="12">${value}/100</text></svg>`;
    return new Response(svg, {headers: {'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'RateLimit-Limit': rate.headers.get('RateLimit-Limit') ?? '300', 'RateLimit-Remaining': rate.headers.get('RateLimit-Remaining') ?? '0'}});
  } catch (error) { return toRouteError(error, {'Cache-Control': 'no-store'}, locale); }
}
