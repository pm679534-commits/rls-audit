import {getPublicSiteUrl} from '@/lib/public-env';

export const BRAND_NAME = 'SiteGuard';
export const BRAND_TAGLINE = "Continuous security audits for small teams who can't afford enterprise tools.";

export function getSiteUrl(path = ''): URL {
  return new URL(path, `${getPublicSiteUrl().replace(/\/$/, '')}/`);
}

