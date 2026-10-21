import type {MetadataRoute} from 'next';
import {getSiteUrl} from '@/lib/config';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  return {rules: {userAgent: '*', allow: '/',
    disallow: ['/api/', '/en/admin/', '/az/admin/', '/en/dashboard/', '/az/dashboard/', '/en/onboarding', '/az/onboarding', '/en/maintenance', '/az/maintenance', '/en/not-authorized', '/az/not-authorized', '/en/suspended', '/az/suspended', '/en/read-only', '/az/read-only', '/en/reports/', '/az/reports/', '/en/sign-in', '/az/sign-in', '/en/sign-up', '/az/sign-up', '/en/forgot-password', '/az/forgot-password', '/en/reset-password', '/az/reset-password']},
    sitemap: getSiteUrl('/sitemap.xml').toString(), host: getSiteUrl().origin};
}
