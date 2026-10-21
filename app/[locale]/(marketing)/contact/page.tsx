import type {Metadata} from 'next';
import {headers} from 'next/headers';
import {getTranslations} from 'next-intl/server';
import {ContactForm} from '@/components/marketing/contact-form';
import {getCompanyDetails} from '@/lib/config.server';
import {getPublicEnv} from '@/lib/env';
import {marketingMetadata} from '@/lib/marketing/seo';
import type {Locale} from '@/i18n/routing';

export async function generateMetadata({params}: {params: Promise<{locale: Locale}>}): Promise<Metadata> {
  const {locale} = await params; const t = await getTranslations({locale, namespace: 'Marketing.seo'});
  return marketingMetadata(locale, 'contact', t('contactTitle'), t('contactDescription'));
}
export default async function ContactPage() {
  const t = await getTranslations('Marketing.contact');
  const company = getCompanyDetails();
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return <div className="container grid gap-12 py-16 lg:grid-cols-[.75fr_1.25fr] lg:py-24"><header className="max-w-lg"><p className="text-xs font-bold uppercase tracking-[.2em] text-accent-foreground">{t('eyebrow')}</p><h1 className="mt-4 font-display text-5xl sm:text-6xl">{t('title')}</h1><p className="mt-5 text-lg leading-relaxed text-muted-foreground">{t('intro')}</p><p className="mt-8 text-sm text-muted-foreground">{t('emailAlternative')}</p><a href={`mailto:${company.email}`} className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4">{company.email}</a></header><ContactForm turnstileKey={getPublicEnv().NEXT_PUBLIC_TURNSTILE_SITE_KEY} nonce={nonce} /></div>;
}
