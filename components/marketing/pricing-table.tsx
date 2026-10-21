'use client';

import {useState} from 'react';
import {Check, Minus} from 'lucide-react';
import {useLocale, useTranslations} from 'next-intl';
import {Link} from '@/i18n/navigation';
import {Button} from '@/components/ui/button';
import {PLANS, PLAN_FEATURES, PLAN_IDS, type BillingPeriod, type PlanFeature} from '@/lib/plans';

export function PricingTable({compact = false}: {compact?: boolean}) {
  const t = useTranslations('Marketing.pricing');
  const features = useTranslations('Marketing.planFeatures');
  const locale = useLocale();
  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const format = (value: number) => new Intl.NumberFormat(locale, {style: 'currency', currency: 'EUR', maximumFractionDigits: 0}).format(value);
  return <div className="space-y-9">
    <div className="flex flex-wrap items-center justify-between gap-4"><p className="text-sm text-muted-foreground">{t('trial')}</p>
      <div role="group" aria-label={t('billingPeriod')} className="inline-flex rounded-xl border bg-card p-1">
        {(['monthly', 'annual'] as const).map((value) => <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)} className="min-h-11 rounded-lg px-5 text-sm font-semibold transition-colors aria-pressed:bg-primary aria-pressed:text-primary-foreground">{t(value)}</button>)}
      </div></div>
    <div className="grid gap-5 lg:grid-cols-3">{PLAN_IDS.map((id) => { const plan = PLANS[id]; return <article key={id} className={`relative flex flex-col rounded-2xl border bg-card p-6 shadow-soft sm:p-8 ${id === 'pro' ? 'border-primary ring-1 ring-primary/20' : ''}`}>
      {id === 'pro' && <p className="mb-4 self-start rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">{t('popular')}</p>}
      <h3 className="font-display text-3xl">{plan.name}</h3><p className="mt-2 min-h-12 text-sm text-muted-foreground">{t(`plans.${id}`)}</p>
      <p className="mt-7 text-4xl font-semibold tracking-tight tabular-nums">{format(period === 'annual' ? plan.priceEur.annual / 12 : plan.priceEur.monthly)}<span className="ml-1 text-base font-normal text-muted-foreground">{t('perMonth')}</span></p>
      <p className="mt-2 min-h-6 text-sm text-muted-foreground">{period === 'annual' ? t('billedAnnually', {total: format(plan.priceEur.annual)}) : t('billedMonthly')}</p>
      <Button asChild className="mt-7 w-full" variant={id === 'pro' ? 'default' : 'outline'}><Link href="/sign-up">{t('startTrial')}</Link></Button>
      <ul className="mt-7 flex-1 space-y-3 border-t pt-6 text-sm">
        <li className="flex gap-3"><Check aria-hidden="true" className="size-4 shrink-0 text-success" />{t('sites', {count: plan.limits.sites})}</li>
        <li className="flex gap-3"><Check aria-hidden="true" className="size-4 shrink-0 text-success" />{t('scanInterval', {hours: plan.scanIntervalHours})}</li>
        <li className="flex gap-3"><Check aria-hidden="true" className="size-4 shrink-0 text-success" />{t('history', {days: plan.limits.historyDays})}</li>
        {!compact && PLAN_FEATURES.filter((feature) => plan.features[feature]).slice(0, 8).map((feature) => <li key={feature} className="flex gap-3"><Check aria-hidden="true" className="size-4 shrink-0 text-success" />{features(feature)}</li>)}
      </ul>
    </article>; })}</div>
    {!compact && <div className="overflow-x-auto rounded-2xl border bg-card"><table className="w-full min-w-[640px] border-collapse text-left text-sm"><caption className="p-5 text-left font-display text-2xl">{t('comparison')}</caption>
      <thead><tr className="border-y bg-muted/40"><th scope="col" className="p-4">{t('feature')}</th>{PLAN_IDS.map((id) => <th scope="col" key={id} className="p-4">{PLANS[id].name}</th>)}</tr></thead>
      <tbody>{PLAN_FEATURES.map((feature: PlanFeature) => <tr key={feature} className="border-b last:border-0"><th scope="row" className="p-4 font-medium">{features(feature)}</th>{PLAN_IDS.map((id) => <td key={id} className="p-4">{PLANS[id].features[feature] ? <span className="inline-flex items-center gap-2"><Check className="size-4 text-success" aria-hidden="true" /><span className="sr-only">{t('included')}</span></span> : <span><Minus className="size-4 text-muted-foreground" aria-hidden="true" /><span className="sr-only">{t('notIncluded')}</span></span>}</td>)}</tr>)}</tbody>
    </table></div>}
    <p className="text-sm text-muted-foreground">{t('taxNote')}</p>
  </div>;
}
