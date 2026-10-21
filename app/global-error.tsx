'use client';

import {useEffect, useState} from 'react';
import en from '@/messages/en.json';
import az from '@/messages/az.json';

export default function GlobalError({reset}: {error: Error & {digest?: string}; reset: () => void}) {
  const [locale, setLocale] = useState<'en' | 'az'>('en');
  useEffect(() => { if (window.location.pathname.startsWith('/az')) setLocale('az'); }, []);
  const t = locale === 'az' ? az.Common : en.Common;
  return <html lang={locale}><body style={{margin: 0, background: '#f9f8f5', color: '#152c3b'}}><main style={{minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24, textAlign: 'center', fontFamily: 'system-ui'}}>
    <div aria-hidden="true" style={{width: 56, height: 56, borderRadius: 16, background: '#123b56', display: 'grid', placeItems: 'center'}}><svg width="34" height="34" viewBox="0 0 64 64" fill="none"><path d="M32 5 53 14v17c0 15-8 24-21 30C19 55 11 46 11 31V14L32 5Z" stroke="#a6e8dc" strokeWidth="4" strokeLinejoin="round" /><path d="m20 31 9 9 16-18" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
    <h1 style={{fontSize: 36, margin: 0}}>{t.unexpectedError}</h1><p style={{maxWidth: 440, lineHeight: 1.6, margin: 0}}>{t.unexpectedErrorDetail}</p><button onClick={reset} style={{minHeight: 44, padding: '0 24px', border: 0, borderRadius: 8, background: '#123b56', color: '#fff', fontSize: 16, cursor: 'pointer'}}>{t.retry}</button>
  </main></body></html>;
}
