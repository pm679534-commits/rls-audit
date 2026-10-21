import type {MetadataRoute} from 'next';
import {getSiteUrl} from '@/lib/config';
import {routing} from '@/i18n/routing';

export const dynamic = 'force-dynamic';

const routes = ['', '/features', '/how-it-works', '/pricing', '/security', '/changelog', '/contact', '/docs', '/terms', '/privacy', '/acceptable-use', '/cookies'] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.flatMap((route) => routing.locales.map((locale) => ({
    url: getSiteUrl(`/${locale}${route}`).toString(),
    alternates: {languages: Object.fromEntries(routing.locales.map((language) => [language, getSiteUrl(`/${language}${route}`).toString()]))},
    changeFrequency: route === '/changelog' ? 'weekly' as const : 'monthly' as const,
    priority: route === '' ? 1 : route === '/pricing' || route === '/features' ? 0.8 : 0.5
  })));
}
