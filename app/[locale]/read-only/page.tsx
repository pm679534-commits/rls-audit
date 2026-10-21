import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {UpgradePrompt} from '@/components/account/trial-banner';

export default async function ReadOnlyPage() {
  const t = await getTranslations('Phase5.states');
  return <main className="container grid min-h-dvh place-items-center"><div className="max-w-lg rounded-xl border bg-card p-8 text-center"><h1 className="font-display text-3xl">{t('readOnly')}</h1><p className="mt-3 text-muted-foreground">{t('readOnlyBody')}</p><UpgradePrompt /><div><Link className="mt-5 inline-block text-primary underline" href="/dashboard">{t('dashboard')}</Link></div></div></main>;
}
