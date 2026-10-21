'use client';

import {useLocale, useTranslations} from 'next-intl';
import {useTransition} from 'react';
import {toast} from '@/components/ui/toast';
import {usePathname, useRouter} from '@/i18n/navigation';
import type {Locale} from '@/i18n/routing';

export function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const t = useTranslations('Common');
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function change(nextLocale: Locale) {
    if (locale === nextLocale || pending) return;
    startTransition(async () => {
      try {
        const response = await fetch('/api/profile/locale', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({locale: nextLocale})});
        if (!response.ok) toast.error(t('unexpectedError'));
      } catch { toast.error(t('unexpectedError')); }
      router.replace(`${pathname}${window.location.search}${window.location.hash}`, {locale: nextLocale});
    });
  }

  return <div role="group" aria-label={t('language')} className="inline-flex items-center rounded-md border border-border p-0.5 text-xs font-semibold">
    {(['en', 'az'] as const).map((value, index) => <span key={value} className="inline-flex items-center">{index > 0 && <span className="text-muted-foreground" aria-hidden="true">|</span>}<button type="button" onClick={() => change(value)} disabled={pending} aria-pressed={locale === value} aria-label={value === 'en' ? t('english') : t('azerbaijani')} className="min-h-11 min-w-11 rounded px-2 text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground disabled:opacity-50">{value.toUpperCase()}</button></span>)}
  </div>;
}
