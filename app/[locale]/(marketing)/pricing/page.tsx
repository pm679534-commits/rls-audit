import type {Metadata} from 'next';
import {getTranslations} from 'next-intl/server';
import {PricingTable} from '@/components/marketing/pricing-table';
import {marketingMetadata} from '@/lib/marketing/seo';
import type {Locale} from '@/i18n/routing';

export async function generateMetadata({params}: {params: Promise<{locale: Locale}>}): Promise<Metadata> {
  const {locale} = await params; const t = await getTranslations({locale, namespace: 'Marketing.seo'});
  return marketingMetadata(locale, 'pricing', t('pricingTitle'), t('pricingDescription'));
}
export default async function PricingPage() {
  const t = await getTranslations('Marketing.pricing');
  return <div className="container py-16 sm:py-24"><header className="mx-auto mb-12 max-w-3xl text-center"><p className="text-xs font-bold uppercase tracking-[.2em] text-accent-foreground">{t('eyebrow')}</p><h1 className="mt-4 font-display text-5xl sm:text-6xl">{t('title')}</h1><p className="mt-5 text-lg text-muted-foreground">{t('intro')}</p></header><PricingTable /></div>;
}
