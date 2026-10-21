import type {Metadata} from 'next';
import {getTranslations} from 'next-intl/server';
import {ArrowRight, BellRing, FileCode2, GitCompareArrows, LockKeyhole, ScanSearch} from 'lucide-react';
import {Link} from '@/i18n/navigation';
import {Button} from '@/components/ui/button';
import {marketingMetadata} from '@/lib/marketing/seo';
import type {Locale} from '@/i18n/routing';

export async function generateMetadata({params}: {params: Promise<{locale: Locale}>}): Promise<Metadata> {
  const {locale} = await params; const t = await getTranslations({locale, namespace: 'Marketing.seo'});
  return marketingMetadata(locale, 'features', t('featuresTitle'), t('featuresDescription'));
}
const icons = [ScanSearch, LockKeyhole, FileCode2, BellRing, GitCompareArrows, ArrowRight];
export default async function FeaturesPage() {
  const t = await getTranslations('Marketing.featuresPage');
  return <div className="container py-16 sm:py-24"><header className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[.2em] text-accent-foreground">{t('eyebrow')}</p><h1 className="mt-4 font-display text-5xl sm:text-6xl">{t('title')}</h1><p className="mt-5 text-lg leading-relaxed text-muted-foreground">{t('intro')}</p></header>
    <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{icons.map((Icon, index) => <article key={index} className="rounded-2xl border bg-card p-7 shadow-soft"><Icon aria-hidden="true" className="size-8 text-accent-foreground" /><h2 className="mt-6 text-xl font-semibold">{t(`items.${index}.title`)}</h2><p className="mt-3 leading-relaxed text-muted-foreground">{t(`items.${index}.body`)}</p></article>)}</div>
    <div className="mt-14 rounded-2xl bg-primary p-8 text-primary-foreground sm:p-12"><h2 className="font-display text-3xl sm:text-4xl">{t('ctaTitle')}</h2><p className="mt-3 max-w-2xl opacity-90">{t('ctaBody')}</p><Button asChild variant="secondary" className="mt-7"><Link href="/sign-up">{t('cta')}<ArrowRight aria-hidden="true" /></Link></Button></div>
  </div>;
}
