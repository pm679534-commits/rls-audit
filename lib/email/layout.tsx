import 'server-only';

import {Body, Container, Head, Heading, Html, Link, Preview, Section, Text} from '@react-email/components';
import type {ReactNode} from 'react';
import {BRAND_NAME, getSiteUrl} from '@/lib/config';
import type {Locale} from '@/i18n/routing';
import en from '@/messages/en.json';
import az from '@/messages/az.json';

export function EmailLayout({locale, preview, title, children, unsubscribeUrl}: {locale: Locale; preview: string; title: string; children: ReactNode; unsubscribeUrl?: string}) {
  const labels = (locale === 'az' ? az : en).EmailCommon;
  return <Html lang={locale}><Head /><Preview>{preview}</Preview><Body style={{backgroundColor: '#f5f7f9', color: '#18252d', fontFamily: 'Arial, sans-serif', padding: '32px 12px'}}>
    <Container style={{maxWidth: 600, margin: '0 auto', backgroundColor: '#ffffff', border: '1px solid #d9e0e4', borderRadius: 12, padding: '32px'}}>
      <Text style={{color: '#117d78', fontWeight: 700, fontSize: 18, marginTop: 0}}>{BRAND_NAME}</Text>
      <Heading as="h1" style={{fontSize: 26, lineHeight: '34px', margin: '24px 0 16px'}}>{title}</Heading>
      <Section style={{fontSize: 15, lineHeight: '24px'}}>{children}</Section>
      <Text style={{borderTop: '1px solid #d9e0e4', color: '#66767f', fontSize: 12, marginTop: 32, paddingTop: 20}}>{labels.sentBy} <Link href={getSiteUrl(`/${locale}`).toString()}>{BRAND_NAME}</Link>.</Text>
      {unsubscribeUrl && <Text style={{color: '#66767f', fontSize: 12}}><Link href={unsubscribeUrl}>{labels.unsubscribe}</Link></Text>}
    </Container>
  </Body></Html>;
}
