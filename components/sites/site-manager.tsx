'use client';

import {useEffect, useState, useTransition, type FormEvent} from 'react';
import {useLocale, useTranslations} from 'next-intl';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {addSiteAction, editSiteAction, deleteSiteAction, pauseSiteAction, beginVerificationAction, verifySiteAction, startScanAction} from '@/lib/sites/actions';
import type {Tables} from '@/types/database';

export function SiteForm({site}: {site?: Tables<'sites'>}) {
  const t = useTranslations('Phase5.sites');
  const router = useRouter();
  const locale = useLocale();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    const input = {name: String(form.get('name') ?? ''), url: String(form.get('url') ?? '')};
    const result = site ? await editSiteAction({...input, siteId: site.id}) : await addSiteAction(input);
    setBusy(false);
    if (!result.ok) return setError(result.error.message);
    router.push(`/${locale}/dashboard/sites/${result.data.id}`);
    router.refresh();
  }
  return <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-5">
    <div className="space-y-2"><Label htmlFor="site-name">{t('name')}</Label><Input id="site-name" name="name" defaultValue={site?.name} maxLength={120} required /></div>
    <div className="space-y-2"><Label htmlFor="site-url">{t('url')}</Label><Input id="site-url" name="url" type="url" inputMode="url" autoComplete="url" defaultValue={site?.normalized_url} placeholder="https://example.com" required /></div>
    {site && <p className="text-xs text-muted-foreground">{t('urlChangeWarning')}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button disabled={busy} type="submit">{busy ? t('working') : site ? t('save') : t('add')}</Button>
  </form>;
}

export function VerificationControls({site, challenge}: {site: Tables<'sites'>; challenge: Tables<'site_verifications'> | null}) {
  const t = useTranslations('Phase5.verify');
  const extra = useTranslations('Phase5Labels');
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function begin(method: 'dns_txt' | 'meta_tag' | 'well_known_file') {
    setBusy(true); setMessage('');
    const result = await beginVerificationAction({siteId: site.id, method});
    setBusy(false);
    if (!result.ok) setMessage(result.error.message);
    else router.refresh();
  }
  async function check() {
    setBusy(true); setMessage('');
    const result = await verifySiteAction({siteId: site.id});
    setBusy(false);
    if (!result.ok) setMessage(result.error.message);
    else {
      const outcome = result.data;
      setMessage(outcome.verified ? t('success') : outcome.reason === 'http_status'
        ? t('reasons.http_status', {status: outcome.httpStatus ?? 0})
        : t(`reasons.${outcome.reason ?? 'verification_unavailable'}`));
      router.refresh();
    }
  }
  const host = new URL(site.normalized_url).hostname;
  return <section className="rounded-xl border bg-card p-5" aria-labelledby="verify-heading">
    <h2 id="verify-heading" className="text-lg font-semibold">{t('title')}</h2>
    <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
    <div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => begin('dns_txt')}>{t('dns')}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => begin('meta_tag')}>{t('meta')}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => begin('well_known_file')}>{t('file')}</Button></div>
    {challenge && <div className="mt-5 space-y-3 rounded-lg bg-muted p-4 text-sm">
      <p className="font-medium">{t(`method.${challenge.method}`)}</p>
      {challenge.method === 'dns_txt' && <><p>{t('dnsInstructions', {host: `_siteguard.${site.domain}`})}</p><p>{t('dnsAlternative', {host: site.domain})}</p>{host === `www.${site.domain}` && <p>{t('dnsWwwAlternative', {host: `_siteguard.${host}`})}</p>}<p className="text-xs text-muted-foreground">{t('dnsDelay')}</p></>}
      {challenge.method === 'meta_tag' && <p>{extra('metaInstructions')}</p>}
      {challenge.method === 'well_known_file' && <p>{t('fileInstructions', {path: `https://${host}/.well-known/siteguard-verification.txt`})}</p>}
      <code className="block break-all rounded bg-background p-3 select-all">{challenge.method === 'meta_tag' ? `<meta name="siteguard-verification" content="${challenge.challenge_value}">` : challenge.challenge_value}</code>
      <p className="text-xs text-muted-foreground">{t('expires', {date: new Date(challenge.expires_at).toLocaleString()})}</p>
      <Button type="button" disabled={busy} onClick={check}>{busy ? t('working') : t('verifyNow')}</Button>
    </div>}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
  </section>;
}

export function SiteControls({site}: {site: Tables<'sites'>}) {
  const t = useTranslations('Phase5.sites');
  const router = useRouter();
  const locale = useLocale();
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const [paused, setPaused] = useState(site.status === 'paused');
  useEffect(() => setPaused(site.status === 'paused'), [site.status]);
  const pause = () => {
    const next = !paused;
    setPaused(next); setError('');
    startTransition(async () => {
      const result = await pauseSiteAction({siteId: site.id, paused: next});
      if (!result.ok) {setPaused(!next); setError(result.error.message);}
      else router.refresh();
    });
  };
  const remove = async () => {
    setBusy(true);
    const result = await deleteSiteAction({siteId: site.id, confirmation});
    setBusy(false);
    if (!result.ok) setError(result.error.message); else {router.push(`/${locale}/dashboard/sites`); router.refresh();}
  };
  return <section className="space-y-4 rounded-xl border bg-card p-5"><h2 className="text-lg font-semibold">{t('management')}</h2>
    {site.paused_reason !== 'plan_limit' && <Button type="button" variant="outline" disabled={busy || pending} onClick={pause}>{paused ? t('resume') : t('pause')}</Button>}
    <div className="space-y-2 border-t pt-4"><Label htmlFor="delete-site">{t('deleteConfirm')}</Label><Input id="delete-site" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /><Button type="button" variant="destructive" disabled={busy || confirmation !== 'DELETE'} onClick={remove}>{t('delete')}</Button></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}

export function FirstScanButton({siteId, kind = 'manual'}: {siteId: string; kind?: 'manual' | 'passive'}) {
  const t = useTranslations('Phase5.sites');
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const start = () => {
    setMessage(t('working'));
    startTransition(async () => {
      const result = await startScanAction({siteId, kind, idempotencyKey: crypto.randomUUID()});
      if (!result.ok) {
        setMessage(result.error.code === 'SCAN_IN_PROGRESS' ? t('scanInProgress') : result.error.message);
        if (result.error.code === 'SCAN_IN_PROGRESS') {router.push(`/${locale}/dashboard/sites/${siteId}`); router.refresh();}
      } else {setMessage(t('scanQueued')); router.refresh();}
    });
  };
  return <div><Button type="button" disabled={pending} onClick={start}>{pending ? t('working') : t('startScan')}</Button>{message && <p role="status" className="mt-2 text-sm">{message}</p>}</div>;
}
