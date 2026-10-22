import 'server-only';

import {lookup} from 'node:dns/promises';
import {request as httpRequest, type IncomingHttpHeaders} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {isIP} from 'node:net';
import {TLSSocket} from 'node:tls';
import {getDomain} from 'tldts';
import {createAdminClient} from '@/lib/supabase/admin';
import {ValidationError} from '@/lib/errors';
import {getSiteUrl} from '@/lib/config';

const MAX_REDIRECTS = 4;
const DEFAULT_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT = 10_000;
const ALLOWED_REQUEST_HEADERS = new Set(['accept', 'accept-profile', 'apikey', 'origin', 'prefer', 'range']);

export type SafeResponse = {url: string; status: number; headers: IncomingHttpHeaders; body: Buffer; tls?: {validTo: string; authorized: boolean; protocol: string | null}};
export type SafeRequestOptions = {method?: 'GET' | 'HEAD'; headers?: Record<string, string>; timeoutMs?: number; maxBytes?: number; maxRedirects?: number; followRedirects?: boolean; bearerToken?: string};

function ipv4Bytes(ip: string): number[] | null {
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)) return null;
  const parts = ip.split('.').map(Number);
  return parts.every((part) => part <= 255) ? parts : null;
}

function ipv6Bytes(ip: string): number[] | null {
  const zone = ip.indexOf('%');
  if (zone !== -1) return null;
  let source = ip.toLowerCase();
  const mapped = /:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(source);
  if (mapped) {
    const bytes = ipv4Bytes(mapped[1]);
    if (!bytes) return null;
    source = source.slice(0, mapped.index) + `:${((bytes[0] << 8) | bytes[1]).toString(16)}:${((bytes[2] << 8) | bytes[3]).toString(16)}`;
  }
  const halves = source.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  if (left.some((part) => !/^[0-9a-f]{1,4}$/.test(part)) || right.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  const missing = 8 - left.length - right.length;
  if (halves.length === 1 && missing !== 0) return null;
  if (halves.length === 2 && missing < 1) return null;
  const groups = [...left, ...Array(missing).fill('0'), ...right].map((part) => parseInt(part, 16));
  return groups.flatMap((part) => [part >> 8, part & 255]);
}

export function isPublicIp(ip: string): boolean {
  const v4 = ipv4Bytes(ip);
  if (v4) {
    const [a, b, c] = v4;
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  if (isIP(ip) !== 6) return false;
  const bytes = ipv6Bytes(ip);
  if (!bytes || bytes.length !== 16) return false;
  // Only ordinary global unicast is permitted. Tunnel, documentation and
  // translation ranges are rejected because they can route to private IPv4.
  if ((bytes[0] & 0xe0) !== 0x20) return false;
  if (bytes[1] === 0x01 && (bytes[2] === 0x00 || bytes[2] === 0x0d || bytes[2] === 0x10)) return false;
  if (bytes[1] === 0x02) return false;
  return true;
}

export function normalizeUrl(input: string): URL {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new ValidationError(); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash ||
      (url.port && url.port !== (url.protocol === 'https:' ? '443' : '80')) ||
      !url.hostname || url.hostname.endsWith('.') || url.hostname.includes('%')) throw new ValidationError();
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIP(hostname) && !isPublicIp(hostname)) throw new ValidationError();
  if (!isIP(hostname) && (!getDomain(hostname) || !/^[a-z0-9.-]+$/i.test(hostname) || hostname.length > 253 || hostname.split('.').some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)))) throw new ValidationError();
  url.hash = '';
  return url;
}

export function extractDomain(input: string): string {
  const hostname = normalizeUrl(input).hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return getDomain(hostname) ?? hostname;
}

export function normalizeSiteUrl(input: string): {url: string; domain: string; hostname: string} {
  const parsed = normalizeUrl(input);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return {url: parsed.origin + '/', domain: getDomain(hostname) ?? hostname, hostname};
}

async function checkedAddress(url: URL, timeoutMs: number): Promise<{address: string; family: 4 | 6}> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const {data: blocked, error} = await createAdminClient().rpc('is_blocked_domain', {p_domain: hostname});
  if (error || blocked) throw new ValidationError();
  const direct = isIP(hostname);
  if (direct) {
    if (!isPublicIp(hostname)) throw new ValidationError();
    return {address: hostname, family: direct as 4 | 6};
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(hostname, {all: true, verbatim: true}),
    new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('DNS resolution timed out')), timeoutMs); })
  ]).finally(() => { if (timer) clearTimeout(timer); });
  if (!addresses.length || addresses.some(({address, family}) =>
    typeof address !== 'string' || (family !== 4 && family !== 6) || !isPublicIp(address) || isIP(address) !== family)) throw new ValidationError();
  return {address: addresses[0].address, family: addresses[0].family as 4 | 6};
}

function requestPinned(url: URL, ip: {address: string; family: 4 | 6}, options: {method: 'GET' | 'HEAD' | 'POST'; timeoutMs: number; maxBytes: number; body?: string}, headers: Record<string, string>): Promise<SafeResponse> {
  if (!ip.address || !isPublicIp(ip.address) || isIP(ip.address) !== ip.family) throw new ValidationError();
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = transport(url, {
      method: options.method,
      headers: {...headers, 'user-agent': `SiteGuard-SecurityScanner/1.0 (+${getSiteUrl().origin})`, 'accept-encoding': 'identity'},
      lookup: (_host, lookupOptions, callback) => {
        if (typeof lookupOptions === 'object' && lookupOptions !== null && lookupOptions.all === true) {
          callback(null, [{address: ip.address, family: ip.family}]);
        } else {
          callback(null, ip.address, ip.family);
        }
      },
      servername: url.hostname.replace(/^\[|\]$/g, ''),
      timeout: options.timeoutMs,
      maxHeaderSize: 32 * 1024,
      agent: false
    }, (response) => {
      const responseSocket = response.socket;
      const tls = responseSocket instanceof TLSSocket ? {validTo: responseSocket.getPeerCertificate().valid_to ?? '', authorized: responseSocket.authorized, protocol: responseSocket.getProtocol()} : undefined;
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > options.maxBytes) {
          req.destroy(new Error('Response exceeds size limit'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        clearTimeout(deadline);
        resolve({url: url.toString(), status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks), tls});
      });
      response.on('error', (error) => { clearTimeout(deadline); reject(error); });
    });
    const deadline = setTimeout(() => req.destroy(new Error('Request timed out')), options.timeoutMs);
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', (error) => { clearTimeout(deadline); reject(error); });
    req.end(options.body);
  });
}

export async function safeFetch(input: string, options: SafeRequestOptions = {}): Promise<SafeResponse> {
  const method = options.method ?? 'GET';
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT;
  const maxBytes = options.maxBytes ?? DEFAULT_BYTES;
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000 || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 5_000_000 || !Number.isInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 8) throw new ValidationError();
  let url = normalizeUrl(input);
  if (options.bearerToken && (maxRedirects !== 0 || url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) || !/^[A-Za-z0-9._-]{20,4096}$/.test(options.bearerToken))) throw new ValidationError();
  const deadlineAt = Date.now() + timeoutMs;
  const providedHeaders = Object.fromEntries(Object.entries(options.headers ?? {}).filter(([name, value]) =>
    ALLOWED_REQUEST_HEADERS.has(name.toLowerCase()) && value.length <= 4096 && !/[\r\n]/.test(value)));
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const dnsBudget = deadlineAt - Date.now();
    if (dnsBudget < 1) throw new Error('Request timed out');
    const ip = await checkedAddress(url, dnsBudget);
    const requestBudget = deadlineAt - Date.now();
    if (requestBudget < 1) throw new Error('Request timed out');
    const response = await requestPinned(url, ip, {method, timeoutMs: requestBudget, maxBytes}, hop === 0 ? {...providedHeaders, ...(options.bearerToken ? {authorization: `Bearer ${options.bearerToken}`} : {})} : {});
    if (![301, 302, 303, 307, 308].includes(response.status) || options.followRedirects === false) return response;
    const location = response.headers.location;
    if (!location || hop === maxRedirects) throw new ValidationError();
    url = normalizeUrl(new URL(location, url).toString());
  }
  throw new ValidationError();
}

export async function safeSupabaseReadPost(input: string, payload: {limit: number; offset: number} | {email: string; password: string; grant_type: 'password'}, apiKey: string, timeoutMs = 5000): Promise<SafeResponse> {
  const url = normalizeUrl(input);
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) ||
      !(/^\/storage\/v1\/object\/list\/[a-zA-Z0-9_.-]{1,100}$/.test(url.pathname) || (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password')) ||
      !/^[A-Za-z0-9._-]{20,4096}$/.test(apiKey)) throw new ValidationError();
  if ('limit' in payload && (!Number.isInteger(payload.limit) || payload.limit < 1 || payload.limit > 50 || payload.offset !== 0 || !url.pathname.startsWith('/storage/'))) throw new ValidationError();
  if ('grant_type' in payload && (url.pathname !== '/auth/v1/token' || payload.email.length > 254 || payload.password.length > 256)) throw new ValidationError();
  const ip = await checkedAddress(url, timeoutMs);
  const body = JSON.stringify(payload);
  if (body.length > 4096) throw new ValidationError();
  return requestPinned(url, ip, {method: 'POST', timeoutMs, maxBytes: 256 * 1024, body}, {'content-type': 'application/json', apikey: apiKey, ...(apiKey.split('.').length === 3 ? {authorization: `Bearer ${apiKey}`} : {})});
}

/** Deliver a JSON webhook to a pinned public IP. Redirects and caller credentials are never forwarded. */
export async function safeWebhookPost(input: string, payload: string, headers: Record<string, string> = {}): Promise<SafeResponse> {
  const url = normalizeUrl(input);
  if (url.protocol !== 'https:' || Buffer.byteLength(payload) > 64 * 1024 || Object.entries(headers).some(([key, value]) =>
    !/^x-siteguard-(?:timestamp|signature|event-id)$/.test(key.toLowerCase()) || value.length > 256 || /[\r\n]/.test(value))) throw new ValidationError();
  const ip = await checkedAddress(url, 8_000);
  return requestPinned(url, ip, {method: 'POST', timeoutMs: 8_000, maxBytes: 64 * 1024, body: payload},
    {'content-type': 'application/json', ...headers});
}
