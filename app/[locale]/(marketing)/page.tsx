import type {Metadata} from 'next';
import {headers} from 'next/headers';
import {getTranslations} from 'next-intl/server';
import {ArrowRight, BellRing, FileCode2, LockKeyhole, ScanSearch, ShieldCheck} from 'lucide-react';
import {BRAND_NAME, getSiteUrl} from '@/lib/config';
import {getPublicEnv} from '@/lib/env';
import {Link} from '@/i18n/navigation';
import {Button} from '@/components/ui/button';
import {PassiveCheckLazy as PassiveCheck} from '@/components/marketing/passive-check-lazy';
import {PricingTable} from '@/components/marketing/pricing-table';
import {marketingMetadata} from '@/lib/marketing/seo';
import {PLANS} from '@/lib/plans';
import type {Locale} from '@/i18n/routing';

export async function generateMetadata({params}: {params: Promise<{locale: Locale}>}): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'Marketing.seo'});
  return marketingMetadata(locale, '', t('homeTitle'), t('homeDescription'));
}

const icons = [ShieldCheck, ScanSearch, FileCode2, BellRing, LockKeyhole, ArrowRight] as const;

export default async function HomePage({params}: {params: Promise<{locale: Locale}>}) {
  const {locale} = await params;
  const t = await getTranslations('Marketing.home');
  const faq = await getTranslations('Marketing.faq');
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const ld = [{ '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: BRAND_NAME,
    applicationCategory: 'SecurityApplication', operatingSystem: 'Web', url: getSiteUrl(`/${locale}`).toString(),
    description: t('intro'), offers: {'@type': 'AggregateOffer', priceCurrency: 'EUR', lowPrice: PLANS.starter.priceEur.monthly, highPrice: PLANS.agency.priceEur.monthly}},
    {'@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [0,1,2,3].map((index) => ({'@type': 'Question', name: faq(`q${index}`), acceptedAnswer: {'@type': 'Answer', text: faq(`a${index}`)}}))}];
  return <>
    <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{__html: JSON.stringify(ld).replace(/</g, '\\u003c')}} />
    <section className="relative overflow-hidden border-b bg-[radial-gradient(ellipse_at_top_right,hsl(var(--accent)),transparent_58%)]">
      <div className="container grid min-h-[690px] items-center gap-12 py-16 lg:grid-cols-[1.02fr_.98fr] lg:gap-16 lg:py-24">
        <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[.22em] text-accent-foreground">{t('eyebrow')}</p>
          <h1 className="mt-5 font-display text-5xl leading-[1.08] tracking-tight sm:text-6xl xl:text-7xl">{t('headline')}</h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground">{t('intro')}</p>
          <div className="mt-8 flex flex-wrap gap-3"><Button asChild size="lg"><Link href="/sign-up">{t('primaryCta')}<ArrowRight aria-hidden="true" /></Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/how-it-works">{t('secondaryCta')}</Link></Button></div>
          <p className="mt-5 text-sm text-muted-foreground">{t('trialNote')}</p>
        </div>
        <div className="motion-safe:animate-[float_7s_ease-in-out_infinite]"><PassiveCheck turnstileKey={getPublicEnv().NEXT_PUBLIC_TURNSTILE_SITE_KEY} nonce={nonce} /></div>
      </div>
    </section>
    <section className="container py-20 sm:py-28" aria-labelledby="home-how-title"><div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[.2em] text-accent-foreground">{t('howEyebrow')}</p><h2 id="home-how-title" className="mt-3 font-display text-4xl sm:text-5xl">{t('howTitle')}</h2><p className="mt-4 text-muted-foreground">{t('howIntro')}</p></div>
      <div className="mt-11 grid gap-5 md:grid-cols-3">{[0,1,2].map((index) => {const Icon = icons[index]; return <article key={index} className="rounded-2xl border bg-card p-7 shadow-soft"><span className="text-xs font-bold tabular-nums text-muted-foreground">0{index + 1}</span><Icon aria-hidden="true" className="mt-6 size-8 text-accent-foreground" /><h3 className="mt-5 text-xl font-semibold">{t(`steps.${index}.title`)}</h3><p className="mt-3 leading-relaxed text-muted-foreground">{t(`steps.${index}.body`)}</p></article>;})}</div>
      <Link href="/how-it-works" className="mt-7 inline-flex min-h-11 items-center gap-2 font-semibold text-primary underline-offset-4 hover:underline">{t('howLink')}<ArrowRight aria-hidden="true" className="size-4" /></Link>
    </section>
    <section className="border-y bg-secondary/40 py-20 sm:py-28" aria-labelledby="home-features-title"><div className="container"><div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[.2em] text-accent-foreground">{t('featuresEyebrow')}</p><h2 id="home-features-title" className="mt-3 font-display text-4xl sm:text-5xl">{t('featuresTitle')}</h2></div>
      <div className="mt-11 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[0,1,2,3,4,5].map((index) => {const Icon = icons[index]; return <article key={index} className="rounded-2xl border bg-card p-6"><Icon aria-hidden="true" className="size-7 text-accent-foreground" /><h3 className="mt-5 text-lg font-semibold">{t(`features.${index}.title`)}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(`features.${index}.body`)}</p></article>;})}</div>
      <Link href="/features" className="mt-7 inline-flex min-h-11 items-center gap-2 font-semibold text-primary underline-offset-4 hover:underline">{t('featuresLink')}<ArrowRight aria-hidden="true" className="size-4" /></Link></div></section>
    <section className="container py-20 sm:py-28" aria-labelledby="home-pricing-title"><div className="mb-9 max-w-2xl"><p className="text-xs font-bold uppercase tracking-[.2em] text-accent-foreground">{t('pricingEyebrow')}</p><h2 id="home-pricing-title" className="mt-3 font-display text-4xl sm:text-5xl">{t('pricingTitle')}</h2></div><PricingTable compact /><Link href="/pricing" className="mt-7 inline-flex min-h-11 items-center gap-2 font-semibold text-primary underline-offset-4 hover:underline">{t('pricingLink')}<ArrowRight aria-hidden="true" className="size-4" /></Link></section>
    <section className="border-y bg-secondary/40 py-20 sm:py-28" aria-labelledby="home-faq-title"><div className="container max-w-4xl"><h2 id="home-faq-title" className="font-display text-4xl sm:text-5xl">{faq('title')}</h2><div className="mt-8 divide-y border-y">{[0,1,2,3].map((index) => <details key={index} className="group py-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold marker:hidden">{faq(`q${index}`)}<span aria-hidden="true" className="text-2xl font-light transition-transform group-open:rotate-45">+</span></summary><p className="max-w-2xl pt-3 leading-relaxed text-muted-foreground">{faq(`a${index}`)}</p></details>)}</div></div></section>
    <section className="container py-20 text-center sm:py-28"><h2 className="font-display text-4xl sm:text-5xl">{t('finalTitle')}</h2><p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">{t('finalBody')}</p><Button asChild size="lg" className="mt-8"><Link href="/sign-up">{t('primaryCta')}<ArrowRight aria-hidden="true" /></Link></Button></section>
  </>;
}
