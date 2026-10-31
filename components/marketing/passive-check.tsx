'use client';

import {useState, type FormEvent} from 'react';
import Script from 'next/script';
import {ArrowRight, ShieldCheck, ShieldAlert} from 'lucide-react';
import {useLocale, useTranslations} from 'next-intl';
import {LazyMotion, domAnimation, m, MotionConfig} from 'framer-motion';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {ScoreRing} from '@/components/score-ring';
import {SeverityBadge, type Severity} from '@/components/severity-badge';
import {Link} from '@/i18n/navigation';

type PublicResult = {domain: string; score: number; findings: {id: string; severity: Severity; titleKey: string}[]};

export function PassiveCheck({turnstileKey, nonce}: {turnstileKey?: string; nonce?: string}) {
  const t = useTranslations('Marketing.widget');
  const scanner = useTranslations('Scanner.findings');
  const errors = useTranslations('Errors');
  const locale = useLocale();
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<PublicResult | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage(''); setResult(null);
    try {
      const form = event.currentTarget;
      const token = String(new FormData(form).get('cf-turnstile-response') ?? '');
      const response = await fetch('/api/public/check', {method: 'POST', headers: {'content-type': 'application/json', 'accept-language': locale},
        body: JSON.stringify({url, turnstileToken: token || undefined})});
      const body = await response.json();
      if (!response.ok) { const code = String(body?.error?.code ?? 'INTERNAL'); setMessage(errors.has(code) ? errors(code) : errors('INTERNAL')); return; }
      setResult(body as PublicResult);
    } catch { setMessage(errors('EXTERNAL_SERVICE')); }
    finally { setBusy(false); }
  }
  return <LazyMotion features={domAnimation}><MotionConfig reducedMotion="user"><m.div initial={{opacity: 0, y: 8}} animate={{opacity: 1, y: 0}} transition={{duration: 0.25}} className="rounded-2xl border bg-card p-5 shadow-soft sm:p-7">
    <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-accent text-accent-foreground"><ShieldCheck aria-hidden="true" /></span>
      <div><h2 className="text-lg font-semibold">{t('title')}</h2><p className="text-sm text-muted-foreground">{t('subtitle')}</p></div></div>
    <form className="mt-6 space-y-3" onSubmit={submit}>
      <Label htmlFor="public-site-url">{t('urlLabel')}</Label>
      <div className="flex flex-col gap-3 sm:flex-row"><Input id="public-site-url" name="url" type="url" inputMode="url" placeholder="https://example.com" autoComplete="url" value={url} onChange={(event) => setUrl(event.target.value)} required maxLength={2048} />
        <Button disabled={busy} type="submit" className="shrink-0">{busy ? t('checking') : t('check')}<ArrowRight aria-hidden="true" /></Button></div>
      {turnstileKey && <><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" nonce={nonce} /><div className="cf-turnstile" data-sitekey={turnstileKey} data-action="passive_check" /></>}
      <p className="text-xs leading-relaxed text-muted-foreground">{t('safeNote')}</p>
    </form>
    {message && <p className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{message}</p>}
    <div aria-live="polite" aria-busy={busy} className="mt-6 border-t pt-6">
      {result ? <div className="space-y-5"><div className="flex items-center gap-5"><ScoreRing score={result.score} label={t('score')} size={112} />
        <div><p className="font-semibold break-all">{result.domain}</p><p className="text-sm text-muted-foreground">{t('passiveResult')}</p></div></div>
        {result.findings.length ? <ul className="space-y-2">{result.findings.slice(0, 5).map((finding, index) => <li key={`${finding.id}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 p-3 text-sm"><span>{scanner(`${finding.id}.title`)}</span><SeverityBadge severity={finding.severity} /></li>)}</ul>
          : <p className="flex items-center gap-2 text-sm text-success"><ShieldCheck aria-hidden="true" className="size-4" />{t('noFindings')}</p>}
        <p className="text-xs text-muted-foreground">{t('limited')}</p><Button variant="outline" asChild><Link href="/sign-up">{t('fullScan')}<ArrowRight aria-hidden="true" /></Link></Button>
      </div> : <div className="flex min-h-28 items-center gap-4 rounded-xl border border-dashed bg-muted/30 p-5"><ShieldAlert className="size-7 shrink-0 text-muted-foreground motion-safe:animate-pulse" aria-hidden="true" /><p className="text-sm text-muted-foreground">{t('empty')}</p></div>}
    </div>
  </m.div></MotionConfig></LazyMotion>;
}
