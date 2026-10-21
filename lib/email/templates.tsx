import 'server-only';

import {Button, Text} from '@react-email/components';
import type {ReactElement} from 'react';
import type {Locale} from '@/i18n/routing';
import en from '@/messages/en.json';
import az from '@/messages/az.json';

export type EmailKind = 'verification' | 'welcome' | 'trial_reminder' | 'trial_expired' | 'scan_completed' |
  'finding_alert' | 'score_regression' | 'verification_failed' | 'payment_failed' | 'subscription_changed';

export function emailTemplate(kind: EmailKind, locale: Locale, input: {url: string; site?: string; score?: number; previousScore?: number; severity?: string; days?: number}):
  {subject: string; preview: string; content: ReactElement} {
  const copy = (locale === 'az' ? az : en).Phase9.email[kind];
  const detail = kind === 'scan_completed' && input.score !== undefined ? `${input.site ?? ''} · ${input.score}/100` :
    kind === 'score_regression' && input.score !== undefined ? `${input.site ?? ''} · ${input.previousScore ?? '—'} → ${input.score}/100` :
    kind === 'finding_alert' ? `${input.site ?? ''} · ${input.severity ?? ''}` :
    kind === 'trial_reminder' && input.days !== undefined ? `${input.days} ${locale === 'az' ? 'gün' : 'day(s)'}` : input.site ?? '';
  return {subject: copy.subject, preview: copy.preview, content: <>
    <Text>{copy.body}</Text>
    {detail && <Text style={{fontWeight: 700}}>{detail}</Text>}
    <Button href={input.url} style={{backgroundColor: '#117d78', borderRadius: 8, color: '#fff', padding: '12px 20px', textDecoration: 'none'}}>{copy.action}</Button>
  </>};
}
