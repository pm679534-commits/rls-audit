import 'server-only';

import {createHmac, timingSafeEqual} from 'node:crypto';
import {getServerEnv} from '@/lib/env';
import {getSiteUrl} from '@/lib/config';
import {ValidationError} from '@/lib/errors';

function signature(userId: string, expires: number): string {
  return createHmac('sha256', getServerEnv().ENCRYPTION_MASTER_KEY).update(`siteguard-unsubscribe-v1:${userId}:${expires}`).digest('hex');
}

export function unsubscribeUrl(userId: string, issuedAt = new Date(), locale: 'en' | 'az' = 'en'): string {
  const expires = Math.floor(issuedAt.getTime() / 1000) + 30 * 86400;
  return getSiteUrl(`/api/unsubscribe/${userId}.${expires}.${signature(userId, expires)}?lang=${locale}`).toString();
}

export function verifyUnsubscribeToken(token: string): string {
  const match = /^([0-9a-f-]{36})\.(\d{10})\.([0-9a-f]{64})$/.exec(token);
  if (!match || Number(match[2]) < Date.now() / 1000) throw new ValidationError();
  const expected = Buffer.from(signature(match[1], Number(match[2])), 'hex');
  const actual = Buffer.from(match[3], 'hex');
  if (!timingSafeEqual(expected, actual)) throw new ValidationError();
  return match[1];
}
