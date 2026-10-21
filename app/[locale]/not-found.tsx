import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';

export default async function NotFoundPage() {
  const t = await getTranslations('Common');
  return <main className="container flex min-h-dvh flex-col items-center justify-center gap-5 text-center">
    <p className="text-sm font-semibold uppercase tracking-[.2em] text-muted-foreground">404</p>
    <h1 className="font-display text-4xl">{t('notFound')}</h1>
    <p className="max-w-md text-muted-foreground">{t('notFoundDetail')}</p>
    <Link href="/" className="inline-flex min-h-11 items-center text-primary underline underline-offset-4 dark:text-primary">{t('goHome')}</Link>
  </main>;
}
