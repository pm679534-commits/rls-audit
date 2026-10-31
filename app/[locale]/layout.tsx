import type {Metadata, Viewport} from 'next';
import localFont from 'next/font/local';
import {NextIntlClientProvider, hasLocale} from 'next-intl';
import {getMessages} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {redirect} from 'next/navigation';
import {headers} from 'next/headers';
import {ThemeProvider} from '@/components/theme-provider';
import {Toaster} from '@/components/ui/toast';
import {CookieConsent} from '@/components/marketing/cookie-consent';
import {routing} from '@/i18n/routing';
import {BRAND_NAME, BRAND_TAGLINE} from '@/lib/config';
import {isMaintenanceMode} from '@/lib/system/maintenance';
import '../globals.css';

const inter = localFont({src: '../../public/fonts/inter-latin-ext-wght-normal.woff2', variable: '--font-inter', display: 'swap', weight: '100 900', preload: true});
const display = localFont({src: '../../public/fonts/dm-serif-display-latin-ext-400-normal.woff2', variable: '--font-dm', display: 'swap', weight: '400', preload: true});

export const metadata: Metadata = {
  title: {default: BRAND_NAME, template: `%s | ${BRAND_NAME}`},
  description: BRAND_TAGLINE,
  alternates: {languages: {en: '/en', az: '/az'}},
  robots: {index: true, follow: true}
};
export const viewport: Viewport = {width: 'device-width', initialScale: 1, viewportFit: 'cover'};

// Request-specific CSP nonces and maintenance state require request-time rendering.
export const dynamic = 'force-dynamic';

export default async function LocaleLayout({children, params}: Readonly<{children: React.ReactNode; params: Promise<{locale: string}>}>) {
  const {locale} = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const requestHeaders = await headers();
  const nonce = requestHeaders.get('x-nonce') ?? undefined;
  const path = requestHeaders.get('x-siteguard-path') ?? '';
  if (!path.startsWith(`/${locale}/admin`) && path !== `/${locale}/maintenance` && await isMaintenanceMode()) {
    redirect(`/${locale}/maintenance`);
  }
  const messages = await getMessages();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${inter.variable} ${display.variable}`}>
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
