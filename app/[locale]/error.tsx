'use client';

import {useTranslations} from 'next-intl';
import {Button} from '@/components/ui/button';

export default function ErrorPage({reset}: {error: Error & {digest?: string}; reset: () => void}) {
  const t = useTranslations('Common');
  return <main className="container flex min-h-dvh flex-col items-center justify-center gap-6 text-center">
    <h1 className="font-display text-4xl">{t('unexpectedError')}</h1>
    <p className="max-w-md text-muted-foreground">{t('unexpectedErrorDetail')}</p>
    <Button onClick={reset}>{t('retry')}</Button>
  </main>;
}
