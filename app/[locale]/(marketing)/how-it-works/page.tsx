import type {Metadata} from 'next';
import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {Button} from '@/components/ui/button';
import {SCORING_MODEL} from '@/lib/scanner/scoring';
import {FINDING_REGISTRY} from '@/lib/scanner/registry';
import {marketingMetadata} from '@/lib/marketing/seo';
import type {Locale} from '@/i18n/routing';

export async function generateMetadata({params}: {params: Promise<{locale: Locale}>}): Promise<Metadata> {
  const {locale} = await params; const t = await getTranslations({locale, namespace: 'Marketing.seo'});
  return marketingMetadata(locale, 'how-it-works', t('howTitle'), t('howDescription'));
}
export default async function HowPage() {
  const t = await getTranslations('Marketing.howPage');
  const scanner = await getTranslations('Scanner.findings');
  const weights = Object.entries(FINDING_REGISTRY).filter(([, value]) => value.scoreWeight > 0).sort((a,b) => b[1].scoreWeight - a[1].scoreWeight).slice(0, 5);
  return <div className="container py-16 sm:py-24"><header className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[.2em] text-accent-foreground">{t('eyebrow')}</p><h1 className="mt-4 font-display text-5xl sm:text-6xl">{t('title')}</h1><p className="mt-5 text-lg leading-relaxed text-muted-foreground">{t('intro')}</p></header>
    <ol className="mt-14 grid gap-5 md:grid-cols-3">{[0,1,2].map((index) => <li key={index} className="rounded-2xl border bg-card p-7"><span className="font-display text-4xl text-accent-foreground">0{index + 1}</span><h2 className="mt-5 text-xl font-semibold">{t(`steps.${index}.title`)}</h2><p className="mt-3 leading-relaxed text-muted-foreground">{t(`steps.${index}.body`)}</p></li>)}</ol>
    <section aria-labelledby="scoring-title" className="mt-20 grid gap-9 lg:grid-cols-[.85fr_1.15fr]"><div><h2 id="scoring-title" className="font-display text-4xl">{t('scoreTitle')}</h2><p className="mt-5 leading-relaxed text-muted-foreground">{t('scoreIntro', {score: SCORING_MODEL.startingScore})}</p><p className="mt-4 leading-relaxed text-muted-foreground">{t('scoreDecay', {percent: Math.round(SCORING_MODEL.repeatedFindingDecay * 100)})}</p><p className="mt-4 leading-relaxed text-muted-foreground">{t('scoreLimits')}</p></div>
      <div className="overflow-hidden rounded-2xl border bg-card"><div className="border-b bg-muted/40 p-5 font-semibold">{t('examples')}</div><ul>{weights.map(([id, definition]) => <li key={id} className="flex items-center justify-between gap-4 border-b p-5 last:border-0"><span>{scanner(`${id}.title`)}</span><span className="shrink-0 rounded-md bg-muted px-3 py-1 font-semibold tabular-nums">−{definition.scoreWeight}</span></li>)}</ul><p className="border-t p-5 text-sm text-muted-foreground">{t('exampleNote')}</p></div></section>
    <div className="mt-14 rounded-2xl bg-secondary p-8 sm:p-10"><h2 className="font-display text-3xl">{t('scopeTitle')}</h2><p className="mt-4 max-w-3xl leading-relaxed text-muted-foreground">{t('scopeBody')}</p><Button asChild className="mt-6"><Link href="/sign-up">{t('cta')}</Link></Button></div>
  </div>;
}
