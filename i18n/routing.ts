import {defineRouting} from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'az'],
  defaultLocale: 'en',
  localePrefix: 'always',
  localeCookie: {name: 'siteguard_locale', sameSite: 'lax', secure: process.env.NODE_ENV === 'production'}
});

export type Locale = (typeof routing.locales)[number];
