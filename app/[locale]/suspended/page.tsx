import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';

export default async function SuspendedPage() {
  const t = await getTranslations('Phase5.states');
  return <main className="container grid min-h-dvh place-items-center"><div className="max-w-lg rounded-xl border bg-card p-8 text-center"><h1 className="font-display text-3xl">{t('suspended')}</h1><p className="mt-3 text-muted-foreground">{t('suspendedBody')}</p><Link className="mt-5 inline-block text-primary underline" href="/">{t('home')}</Link></div></main>;
}
