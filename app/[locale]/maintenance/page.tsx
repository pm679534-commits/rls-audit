import type {Metadata} from 'next';
import {getTranslations} from 'next-intl/server';
import {Logo} from '@/components/logo';
import {BRAND_NAME} from '@/lib/config';

export const metadata: Metadata = {robots: {index: false, follow: false}};

export default async function MaintenancePage() {
  const t = await getTranslations('Common');
  return <main className="container flex min-h-dvh flex-col items-center justify-center gap-6 text-center">
    <Logo /><h1 className="font-display text-4xl">{t('maintenance', {brand: BRAND_NAME})}</h1>
    <p className="max-w-md text-muted-foreground">{t('maintenanceDetail')}</p>
  </main>;
}
