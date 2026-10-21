import {getPublicEnv} from '@/lib/public-env';

export const BRAND_NAME = 'SiteGuard';
export const BRAND_TAGLINE = "Continuous security audits for small teams who can't afford enterprise tools.";

export function getSiteUrl(path = ''): URL {
  return new URL(path, `${getPublicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')}/`);
}

