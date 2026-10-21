import type {Metadata} from 'next';
import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';

export const metadata: Metadata = {robots: {index: false, follow: false}};

export default async function NotAuthorizedPage() {
  const t = await getTranslations('Common');
  return <main className="container flex min-h-dvh flex-col items-center justify-center gap-6 text-center">
    <h1 className="font-display text-4xl">{t('notAuthorized')}</h1>
    <p className="max-w-md text-muted-foreground">{t('notAuthorizedDetail')}</p>
    <Link href="/" className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">{t('goHome')}</Link>
  </main>;
}
