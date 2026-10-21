import {ShieldCheck} from 'lucide-react';
import {useTranslations} from 'next-intl';
import {BRAND_NAME} from '@/lib/config';
import {Link} from '@/i18n/navigation';
import {cn} from '@/lib/utils';

export function Logo({className}: {className?: string}) {
  const t = useTranslations('Common');
  return <Link href="/" className={cn('inline-flex items-center gap-2.5 rounded-sm font-semibold tracking-tight text-foreground', className)} aria-label={t('homeLink', {brand: BRAND_NAME})}>
    <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><ShieldCheck className="size-5" aria-hidden="true" /></span>
    <span className="text-lg">{BRAND_NAME}</span>
  </Link>;
}
