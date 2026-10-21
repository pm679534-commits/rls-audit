import type {Metadata} from 'next';
import {NextIntlClientProvider, hasLocale} from 'next-intl';
import {getMessages} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {headers} from 'next/headers';
import {ThemeProvider} from '@/components/theme-provider';
import {Toaster} from '@/components/ui/toast';
import {CookieConsent} from '@/components/marketing/cookie-consent';
import {routing} from '@/i18n/routing';
import {BRAND_NAME, BRAND_TAGLINE} from '@/lib/config';
import '@fontsource-variable/inter/wght.css';
import '@fontsource/dm-serif-display/400.css';
import '../globals.css';

export const metadata: Metadata = {
  title: {default: BRAND_NAME, template: `%s | ${BRAND_NAME}`},
  description: BRAND_TAGLINE,
  alternates: {languages: {en: '/en', az: '/az'}},
  robots: {index: true, follow: true}
};

export const dynamic = 'force-dynamic';

export default async function LocaleLayout({children, params}: Readonly<{children: React.ReactNode; params: Promise<{locale: string}>}>) {
  const {locale} = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const messages = await getMessages();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange nonce={nonce}>
            {children}
            <CookieConsent />
            <Toaster richColors position="bottom-right" />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
