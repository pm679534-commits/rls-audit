'use client';

import {useState, type FormEvent} from 'react';
import Script from 'next/script';
import {useLocale, useTranslations} from 'next-intl';
import {sendContactMessage} from '@/lib/marketing/contact';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Link} from '@/i18n/navigation';

export function ContactForm({turnstileKey, nonce}: {turnstileKey?: string; nonce?: string}) {
  const t = useTranslations('Marketing.contact');
  const locale = useLocale() as 'en' | 'az';
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const result = await sendContactMessage({name: String(data.get('name') ?? ''), email: String(data.get('email') ?? ''), subject: String(data.get('subject') ?? ''), body: String(data.get('body') ?? ''), locale, turnstileToken: String(data.get('cf-turnstile-response') ?? '') || undefined});
      if (!result.ok) { setMessage(result.error.message); return; }
      setSuccess(true); form.reset();
    } catch { setMessage(t('failed')); }
    finally { setBusy(false); }
  }
  if (success) return <div role="status" className="rounded-2xl border border-success/30 bg-accent p-8"><h2 className="text-xl font-semibold">{t('successTitle')}</h2><p className="mt-2 text-sm">{t('successBody')}</p><Button variant="outline" className="mt-6" onClick={() => setSuccess(false)}>{t('another')}</Button></div>;
  return <form onSubmit={submit} className="space-y-5 rounded-2xl border bg-card p-6 shadow-soft sm:p-8">
    <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="contact-name">{t('name')}</Label><Input id="contact-name" name="name" autoComplete="name" maxLength={120} required /></div>
      <div className="space-y-2"><Label htmlFor="contact-email">{t('email')}</Label><Input id="contact-email" name="email" type="email" autoComplete="email" maxLength={254} required /></div></div>
    <div className="space-y-2"><Label htmlFor="contact-subject">{t('subject')}</Label><Input id="contact-subject" name="subject" maxLength={200} required /></div>
    <div className="space-y-2"><Label htmlFor="contact-body">{t('message')}</Label><textarea id="contact-body" name="body" rows={7} minLength={10} maxLength={10000} required className="w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm" /></div>
    {turnstileKey && <><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" nonce={nonce} /><div className="cf-turnstile" data-sitekey={turnstileKey} data-action="contact" /></>}
    {message && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{message}</p>}
    <p className="text-sm text-muted-foreground">{t('privacyNotice')} <Link href="/privacy" className="text-primary underline underline-offset-4">{t('privacyLink')}</Link></p>
    <Button type="submit" disabled={busy}>{busy ? t('sending') : t('send')}</Button>
  </form>;
}
