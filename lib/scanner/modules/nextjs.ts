import 'server-only';

import {defineModule, type Finding, type ScanContext, type StepResult} from '../types';
import {makeFinding} from '../evidence';
import {header, htmlBody, likelySensitiveJson, scriptAssets} from '../html';
import {advisoriesForVersion} from '../advisories';
import {createAdminClient} from '@/lib/supabase/admin';

function versionFromText(text: string): string | null {
  return /^(\d{1,2}\.\d{1,2}\.\d{1,3})$/.exec(text.trim())?.[1] ?? /(?:x-nextjs-version\s*[:=]\s*["']?|next(?:\.js)?[\/\s@v]+|["']nextVersion["']\s*:\s*["'])(\d{1,2}\.\d{1,2}\.\d{1,3})/i.exec(text)?.[1] ?? null;
}

async function detected(context: ScanContext): Promise<boolean> {
  if (!context.scanId) return false;
  const {data, error} = await createAdminClient().from('scan_modules_results').select('result').eq('scan_id', context.scanId).eq('module_key', 'nextjs').maybeSingle();
  if (error) throw new Error('Could not read Next.js fingerprint');
  return Boolean(data?.result && typeof data.result === 'object' && !Array.isArray(data.result) && data.result.detected === true);
}

function versionFindings(version: string | null, asset: string): Finding[] {
  if (!version) return [];
  return advisoriesForVersion(version).map((advisory) => makeFinding('vulnerable_next_version', asset, {version, advisory: advisory.id}));
}

async function fingerprint(context: ScanContext): Promise<StepResult> {
  const response = await context.http(context.site.normalized_url, {maxBytes: 300_000, timeoutMs: 5000});
  const html = htmlBody(response);
  const isNext = /\/_next\/|__NEXT_DATA__|next-router/i.test(html) || Boolean(header(response, 'x-nextjs-cache'));
  if (!isNext) return {findings: [], done: true, summary: {detected: false}};
  const version = versionFromText(header(response, 'x-nextjs-version')) ?? versionFromText(html.slice(0, 100_000));
  return {findings: versionFindings(version, context.site.normalized_url), done: true, summary: {detected: true, ...(version ? {version} : {})}};
}

function assetState(context: ScanContext): {assets: string[]; cursor: number} | null {
  const value = context.state;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const assets = Array.isArray(value.assets) ? value.assets.filter((item): item is string => typeof item === 'string' && item.length <= 300).slice(0, 6) : [];
  const cursor = Number(value.cursor ?? 0);
  return Number.isInteger(cursor) && cursor >= 0 ? {assets, cursor} : null;
}

async function inspectAsset(context: ScanContext): Promise<StepResult> {
  if (!await detected(context)) return {findings: [], done: true};
  let state = assetState(context);
  if (!state) {
    const root = await context.http(context.site.normalized_url, {maxBytes: 300_000, timeoutMs: 4000});
    state = {assets: scriptAssets(htmlBody(root), context.site.normalized_url, 20).filter((item) => !item.thirdParty && /\/_next\/static\//.test(item.url)).slice(0, 6).map((item) => item.url), cursor: 0};
  }
  if (state.cursor >= state.assets.length) return {findings: [], done: true, summary: {count: state.assets.length}};
  const asset = state.assets[state.cursor];
  const response = await context.http(asset, {maxBytes: 300_000, timeoutMs: 4000});
  const text = response.status === 200 ? response.body.toString('utf8') : '';
  const findings: Finding[] = [];
  const secretAssignment = /(?:SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|RESEND_API_KEY|PADDLE_API_KEY|NEXTAUTH_SECRET|JWT_SECRET)\s*["']?\s*[:=]\s*["'][^"'\s]{12,}["']/i.test(text);
  const tokens = text.match(/eyJ[A-Za-z0-9_-]{12,}\.eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}/g) ?? [];
  if (secretAssignment) findings.push(makeFinding('client_secret_leak', asset, {source: 'client_bundle'}));
  if (tokens.some((token) => {
    try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).role === 'service_role'; } catch { return false; }
  })) findings.push(makeFinding('service_role_leak', asset, {source: 'client_bundle'}));
  const mapUrl = `${new URL(asset).origin}${new URL(asset).pathname}.map`;
  const map = await context.http(mapUrl, {maxBytes: 32_000, timeoutMs: 4000});
  if (map.status === 200 && /\{\s*"version"\s*:\s*3\s*,/.test(map.body.toString('utf8').slice(0, 200)) && /"sources"\s*:/.test(map.body.toString('utf8'))) findings.push(makeFinding('exposed_source_map', mapUrl, {path: new URL(mapUrl).pathname}));
  const next = state.cursor + 1;
  return {findings, done: next >= state.assets.length, nextState: {assets: state.assets, cursor: next}, summary: {count: state.assets.length}};
}

const apiPaths = ['/api/admin', '/api/users', '/api/debug', '/api/internal'];
async function inspectApi(context: ScanContext): Promise<StepResult> {
  if (!await detected(context)) return {findings: [], done: true};
  const state = context.state && typeof context.state === 'object' && !Array.isArray(context.state) ? context.state : {};
  const cursor = Number(state.cursor ?? 0);
  if (!Number.isInteger(cursor) || cursor < 0 || cursor >= apiPaths.length) return {findings: [], done: true};
  const url = new URL(apiPaths[cursor], context.site.normalized_url).toString();
  const response = await context.http(url, {maxBytes: 32_000, timeoutMs: 4000});
  const findings = likelySensitiveJson(response) ? [makeFinding('unauthenticated_api', url, {path: apiPaths[cursor], status: response.status})] : [];
  return {findings, done: cursor === apiPaths.length - 1, nextState: {cursor: cursor + 1}};
}

async function inspectNextData(context: ScanContext): Promise<StepResult> {
  if (!await detected(context)) return {findings: [], done: true};
  const root = await context.http(context.site.normalized_url, {maxBytes: 300_000, timeoutMs: 4000});
  const buildId = /["']buildId["']\s*:\s*["']([A-Za-z0-9_-]{6,100})["']/.exec(htmlBody(root))?.[1];
  if (!buildId) return {findings: [], done: true};
  const path = `/_next/data/${buildId}/dashboard.json`;
  const response = await context.http(new URL(path, context.site.normalized_url).toString(), {maxBytes: 32_000, timeoutMs: 4000});
  return {findings: likelySensitiveJson(response) ? [makeFinding('exposed_next_data', context.site.normalized_url, {path, status: response.status})] : [], done: true};
}

async function inspectAuthSignal(context: ScanContext): Promise<StepResult> {
  if (!await detected(context)) return {findings: [], done: true};
  const path = '/dashboard';
  const response = await context.http(new URL(path, context.site.normalized_url).toString(), {maxBytes: 32_000, timeoutMs: 4000});
  const html = htmlBody(response);
  const signal = response.status === 200 && /(?:data-user-email|data-account-id|"userEmail"\s*:)/i.test(html);
  return {findings: signal ? [makeFinding('middleware_auth_signal', context.site.normalized_url, {path, manualVerification: true})] : [], done: true};
}

export const nextjsModule = defineModule('nextjs', 'Scanner.modules.nextjs', [
  {id: 'fingerprint', verifiedOnly: true, timeoutMs: 7000, run: fingerprint},
  {id: 'assets', verifiedOnly: true, timeoutMs: 15000, run: inspectAsset},
  {id: 'api', verifiedOnly: true, timeoutMs: 6500, run: inspectApi},
  {id: 'next-data', verifiedOnly: true, timeoutMs: 10000, run: inspectNextData},
  {id: 'middleware', verifiedOnly: true, timeoutMs: 6500, run: inspectAuthSignal}
]);
