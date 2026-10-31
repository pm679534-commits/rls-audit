'use client';

import {useState, useTransition} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {PLANS, type PlanId, type BillingPeriod} from '@/lib/plans';
import type {ResolvedEntitlements} from '@/lib/billing/entitlements';
import type {BillingInvoice} from '@/lib/billing/provider';
import {startCheckout, changeBillingPlan, cancelBilling, resumeBilling, openBillingPortal} from '@/lib/billing/actions';

type Usage = {sites: number; scans: number; seats: number};

function UsageMeter({label, used, limit}: {label: string; used: number; limit: number | null}) {
  const percent = limit === null ? 0 : Math.min(100, Math.round(used / Math.max(limit, 1) * 100));
  return <div><div className="flex justify-between text-sm"><span>{label}</span><span>{used} / {limit ?? '∞'}</span></div>
    {limit !== null && <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)} className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{width: `${percent}%`}} /></div>}</div>;
}

export function BillingPage({entitlements, usage, invoices, invoiceError}: {entitlements: ResolvedEntitlements; usage: Usage; invoices: BillingInvoice[]; invoiceError: boolean}) {
  const t = useTranslations('Phase6');
  const overrideText = useTranslations('AdminPlanNotice');
  const router = useRouter();
  const [period, setPeriod] = useState<BillingPeriod>(entitlements.subscription?.billing_period ?? 'monthly');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const subscription = entitlements.subscription;
  const current = entitlements.effective_plan;
  const locale = typeof document === 'undefined' ? 'en' : document.documentElement.lang || 'en';
  function run(name: string, action: () => Promise<{ok: boolean; data?: {url?: string; updated?: boolean}; error?: {message: string}}>) {
    setError(null); setBusy(name);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) { setError(result.error?.message ?? t('actionFailed')); return; }
        if (result.data?.url) { window.location.assign(result.data.url); return; }
        router.refresh();
      } catch { setError(t('actionFailed')); } finally { setBusy(null); }
    });
  }
  const activePaid = subscription && ['active', 'trialing', 'past_due', 'paused'].includes(subscription.status);
  return <div className="space-y-6">
    {entitlements.paymentFailed && <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-5"><strong>{t('paymentFailedTitle')}</strong><p className="mt-1 text-sm">{t('paymentFailedBody')}</p></div>}
    {entitlements.is_trial && <div className="rounded-xl border border-primary/30 bg-primary/5 p-5"><strong>{t('trialTitle')}</strong><p className="text-sm">{t('trialEnds', {date: new Date(entitlements.trialEndsAt).toLocaleDateString(locale)})}</p></div>}
    {entitlements.read_only && <div className="rounded-xl border p-5"><strong>{t('readOnlyTitle')}</strong><p className="text-sm text-muted-foreground">{t('readOnlyBody')}</p></div>}
    <section className="rounded-xl border bg-card p-5"><h2 className="font-semibold">{t('currentPlan')}</h2><p className="mt-1 text-2xl font-semibold">{current ? PLANS[current].name : t('noPlan')}</p>
      <p className="mt-1 text-sm text-muted-foreground">{entitlements.source === 'override' ? overrideText('title') : entitlements.source === 'subscription' && subscription ? `${t(`status.${subscription.status}`)} · ${t(`period.${subscription.billing_period}`)}` : entitlements.is_trial ? t('trialStatus') : t('noSubscription')}</p>
      {entitlements.source === 'override' && <p className="mt-1 text-sm text-muted-foreground">{entitlements.overrideExpiresAt ? overrideText('expires', {date: new Date(entitlements.overrideExpiresAt).toLocaleDateString(locale)}) : overrideText('noExpiry')}</p>}
      {entitlements.source === 'override' && subscription && <p className="mt-3 text-sm text-muted-foreground">{overrideText('separateSubscription', {plan: PLANS[subscription.plan_id].name, status: t(`status.${subscription.status}`)})}</p>}
      {subscription?.billing_country && <p className="mt-1 text-sm text-muted-foreground">{t('country')}: {subscription.billing_country}</p>}
      {subscription?.current_period_end && <p className="mt-1 text-sm text-muted-foreground">{t('periodEnd', {date: new Date(subscription.current_period_end).toLocaleDateString(locale)})}</p>}
      {subscription?.cancel_at_period_end && <p className="mt-2 text-sm font-medium">{t('cancellationScheduled')}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        {subscription?.paddle_customer_id && <button disabled={pending} onClick={() => run('portal', () => openBillingPortal({}))} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">{busy === 'portal' ? t('working') : t('portal')}</button>}
        {subscription?.status === 'active' && !subscription.cancel_at_period_end && <button disabled={pending} onClick={() => {if (window.confirm(t('cancelConfirm'))) run('cancel', () => cancelBilling({}));}} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">{t('cancelAtEnd')}</button>}
        {(subscription?.cancel_at_period_end || subscription?.status === 'paused') && <button disabled={pending} onClick={() => run('resume', () => resumeBilling({}))} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">{t('resume')}</button>}
      </div>
    </section>
    <section className="rounded-xl border bg-card p-5"><h2 className="font-semibold">{t('usage')}</h2><div className="mt-5 grid gap-5 md:grid-cols-3"><UsageMeter label={t('sites')} used={usage.sites} limit={entitlements.site_limit ?? 0} /><UsageMeter label={t('manualScans')} used={usage.scans} limit={entitlements.manual_scans_per_month} /><UsageMeter label={t('teamSeats')} used={usage.seats} limit={entitlements.team_member_limit ?? 0} /></div></section>
    <section><div className="flex flex-wrap items-center justify-between gap-4"><h2 className="font-display text-2xl">{t('choosePlan')}</h2><div className="flex rounded-lg border p-1"><button aria-pressed={period === 'monthly'} onClick={() => setPeriod('monthly')} className={`rounded-md px-4 py-2 text-sm ${period === 'monthly' ? 'bg-primary text-primary-foreground' : ''}`}>{t('period.monthly')}</button><button aria-pressed={period === 'annual'} onClick={() => setPeriod('annual')} className={`rounded-md px-4 py-2 text-sm ${period === 'annual' ? 'bg-primary text-primary-foreground' : ''}`}>{t('period.annual')}</button></div></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">{(['starter', 'pro', 'agency'] as PlanId[]).map((id) => <article key={id} className={`rounded-xl border bg-card p-5 ${current === id ? 'border-primary' : ''}`}><h3 className="text-xl font-semibold">{PLANS[id].name}</h3><p className="mt-3 text-3xl font-bold">€{PLANS[id].priceEur[period]} <span className="text-sm font-normal text-muted-foreground">/ {t(`period.${period}`)}</span></p><p className="mt-3 text-sm text-muted-foreground">{t('planDetails', {sites: PLANS[id].limits.sites, seats: PLANS[id].limits.teamMembers})}</p>
        <button disabled={pending || (!!activePaid && subscription?.plan_id === id && subscription.billing_period === period) || (!!activePaid && subscription?.status !== 'active' && subscription?.status !== 'trialing') || !!subscription?.cancel_at_period_end}
          onClick={() => run(id, () => activePaid ? changeBillingPlan({plan: id, period}) : startCheckout({plan: id, period}))}
          className="mt-5 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy === id ? t('working') : activePaid && subscription?.plan_id === id && subscription.billing_period === period ? t('current') : activePaid ? t('changePlan') : t('selectPlan')}</button></article>)}</div>
    </section>
    {error && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
    <section className="rounded-xl border bg-card p-5"><h2 className="font-semibold">{t('invoices')}</h2>{invoiceError ? <p role="status" className="mt-3 text-sm text-muted-foreground">{t('invoiceUnavailable')}</p> : invoices.length ? <ul className="mt-4 divide-y">{invoices.map((invoice) => <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span>{invoice.number} · {new Date(invoice.date).toLocaleDateString(locale)} · {invoice.currency} {invoice.total ? (Number(invoice.total) / 100).toFixed(2) : ''}</span>{invoice.invoiceUrl && <a href={invoice.invoiceUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline">{t('viewInvoice')}</a>}</li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">{t('noInvoices')}</p>}</section>
  </div>;
}
