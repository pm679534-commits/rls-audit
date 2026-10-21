'use client';

import {useState, type FormEvent} from 'react';
import Script from 'next/script';
import {useLocale, useTranslations} from 'next-intl';
import {Link} from '@/i18n/navigation';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {signUp, signIn, sendMagicLink, forgotPassword, resetPassword, resendVerification, startOAuth} from '@/lib/auth/actions';

export type AuthMode = 'sign-up' | 'sign-in' | 'magic-link' | 'verify-email' | 'forgot-password' | 'reset-password';

export function AuthForm({mode, turnstileKey, nonce, callbackError = false, next}: {mode: AuthMode; turnstileKey?: string; nonce?: string; callbackError?: boolean; next?: string}) {
  const t = useTranslations('Phase5.auth');
  const extra = useTranslations('Phase5Labels');
  const locale = useLocale() as 'en' | 'az';
  const callbacks = useTranslations('Phase5Callbacks');
  const [message, setMessage] = useState(callbackError ? callbacks('error') : '');
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const showEmail = mode !== 'reset-password';
  const showPassword = ['sign-up', 'sign-in', 'reset-password'].includes(mode);
  const showOauth = mode === 'sign-up' || mode === 'sign-in';
  const turnstileAction = { 'sign-up': 'signup', 'sign-in': 'signin', 'magic-link': 'magic_link', 'verify-email': 'resend_verification', 'forgot-password': 'forgot_password', 'reset-password': 'reset_password'}[mode];
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setMessage('');
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const input = {email: String(values.email ?? ''), password: String(values.password ?? ''), locale, turnstileToken: String(values['cf-turnstile-response'] ?? '') || undefined, next};
    const action = { 'sign-up': signUp, 'sign-in': signIn, 'magic-link': sendMagicLink, 'verify-email': resendVerification, 'forgot-password': forgotPassword, 'reset-password': resetPassword}[mode];
    const result = await action(input);
    setBusy(false);
    if (!result.ok) { setMessage(result.error.message); return; }
    const data = result.data as {redirect?: string};
    if (data.redirect) window.location.assign(data.redirect);
    else setMessage(t('checkEmail'));
  };
  const oauth = async (provider: 'google' | 'github') => {
    setOauthBusy(true); setMessage('');
    const result = await startOAuth({provider, locale, next});
    setOauthBusy(false);
    if (!result.ok) { setMessage(result.error.message); return; }
    window.location.assign(result.data.redirect);
  };
  return <div className="rounded-2xl border bg-card p-6 shadow-soft sm:p-8">
    <h1 className="font-display text-3xl">{t(`${mode}.title`)}</h1>
    <p className="mt-2 text-sm text-muted-foreground">{t(`${mode}.description`)}</p>
    <form onSubmit={submit} className="mt-7 space-y-4">
      {showEmail && <div className="space-y-2"><Label htmlFor="auth-email">{t('email')}</Label><Input id="auth-email" name="email" type="email" autoComplete="email" required /></div>}
      {showPassword && <div className="space-y-2"><Label htmlFor="auth-password">{t('password')}</Label><Input id="auth-password" name="password" type="password" minLength={12} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} required /></div>}
      {turnstileKey && mode !== 'reset-password' && <><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" nonce={nonce} /><div className="cf-turnstile" data-sitekey={turnstileKey} data-action={turnstileAction} /></>}
      {message && <p role="status" className="rounded-md bg-muted p-3 text-sm">{message}</p>}
      <Button type="submit" className="w-full" disabled={busy || oauthBusy}>{busy ? t('working') : t(`${mode}.submit`)}</Button>
    </form>
    {showOauth && <div className="mt-5 grid grid-cols-2 gap-3"><Button type="button" variant="outline" disabled={busy || oauthBusy} onClick={() => oauth('google')}>{t('google')}</Button><Button type="button" variant="outline" disabled={busy || oauthBusy} onClick={() => oauth('github')}>{t('github')}</Button></div>}
    <nav className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm text-primary" aria-label={t('otherOptions')}>
      {mode !== 'sign-in' && <Link href={next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in'}>{t('signInLink')}</Link>}
      {mode !== 'sign-up' && <Link href={next ? `/sign-up?next=${encodeURIComponent(next)}` : '/sign-up'}>{t('signUpLink')}</Link>}
      {mode !== 'magic-link' && <Link href={next ? `/magic-link?next=${encodeURIComponent(next)}` : '/magic-link'}>{t('magicLinkLink')}</Link>}
      {mode !== 'verify-email' && <Link href={next ? `/verify-email?next=${encodeURIComponent(next)}` : '/verify-email'}>{extra('verifyLink')}</Link>}
      {mode !== 'forgot-password' && <Link href="/forgot-password">{t('forgotLink')}</Link>}
    </nav>
  </div>;
}
