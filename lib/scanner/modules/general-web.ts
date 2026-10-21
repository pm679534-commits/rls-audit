import 'server-only';

import {defineModule, type Finding, type ScanContext, type StepResult} from '../types';
import {makeFinding} from '../evidence';
import {header, htmlBody, scriptAssets} from '../html';

function rootFindings(context: ScanContext, response: Awaited<ReturnType<ScanContext['http']>>): StepResult {
  const url = context.site.normalized_url;
  const findings: Finding[] = [];
  const add = (id: string, evidence: Record<string, string | number | boolean> = {}) => findings.push(makeFinding(id, url, evidence));
  if (url.startsWith('http:')) add('missing_https');
  if (url.startsWith('https:')) {
    if (response.tls?.validTo) {
      const days = Math.floor((new Date(response.tls.validTo).getTime() - Date.now()) / 86400000);
      if (days < 30) add('tls_expiring', {daysRemaining: days});
    }
    if (!header(response, 'strict-transport-security')) add('missing_hsts', {header: 'Strict-Transport-Security'});
  }
  const csp = header(response, 'content-security-policy');
  if (!csp) add('missing_csp', {header: 'Content-Security-Policy'});
  if (!/frame-ancestors\s+/i.test(csp) && !/^(?:DENY|SAMEORIGIN)$/i.test(header(response, 'x-frame-options').trim())) add('missing_frame_protection');
  if (!/nosniff/i.test(header(response, 'x-content-type-options'))) add('missing_content_type_options');
  if (!header(response, 'referrer-policy') || /^(?:unsafe-url|no-referrer-when-downgrade)$/i.test(header(response, 'referrer-policy').trim())) add('weak_referrer_policy');
  if (!header(response, 'permissions-policy')) add('missing_permissions_policy');
  const cookies = response.headers['set-cookie'] ?? [];
  const cookieValues = Array.isArray(cookies) ? cookies : [cookies];
  for (const cookie of cookieValues) {
    const name = cookie.split('=', 1)[0].toLowerCase();
    if (url.startsWith('https:') && !/;\s*secure(?:;|$)/i.test(cookie)) add('insecure_cookie');
    if (/(?:session|auth|token|jwt|sid)/i.test(name) && !/;\s*httponly(?:;|$)/i.test(cookie)) add('cookie_missing_httponly');
    if (!/;\s*samesite\s*=\s*(?:strict|lax|none)/i.test(cookie)) add('cookie_missing_samesite');
  }
  if (header(response, 'access-control-allow-origin') === '*' && /true/i.test(header(response, 'access-control-allow-credentials'))) add('cors_wildcard_credentials');
  const html = htmlBody(response);
  if (url.startsWith('https:') && /<(?:script|link|img|iframe)\b[^>]*(?:src|href)\s*=\s*["']http:\/\//i.test(html)) add('mixed_content');
  const scripts = scriptAssets(html, url);
  const thirdPartyDomains = [...new Set(scripts.filter((item) => item.thirdParty).map((item) => new URL(item.url).hostname))].slice(0, 12);
  const scriptInventory = scripts.filter((item) => item.thirdParty).map((item) => ({domain: new URL(item.url).hostname, path: new URL(item.url).pathname.slice(0, 150), hasIntegrity: item.integrity}));
  if (scripts.some((item) => item.thirdParty && !item.integrity)) add('third_party_script_no_sri', {count: scripts.filter((item) => item.thirdParty && !item.integrity).length});
  return {findings: [...new Map(findings.map((finding) => [finding.fingerprint, finding])).values()], done: true, summary: {thirdPartyDomains, scriptInventory}};
}

const pathProbes = [
  {path: '/.env', id: 'exposed_env_file'},
  {path: '/.git/HEAD', id: 'exposed_git'},
  {path: '/backup.zip', id: 'exposed_backup'},
  {path: '/site-backup.zip', id: 'exposed_backup'},
  {path: '/backup.tar.gz', id: 'exposed_backup'},
  {path: '/uploads/', id: 'directory_listing'}
] as const;

async function probePath(context: ScanContext): Promise<StepResult> {
  const state = context.state && typeof context.state === 'object' && !Array.isArray(context.state) ? context.state : {};
  const cursor = Number(state.cursor ?? 0);
  if (!Number.isInteger(cursor) || cursor < 0 || cursor >= pathProbes.length) return {findings: [], done: true};
  const item = pathProbes[cursor];
  const url = new URL(item.path, context.site.normalized_url).toString();
  const response = await context.http(url, {followRedirects: false, maxBytes: 32_000, timeoutMs: 4000});
  const content = response.body.toString('utf8');
  let exposed = false;
  if (response.status === 200) {
    if (item.id === 'exposed_env_file') exposed = /(?:^|\n)(?:[A-Z][A-Z0-9_]{2,})=\S+/m.test(content) && !/text\/html/i.test(header(response, 'content-type'));
    else if (item.id === 'exposed_git') exposed = /^ref:\s+refs\/heads\//.test(content);
    else if (item.id === 'exposed_backup') exposed = response.body.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) || response.body.subarray(0, 2).equals(Buffer.from([0x1f, 0x8b]));
    else exposed = /<title>Index of\s*\/uploads\/?<\/title>|<h1>Index of\s*\/uploads\/?<\/h1>/i.test(content);
  }
  return {findings: exposed ? [makeFinding(item.id, url, {path: item.path, status: response.status})] : [], done: cursor === pathProbes.length - 1, nextState: {cursor: cursor + 1}};
}

async function probeCors(context: ScanContext): Promise<StepResult> {
  const origin = 'https://siteguard-probe.invalid';
  const response = await context.http(context.site.normalized_url, {headers: {origin}, followRedirects: false, maxBytes: 1024, timeoutMs: 4000});
  const reflected = header(response, 'access-control-allow-origin') === origin;
  const credentials = /true/i.test(header(response, 'access-control-allow-credentials'));
  return {findings: reflected && credentials ? [makeFinding('cors_reflected_origin', context.site.normalized_url, {header: 'Access-Control-Allow-Origin'})] : [], done: true};
}

async function probeRedirect(context: ScanContext): Promise<StepResult> {
  const state = context.state && typeof context.state === 'object' && !Array.isArray(context.state) ? context.state : {};
  const params = ['next', 'redirect', 'returnUrl'] as const;
  const cursor = Number(state.cursor ?? 0);
  if (!Number.isInteger(cursor) || cursor < 0 || cursor >= params.length) return {findings: [], done: true};
  const url = new URL(context.site.normalized_url);
  url.searchParams.set(params[cursor], 'https://siteguard-probe.invalid/check');
  const response = await context.http(url.toString(), {followRedirects: false, maxBytes: 1024, timeoutMs: 4000});
  const location = header(response, 'location');
  const found = [301, 302, 303, 307, 308].includes(response.status) && location.startsWith('https://siteguard-probe.invalid/');
  return {findings: found ? [makeFinding('open_redirect', context.site.normalized_url, {method: params[cursor]})] : [], done: cursor === params.length - 1, nextState: {cursor: cursor + 1}};
}

async function probeSecurityTxt(context: ScanContext): Promise<StepResult> {
  const url = new URL('/.well-known/security.txt', context.site.normalized_url).toString();
  const response = await context.http(url, {followRedirects: false, maxBytes: 16_000, timeoutMs: 4000});
  const valid = response.status === 200 && /^contact:\s*\S+/im.test(response.body.toString('utf8'));
  return {findings: valid ? [] : [makeFinding('missing_security_txt', url)], done: true};
}

export const generalWebModule = defineModule('general-web', 'Scanner.modules.generalWeb', [
  {id: 'root', verifiedOnly: false, timeoutMs: 7000, async run(context) {
    try {
      const response = await context.http(context.site.normalized_url, {maxBytes: 300_000, timeoutMs: 5000});
      if (response.status >= 500) throw new Error('Target server unavailable');
      return rootFindings(context, response);
    }
    catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
      if (/^(?:CERT_HAS_EXPIRED|CERT_NOT_YET_VALID|UNABLE_TO_VERIFY_LEAF_SIGNATURE|DEPTH_ZERO_SELF_SIGNED_CERT|ERR_TLS_CERT_ALTNAME_INVALID)$/.test(code)) return {findings: [makeFinding('tls_invalid', context.site.normalized_url, {reasonCode: code})], done: true};
      throw error;
    }
  }},
  {id: 'paths', verifiedOnly: true, timeoutMs: 6500, run: probePath},
  {id: 'cors', verifiedOnly: true, timeoutMs: 6500, run: probeCors},
  {id: 'redirect', verifiedOnly: true, timeoutMs: 6500, run: probeRedirect},
  {id: 'securitytxt', verifiedOnly: true, timeoutMs: 6500, run: probeSecurityTxt}
]);
