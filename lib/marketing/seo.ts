import type {Metadata} from 'next';
import {BRAND_NAME, getSiteUrl} from '@/lib/config';
import type {Locale} from '@/i18n/routing';

export function marketingMetadata(locale: Locale, route: string, title: string, description: string): Metadata {
  const path = route ? `/${route}` : '';
  const url = getSiteUrl(`/${locale}${path}`);
  return {
    title, description, metadataBase: getSiteUrl(),
    alternates: {canonical: url.toString(), languages: {en: getSiteUrl(`/en${path}`).toString(), az: getSiteUrl(`/az${path}`).toString(), 'x-default': getSiteUrl(`/en${path}`).toString()}},
    openGraph: {title, description, url: url.toString(), siteName: BRAND_NAME, locale: locale === 'az' ? 'az_AZ' : 'en_US', type: 'website', images: [{url: getSiteUrl(`/${locale}/opengraph-image`).toString(), width: 1200, height: 630}]},
    twitter: {card: 'summary_large_image', title, description},
    robots: {index: true, follow: true}
  };
}
