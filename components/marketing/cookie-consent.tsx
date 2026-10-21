'use client';

import {useEffect, useState} from 'react';
import {useTranslations} from 'next-intl';
import {Link} from '@/i18n/navigation';
import {Button} from '@/components/ui/button';

const COOKIE = 'siteguard_cookie_consent';

export function CookieConsent() {
  const t = useTranslations('Marketing.cookies');
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(!document.cookie.split(';').some((entry) => entry.trim().startsWith(`${COOKIE}=`))); }, []);
  function choose(value: 'all' | 'essential') {
    document.cookie = `${COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    setVisible(false);
    window.dispatchEvent(new CustomEvent('siteguard:consent', {detail: value}));
  }
  if (!visible) return null;
  return <aside aria-label={t('title')} className="fixed bottom-3 left-3 right-3 z-50 mx-auto max-w-xl rounded-2xl border bg-card p-5 shadow-2xl sm:bottom-6 sm:left-auto sm:right-6">
    <h2 className="font-semibold">{t('title')}</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('body')} <Link href="/cookies" className="font-medium text-primary underline underline-offset-4 dark:text-primary">{t('read')}</Link></p>
    <div className="mt-4 flex flex-wrap gap-2"><Button onClick={() => choose('essential')} variant="outline">{t('essential')}</Button><Button onClick={() => choose('all')}>{t('accept')}</Button></div>
  </aside>;
}

export function CookiePreferences() {
  const t = useTranslations('Marketing.cookies');
  const [choice, setChoice] = useState<'all' | 'essential' | null>(null);
  useEffect(() => {
    const value = document.cookie.split(';').map((entry) => entry.trim()).find((entry) => entry.startsWith(`${COOKIE}=`))?.split('=')[1];
    setChoice(value === 'all' || value === 'essential' ? value : null);
    const listener = (event: Event) => {const value = (event as CustomEvent<'all' | 'essential'>).detail; setChoice(value);};
    window.addEventListener('siteguard:consent', listener);
    return () => window.removeEventListener('siteguard:consent', listener);
  }, []);
  function save(value: 'all' | 'essential') {
    document.cookie = `${COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    setChoice(value);
    window.dispatchEvent(new CustomEvent('siteguard:consent', {detail: value}));
  }
  return <section className="rounded-2xl border bg-card p-6" aria-labelledby="cookie-preferences-title"><h2 id="cookie-preferences-title" className="text-xl font-semibold">{t('preferences')}</h2>
    <p className="mt-2 text-sm text-muted-foreground">{choice ? t('current', {choice: t(choice)}) : t('notChosen')}</p>
    <div className="mt-5 flex flex-wrap gap-3"><Button type="button" variant="outline" onClick={() => save('essential')}>{t('essential')}</Button><Button type="button" onClick={() => save('all')}>{t('accept')}</Button></div>
  </section>;
}
