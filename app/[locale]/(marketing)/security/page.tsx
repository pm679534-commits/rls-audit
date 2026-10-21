import type {Metadata} from 'next';
import {getTranslations} from 'next-intl/server';
import {getCompanyDetails} from '@/lib/config.server';
import {marketingMetadata} from '@/lib/marketing/seo';
import type {Locale} from '@/i18n/routing';

export async function generateMetadata({params}: {params: Promise<{locale: Locale}>}): Promise<Metadata> {
  const {locale} = await params; const t = await getTranslations({locale, namespace: 'Marketing.seo'});
  return marketingMetadata(locale, 'security', t('securityTitle'), t('securityDescription'));
}
export default async function SecurityPage() {
  const t = await getTranslations('Marketing.security');
  const company = getCompanyDetails();
  return <div className="container max-w-5xl py-16 sm:py-24"><header className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[.2em] text-accent-foreground">{t('eyebrow')}</p><h1 className="mt-4 font-display text-5xl sm:text-6xl">{t('title')}</h1><p className="mt-5 text-lg leading-relaxed text-muted-foreground">{t('intro')}</p></header>
    <div className="mt-14 grid gap-5 md:grid-cols-2">{[0,1,2,3,4,5].map((index) => <section key={index} className="rounded-2xl border bg-card p-7"><h2 className="text-xl font-semibold">{t(`items.${index}.title`)}</h2><p className="mt-3 leading-relaxed text-muted-foreground">{t(`items.${index}.body`)}</p></section>)}</div>
    <div className="mt-14 rounded-2xl border bg-secondary/50 p-8"><h2 className="font-display text-3xl">{t('reportTitle')}</h2><p className="mt-3 text-muted-foreground">{t('reportBody')}</p><a className="mt-5 inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4" href={`mailto:${company.email}?subject=SiteGuard%20security%20report`}>{company.email}</a></div>
  </div>;
}
