import type {Metadata} from 'next';
import {getTranslations} from 'next-intl/server';
import {getCompanyDetails} from '@/lib/config.server';
import {marketingMetadata} from '@/lib/marketing/seo';
import {CookiePreferences} from '@/components/marketing/cookie-consent';
import type {Locale} from '@/i18n/routing';

export type LegalDocument = 'terms' | 'privacy' | 'acceptable-use' | 'cookies';

export async function legalMetadata(locale: Locale, document: LegalDocument): Promise<Metadata> {
  const t = await getTranslations({locale, namespace: `Legal.${document}`});
  return marketingMetadata(locale, document, t('title'), t('description'));
}

export async function LegalContent({locale, document}: {locale: Locale; document: LegalDocument}) {
  const t = await getTranslations({locale, namespace: `Legal.${document}`});
  const common = await getTranslations({locale, namespace: 'Legal.common'});
  const sections = t.raw('sections') as {title: string; paragraphs: string[]}[];
  const company = getCompanyDetails();
  const date = new Intl.DateTimeFormat(locale, {dateStyle: 'long'}).format(new Date('2026-10-21T00:00:00Z'));
  return <article className="container max-w-4xl py-16 sm:py-24"><header className="border-b pb-10"><p className="text-xs font-bold uppercase tracking-[.2em] text-accent-foreground">{common('eyebrow')}</p><h1 className="mt-4 font-display text-5xl sm:text-6xl">{t('title')}</h1><p className="mt-5 max-w-2xl text-lg text-muted-foreground">{t('description')}</p><p className="mt-4 text-sm text-muted-foreground">{common('effective', {date})}</p></header>
    <div className="space-y-11 py-12">{sections.map((section, index) => <section key={index} aria-labelledby={`legal-${index}`}><h2 id={`legal-${index}`} className="font-display text-2xl sm:text-3xl">{section.title}</h2>{section.paragraphs.map((paragraph, p) => <p key={p} className="mt-4 max-w-[72ch] leading-8 text-muted-foreground">{paragraph}</p>)}</section>)}</div>
    {document === 'cookies' && <CookiePreferences />}
    <aside className="mt-12 rounded-2xl border bg-secondary/50 p-6"><h2 className="text-lg font-semibold">{common('company')}</h2><p className="mt-3 leading-7">{company.legalName}<br />{company.address}<br /><a href={`mailto:${company.email}`} className="text-primary underline underline-offset-4">{company.email}</a></p>
      {company.registrationNumber && <p className="mt-2 text-sm text-muted-foreground">{common('registration')}: {company.registrationNumber}</p>}
      {company.vatNumber && <p className="mt-2 text-sm text-muted-foreground">{common('vat')}: {company.vatNumber}</p>}</aside>
  </article>;
}
