import 'server-only';

import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import type {NextRequest} from 'next/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {RateLimitError} from '@/lib/errors';

export type RateLimitResult = {allowed: boolean; limit: number; remaining: number; resetAt: Date; headers: Headers};

export async function rateLimitCheck(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  if (!key || key.length > 512 || !Number.isInteger(limit) || limit < 1 || limit > 10000 || !Number.isInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 86400) throw new RangeError('Invalid rate limit options');
  const db = createAdminClient();
  const compact = await db.rpc('rate_limit_status', {p_key: key, p_limit: limit, p_window: `${windowSeconds} seconds`});
  if (!compact.error && compact.data?.[0]) {
    const {allowed, remaining, reset_seconds} = compact.data[0];
    const headers = new Headers({'RateLimit-Limit': String(limit), 'RateLimit-Remaining': String(remaining), 'RateLimit-Reset': String(reset_seconds)});
    if (!allowed) headers.set('Retry-After', String(reset_seconds));
    return {allowed, limit, remaining, resetAt: new Date(Date.now() + reset_seconds * 1000), headers};
  }
  if (compact.error && !['PGRST202','42883'].includes(compact.error.code)) throw new Error('Rate limit service unavailable');
  const {data: allowed, error} = await db.rpc('rate_limit_check', {p_key: key, p_limit: limit, p_window: `${windowSeconds} seconds`});
  if (error || allowed === null) throw new Error('Rate limit service unavailable');
  const keyHash = `\\x${createHash('sha256').update(key).digest('hex')}`;
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const {count, error: countError} = await db.from('rate_limits').select('*', {head: true, count: 'exact'}).eq('key_hash', keyHash).gt('occurred_at', since);
  const {data: oldest, error: oldestError} = await db.from('rate_limits').select('occurred_at').eq('key_hash', keyHash).gt('occurred_at', since).order('occurred_at', {ascending: true}).limit(1).maybeSingle();
  if (countError || oldestError || count === null) throw new Error('Rate limit service unavailable');
  const resetAt = new Date((oldest ? new Date(oldest.occurred_at).getTime() : Date.now()) + windowSeconds * 1000);
  const remaining = Math.max(0, limit - count);
  const headers = new Headers({
    'RateLimit-Limit': String(limit),
    'RateLimit-Remaining': String(remaining),
    'RateLimit-Reset': String(Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000)))
  });
  if (!allowed) headers.set('Retry-After', String(Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000))));
  return {allowed, limit, remaining, resetAt, headers};
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const result = await rateLimitCheck(key, limit, windowSeconds);
  if (!result.allowed) throw new RateLimitError(Number(result.headers.get('Retry-After')), result.headers);
  return result;
}

export function trustedClientIp(headers: Pick<Headers, 'get'>): string {
  // Vercel sets these headers itself; prefer its dedicated header when present.
  const candidates = [headers.get('x-vercel-forwarded-for'), headers.get('x-forwarded-for'), headers.get('x-real-ip')];
  for (const header of candidates) {
    const value = header?.split(',')[0]?.trim();
    if (value && isIP(value)) return value;
  }
  return 'unknown';
}

export function clientIp(request: NextRequest | Request): string {return trustedClientIp(request.headers);}

export function checkActionRateLimit(userId: string, action: string, limit: number, windowSeconds: number) {
  return enforceRateLimit(`action:${action}:user:${userId}`, limit, windowSeconds);
}

export function checkRouteRateLimit(request: NextRequest | Request, route: string, limit: number, windowSeconds: number) {
  return enforceRateLimit(`route:${route}:ip:${clientIp(request)}`, limit, windowSeconds);
}

export function checkApiKeyRateLimit(keyId: string, endpoint: string, limit: number, windowSeconds: number) {
  return enforceRateLimit(`api:${keyId}:${endpoint}`, limit, windowSeconds);
}
