import 'server-only';

import {resolveTxt} from 'node:dns/promises';
import {constantTimeEqual} from '@/lib/crypto';
import {SafeRedirectError, safeFetch} from '@/lib/ssrf';
import type {Tables} from '@/types/database';

export type VerificationReason = 'token_not_found' | 'dns_propagating' | 'dns_unavailable' | 'redirect_loop' |
  'redirect_limit' | 'redirect_blocked' | 'http_status' | 'timeout' | 'host_mismatch' | 'verification_unavailable' | 'challenge_expired';
export type VerificationOutcome = {verified: boolean; reason?: VerificationReason; httpStatus?: number};
type WebOutcome = VerificationOutcome & {finalHost?: string};

const ATTEMPTS = 3;
const BUDGET_MS = 7500;
const REQUEST_MS = 1800;

function missing(reason: VerificationReason, httpStatus?: number): VerificationOutcome {
  return {verified: false, reason, ...(httpStatus ? {httpStatus} : {})};
}

function errorReason(error: unknown): VerificationReason {
  if (error instanceof SafeRedirectError) return error.reason;
  if (error instanceof Error && /timed out|timeout|abort/i.test(error.message)) return 'timeout';
  if (error instanceof Error && error.name === 'AppError') return 'redirect_blocked';
  return 'verification_unavailable';
}

async function timed<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([work, new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
  })]).finally(() => {if (timer) clearTimeout(timer);});
}

function txtValue(raw: string): string {
  const chunks = raw.match(/"(?:\\.|[^"\\])*"/g);
  if (!chunks) return raw.trim();
  try {return chunks.map((chunk) => JSON.parse(chunk) as string).join('');}
  catch {return raw.replace(/"/g, '').trim();}
}

async function systemTxt(name: string, token: string, timeoutMs: number): Promise<VerificationOutcome> {
  try {
    const records = await timed(resolveTxt(name), timeoutMs);
    return records.some((parts) => constantTimeEqual(parts.join(''), token)) ? {verified: true} : missing('dns_propagating');
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (code === 'ENOTFOUND' || code === 'ENODATA') return missing('dns_propagating');
    return missing(errorReason(error) === 'timeout' ? 'timeout' : 'dns_unavailable');
  }
}

async function dohTxt(provider: 'cloudflare' | 'google', name: string, token: string, timeoutMs: number): Promise<VerificationOutcome> {
  const endpoint = provider === 'cloudflare' ? 'https://cloudflare-dns.com/dns-query' : 'https://dns.google/resolve';
  const url = new URL(endpoint);
  url.searchParams.set('name', name);
  url.searchParams.set('type', 'TXT');
  try {
    const response = await safeFetch(url.toString(), {headers: {accept: 'application/dns-json', 'cache-control': 'no-cache'},
      maxBytes: 16_000, timeoutMs, maxRedirects: 4});
    if (response.status !== 200) return missing('dns_unavailable');
    const body = JSON.parse(response.body.toString('utf8')) as unknown;
    if (!body || typeof body !== 'object' || !('Status' in body)) return missing('dns_unavailable');
    const result = body as {Status: unknown; Answer?: unknown};
    if (result.Status === 3) return missing('dns_propagating');
    if (result.Status !== 0) return missing('dns_unavailable');
    const answers = Array.isArray(result.Answer) ? result.Answer : [];
    return answers.some((answer: unknown) => answer && typeof answer === 'object' &&
      'type' in answer && answer.type === 16 && 'data' in answer && typeof answer.data === 'string' &&
      constantTimeEqual(txtValue(answer.data), token)) ? {verified: true} : missing('dns_propagating');
  } catch (error) {return missing(errorReason(error) === 'timeout' ? 'timeout' : 'dns_unavailable');}
}

async function dnsAttempt(site: Tables<'sites'>, token: string, timeoutMs: number): Promise<VerificationOutcome> {
  const hostname = new URL(site.normalized_url).hostname;
  // An apex TXT proves control of the parent domain. The www challenge is accepted only for a www site.
  const names = [...new Set([`_siteguard.${site.domain}`, site.domain,
    ...(hostname === `www.${site.domain}` ? [`_siteguard.${hostname}`] : [])])];
  const results = await Promise.all(names.flatMap((name) => [
    systemTxt(name, token, timeoutMs), dohTxt('cloudflare', name, token, timeoutMs), dohTxt('google', name, token, timeoutMs)
  ]));
  if (results.some((result) => result.verified)) return {verified: true};
  if (results.some((result) => result.reason === 'dns_propagating')) return missing('dns_propagating');
  if (results.some((result) => result.reason === 'timeout')) return missing('timeout');
  return missing('dns_unavailable');
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function hasMetaToken(html: string, token: string): boolean {
  const opening = /<head\b[^>]*>/i.exec(html);
  if (!opening) return false;
  const remaining = html.slice(opening.index + opening[0].length);
  const head = remaining.slice(0, /<\/head\s*>|<body\b/i.exec(remaining)?.index ?? remaining.length);
  const tags = head.match(/<meta\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi) ?? [];
  return tags.some((tag) => attribute(tag, 'name')?.toLowerCase() === 'siteguard-verification' &&
    constantTimeEqual(attribute(tag, 'content') ?? '', token));
}

async function webCandidate(site: Tables<'sites'>, hostname: string, token: string, timeoutMs: number,
  method: Tables<'site_verifications'>['method']): Promise<WebOutcome> {
  const url = new URL(method === 'meta_tag' ? '/' : '/.well-known/siteguard-verification.txt', site.normalized_url);
  url.hostname = hostname;
  url.searchParams.set('_sgv', crypto.randomUUID());
  try {
    const response = await safeFetch(url.toString(), {headers: {'cache-control': 'no-cache'},
      maxBytes: 100_000, timeoutMs, maxRedirects: 4});
    const finalHost = new URL(response.url).hostname;
    if (finalHost !== site.domain && finalHost !== `www.${site.domain}` && finalHost !== hostname) return {...missing('host_mismatch'), finalHost};
    if (response.status !== 200) return {...missing('http_status', response.status), finalHost};
    const body = response.body.toString('utf8');
    const verified = method === 'meta_tag' ? hasMetaToken(body, token) : constantTimeEqual(body.trim(), token);
    return verified ? {verified: true, finalHost} : {...missing('token_not_found'), finalHost};
  } catch (error) {return missing(errorReason(error));}
}

async function webAttempt(site: Tables<'sites'>, token: string, timeoutMs: number,
  method: Tables<'site_verifications'>['method']): Promise<VerificationOutcome> {
  const canonical = new URL(site.normalized_url).hostname;
  const alternate = canonical === site.domain ? `www.${site.domain}` : canonical === `www.${site.domain}` ? site.domain : null;
  const [primary, secondary] = await Promise.all([
    webCandidate(site, canonical, token, timeoutMs, method),
    alternate ? webCandidate(site, alternate, token, timeoutMs, method) : Promise.resolve(null)
  ]);
  if (primary.verified) return {verified: true};
  // A token on the alternate host alone cannot authorize deep scans of the configured host.
  if (secondary?.verified) return primary.finalHost === alternate ? {verified: true} : missing('host_mismatch');
  return primary.reason === 'token_not_found' ? primary : primary.reason === 'http_status' ? primary :
    secondary?.reason === 'token_not_found' ? missing('host_mismatch') : primary;
}

export async function verifyChallengeEvidence(site: Tables<'sites'>, challenge: Tables<'site_verifications'>): Promise<VerificationOutcome> {
  const deadline = Date.now() + BUDGET_MS;
  let outcome: VerificationOutcome = missing(challenge.method === 'dns_txt' ? 'dns_propagating' : 'token_not_found');
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < 200) break;
    const timeoutMs = Math.min(REQUEST_MS, remaining);
    outcome = challenge.method === 'dns_txt'
      ? await dnsAttempt(site, challenge.challenge_value, timeoutMs)
      : await webAttempt(site, challenge.challenge_value, timeoutMs, challenge.method);
    if (outcome.verified) return outcome;
    if (attempt < ATTEMPTS - 1) await new Promise((resolve) => setTimeout(resolve, Math.min(300 * (attempt + 1), Math.max(0, deadline - Date.now()))));
  }
  return outcome;
}
