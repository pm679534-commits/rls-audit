import 'server-only';

import type {ReactElement} from 'react';
import {Resend} from 'resend';
import {getServerEnv} from '@/lib/env';
import {getSiteUrl} from '@/lib/config';
import {ExternalServiceError} from '@/lib/errors';
import type {Locale} from '@/i18n/routing';
import {EmailLayout} from './layout';

let resend: Resend | undefined;
export function getResendClient(): Resend { return resend ??= new Resend(getServerEnv().RESEND_API_KEY); }

export async function sendEmail(input: {to: string; locale: Locale; subject: string; preview: string; content: ReactElement; unsubscribeUrl?: string; replyTo?: string; idempotencyKey?: string}) {
  const env = getServerEnv();
  if (input.unsubscribeUrl) {
    let target: URL;
    try { target = new URL(input.unsubscribeUrl); } catch { throw new Error('Invalid unsubscribe URL'); }
    if (target.origin !== getSiteUrl().origin || !target.pathname.startsWith('/api/')) throw new Error('Invalid unsubscribe URL');
  }
  const {data, error} = await getResendClient().emails.send({
    from: env.EMAIL_FROM,
    to: input.to,
    subject: input.subject,
    react: <EmailLayout locale={input.locale} preview={input.preview} title={input.subject} unsubscribeUrl={input.unsubscribeUrl}>{input.content}</EmailLayout>,
    ...(input.replyTo ? {replyTo: input.replyTo} : {}),
    ...(input.unsubscribeUrl ? {headers: {'List-Unsubscribe': `<${input.unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'}} : {})
  }, input.idempotencyKey ? {idempotencyKey: input.idempotencyKey} : undefined);
  if (error || !data) throw new ExternalServiceError();
  return data.id;
}

export {EmailLayout} from './layout';
