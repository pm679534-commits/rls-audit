import 'server-only';

import {safeSupabaseReadPost} from '@/lib/ssrf';
import {createAdminClient} from '@/lib/supabase/admin';
import {defineModule, type Finding, type ScanContext, type StepResult} from '../types';
import {makeFinding} from '../evidence';
import {header, htmlBody, jwtRole, scriptAssets} from '../html';
import {getScannerTestAccounts, getSupabaseScanConfig, saveDiscoveredConfig, type SupabaseScanConfig} from '../config';

type TableShape = {name: string; columns: string[]};
type BucketShape = {name: string; public: boolean};
const identifier = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const sensitiveName = /(?:user|profile|email|token|secret|payment|order|customer|invoice|credential|auth|session|address|phone)/i;
const sensitivePath = /(?:secret|private|backup|invoice|export|credential|token|key|customer)/i;
const projectPattern = /https:\/\/[a-z0-9-]{6,40}\.supabase\.co/gi;
const jwtPattern = /eyJ[A-Za-z0-9_-]{12,}\.eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}/g;

function siteIds(context: ScanContext): {ownerId: string; siteId: string} {
  if (!context.site.owner_id || !context.site.id) throw new Error('Persisted site required');
  return {ownerId: context.site.owner_id, siteId: context.site.id};
}

function projectUrl(base: string, path: string): string { return new URL(path, `${new URL(base).origin}/`).toString(); }

function anonRequest(config: SupabaseScanConfig) {
  return {headers: {apikey: config.anonKey}, ...(jwtRole(config.anonKey) === 'anon' ? {bearerToken: config.anonKey} : {}), maxRedirects: 0, followRedirects: false} as const;
}

async function configuration(context: ScanContext): Promise<SupabaseScanConfig | null> {
  const {ownerId, siteId} = siteIds(context);
  return getSupabaseScanConfig(ownerId, siteId);
}

async function discovery(context: ScanContext): Promise<StepResult> {
  const {ownerId, siteId} = siteIds(context);
  if (await configuration(context)) return {findings: [], done: true, summary: {detected: true}};
  const state = context.state && typeof context.state === 'object' && !Array.isArray(context.state) ? context.state : {};
  let assets = Array.isArray(state.assets) ? state.assets.filter((item): item is string => typeof item === 'string' && item.length <= 300).slice(0, 6) : [];
  let cursor = Number(state.cursor ?? -1);
  if (!Number.isInteger(cursor) || cursor < -1) cursor = -1;
  let source = context.site.normalized_url;
  let content = '';
  if (cursor === -1) {
    const root = await context.http(source, {maxBytes: 300_000, timeoutMs: 4000});
    content = htmlBody(root);
    assets = scriptAssets(content, source, 20).filter((item) => !item.thirdParty && /\/_next\/static\//.test(item.url)).slice(0, 6).map((item) => item.url);
  } else if (cursor < assets.length) {
    source = assets[cursor];
    const result = await context.http(source, {maxBytes: 300_000, timeoutMs: 4000});
    if (result.status === 200) content = result.body.toString('utf8');
  } else return {findings: [], done: true};
  const discoveredUrl = content.match(projectPattern)?.[0];
  const tokens = content.match(jwtPattern) ?? [];
  const anonKey = tokens.find((token) => jwtRole(token) === 'anon') ?? content.match(/sb_publishable_[A-Za-z0-9_-]{20,}/)?.[0];
  const elevated = tokens.some((token) => jwtRole(token) === 'service_role') || /sb_secret_[A-Za-z0-9_-]{20,}/.test(content);
  if (discoveredUrl || anonKey) await saveDiscoveredConfig(ownerId, siteId, {...(discoveredUrl ? {projectUrl: discoveredUrl} : {}), ...(anonKey ? {anonKey} : {})});
  const next = cursor + 1;
  return {
    findings: elevated ? [makeFinding('service_role_leak', source, {source: cursor === -1 ? 'html' : 'client_bundle'})] : [],
    done: next >= assets.length || Boolean(await configuration(context)),
    nextState: {assets, cursor: next}, summary: {detected: Boolean(await configuration(context))}
  };
}

function schemaParts(raw: unknown): {tables: TableShape[]; functions: string[]} {
  if (!raw || typeof raw !== 'object') return {tables: [], functions: []};
  const document = raw as Record<string, unknown>;
  const paths = document.paths && typeof document.paths === 'object' ? document.paths as Record<string, unknown> : {};
  const definitions = document.definitions && typeof document.definitions === 'object' ? document.definitions as Record<string, unknown> : {};
  const tables: TableShape[] = [];
  const functions: string[] = [];
  for (const path of Object.keys(paths).slice(0, 300)) {
    if (path.startsWith('/rpc/')) {
      const name = path.slice(5);
      if (identifier.test(name)) functions.push(name);
      continue;
    }
    const name = path.slice(1);
    if (!identifier.test(name)) continue;
    const definition = definitions[name];
    const props = definition && typeof definition === 'object' && 'properties' in definition ? (definition as {properties?: unknown}).properties : undefined;
    const columns = props && typeof props === 'object' ? Object.keys(props).filter((item) => identifier.test(item)).slice(0, 40) : [];
    tables.push({name, columns});
  }
  return {tables: tables.slice(0, 80), functions: functions.slice(0, 80)};
}

async function inspectSchema(context: ScanContext): Promise<StepResult> {
  const config = await configuration(context);
  if (!config) return {findings: [], done: true, summary: {detected: false}};
  const response = await context.http(projectUrl(config.projectUrl, '/rest/v1/'), {...anonRequest(config), headers: {apikey: config.anonKey, accept: 'application/openapi+json'}, maxBytes: 1_000_000, timeoutMs: 6000});
  if (response.status !== 200) return {findings: [], done: true, summary: {detected: true, status: response.status}};
  let parsed: unknown;
  try { parsed = JSON.parse(response.body.toString('utf8')); } catch { return {findings: [], done: true}; }
  const {tables, functions} = schemaParts(parsed);
  const suspicious = functions.filter((name) => /(?:exec|admin|delete|drop|grant|service|sql|unsafe|billing|password|token)/i.test(name));
  const findings = [
    ...suspicious.map((name) => makeFinding('exposed_sensitive_rpc', config.projectUrl, {function: name, manualVerification: true})),
    ...(tables.length ? [makeFinding('write_policy_manual', config.projectUrl, {count: tables.length, manualVerification: true})] : [])
  ];
  return {findings, done: true, summary: {detected: true, tables, functions}};
}

async function snapshot(scanId: string | undefined): Promise<{tables: TableShape[]; functions: string[]}> {
  if (!scanId) return {tables: [], functions: []};
  const {data, error} = await createAdminClient().from('scan_modules_results').select('result').eq('scan_id', scanId).eq('module_key', 'supabase').maybeSingle();
  if (error) throw new Error('Could not read scanner progress');
  const result = data?.result;
  if (!result || typeof result !== 'object' || Array.isArray(result)) return {tables: [], functions: []};
  const tables = Array.isArray(result.tables) ? result.tables.filter((item): item is TableShape => Boolean(item && typeof item === 'object' && !Array.isArray(item) && 'name' in item && typeof item.name === 'string' && identifier.test(item.name) && 'columns' in item && Array.isArray(item.columns))).slice(0, 80) : [];
  const functions = Array.isArray(result.functions) ? result.functions.filter((item): item is string => typeof item === 'string' && identifier.test(item)).slice(0, 80) : [];
  return {tables, functions};
}

function estimatedRows(response: Awaited<ReturnType<ScanContext['http']>>): number | null {
  const match = /\/([0-9]+)$/.exec(header(response, 'content-range'));
  return match ? Number(match[1]) : null;
}

async function inspectTable(context: ScanContext): Promise<StepResult> {
  const config = await configuration(context);
  if (!config) return {findings: [], done: true};
  const {tables} = await snapshot(context.scanId);
  const state = context.state && typeof context.state === 'object' && !Array.isArray(context.state) ? context.state : {};
  const cursor = Number(state.cursor ?? 0);
  if (!Number.isInteger(cursor) || cursor < 0 || cursor >= tables.length) return {findings: [], done: true};
  const table = tables[cursor];
  const url = new URL(`/rest/v1/${encodeURIComponent(table.name)}`, config.projectUrl);
  url.searchParams.set('select', '*');
  url.searchParams.set('limit', '1');
  const response = await context.http(url.toString(), {...anonRequest(config), method: 'HEAD', headers: {apikey: config.anonKey, prefer: 'count=planned'}, maxBytes: 1, timeoutMs: 4000});
  const count = estimatedRows(response);
  const readable = [200, 206].includes(response.status) && /^0-0\//.test(header(response, 'content-range'));
  const sensitive = sensitiveName.test(table.name) || table.columns.some((name) => sensitiveName.test(name));
  const id = sensitive ? 'anon_readable_sensitive_table' : 'anon_readable_table';
  return {
    findings: readable ? [makeFinding(id, config.projectUrl, {table: table.name, columns: table.columns, ...(count !== null ? {estimatedRows: count} : {})})] : [],
    done: cursor === tables.length - 1,
    nextState: {cursor: cursor + 1},
    summary: {tableResult: {table: table.name, columns: table.columns, readable, estimatedRows: count, status: response.status}}
  };
}

async function inspectStorage(context: ScanContext): Promise<StepResult> {
  const config = await configuration(context);
  if (!config) return {findings: [], done: true};
  const state = context.state && typeof context.state === 'object' && !Array.isArray(context.state) ? context.state : {};
  let buckets = Array.isArray(state.buckets) ? state.buckets.filter((item): item is BucketShape => Boolean(item && typeof item === 'object' && !Array.isArray(item) && 'name' in item && typeof item.name === 'string' && 'public' in item && typeof item.public === 'boolean')).slice(0, 30) : [];
  let cursor = Number(state.cursor ?? -1);
  if (!Number.isInteger(cursor) || cursor < -1) cursor = -1;
  if (cursor === -1) {
    const response = await context.http(projectUrl(config.projectUrl, '/storage/v1/bucket'), {...anonRequest(config), maxBytes: 64_000, timeoutMs: 4000});
    try {
      const raw: unknown = JSON.parse(response.body.toString('utf8'));
      const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && 'buckets' in raw ? (raw as {buckets: unknown}).buckets : [];
      buckets = Array.isArray(list) ? list.filter((item): item is BucketShape => Boolean(item && typeof item === 'object' && 'name' in item && typeof item.name === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(item.name) && 'public' in item && typeof item.public === 'boolean')).slice(0, 30) : [];
    } catch { buckets = []; }
    cursor = 0;
  }
  if (cursor >= buckets.length) return {findings: [], done: true, summary: {count: buckets.length}};
  const bucket = buckets[cursor];
  const findings: Finding[] = [];
  const objectNames: string[] = [];
  if (bucket.public) {
    findings.push(makeFinding('public_storage_bucket', config.projectUrl, {bucket: bucket.name}));
    try {
      const result = await safeSupabaseReadPost(projectUrl(config.projectUrl, `/storage/v1/object/list/${bucket.name}`), {limit: 50, offset: 0}, config.anonKey, 4000);
      if (result.status === 200) {
        const raw: unknown = JSON.parse(result.body.toString('utf8'));
        if (Array.isArray(raw)) for (const item of raw.slice(0, 50)) {
          if (item && typeof item === 'object' && 'name' in item && typeof item.name === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(item.name)) objectNames.push(item.name);
        }
      }
    } catch { /* Listing is not available anonymously; bucket metadata still counts. */ }
    const suspicious = objectNames.filter((name) => sensitivePath.test(name));
    if (suspicious.length) findings.push(makeFinding('public_storage_sensitive_path', config.projectUrl, {bucket: bucket.name, count: suspicious.length}));
  }
  return {findings, done: cursor === buckets.length - 1, nextState: {buckets, cursor: cursor + 1}, summary: {bucketResult: {bucket: bucket.name, public: bucket.public, objectNames}}};
}

async function inspectAuth(context: ScanContext): Promise<StepResult> {
  const config = await configuration(context);
  if (!config) return {findings: [], done: true};
  const response = await context.http(projectUrl(config.projectUrl, '/auth/v1/settings'), {...anonRequest(config), maxBytes: 64_000, timeoutMs: 4000});
  if (response.status !== 200) return {findings: [], done: true};
  let settings: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(response.body.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {findings: [], done: true};
    settings = value as Record<string, unknown>;
  } catch { return {findings: [], done: true}; }
  const findings: Finding[] = [];
  if (settings.disable_signup === false) findings.push(makeFinding('open_signups', config.projectUrl, {detected: true}));
  if (settings.mailer_autoconfirm === true) findings.push(makeFinding('auth_autoconfirm', config.projectUrl, {detected: true}));
  if (settings.external_anonymous === true) findings.push(makeFinding('weak_auth_provider', config.projectUrl, {provider: 'anonymous', manualVerification: true}));
  return {findings, done: true};
}

function jwtSubject(token: string): string | null {
  try {
    const payload: unknown = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    if (!payload || typeof payload !== 'object') return null;
    const sub = (payload as Record<string, unknown>).sub;
    return typeof sub === 'string' && /^[0-9a-f-]{36}$/i.test(sub) ? sub : null;
  } catch { return null; }
}

async function signIn(project: string, key: string, email: string, password: string): Promise<{token: string; userId: string} | null> {
  const response = await safeSupabaseReadPost(projectUrl(project, '/auth/v1/token?grant_type=password'), {email, password, grant_type: 'password'}, key, 5000);
  if (response.status !== 200) return null;
  try {
    const raw: unknown = JSON.parse(response.body.toString('utf8'));
    const token = raw && typeof raw === 'object' && 'access_token' in raw ? (raw as {access_token: unknown}).access_token : null;
    if (typeof token !== 'string' || jwtRole(token) !== 'authenticated') return null;
    const userId = jwtSubject(token);
    return userId ? {token, userId} : null;
  } catch { return null; }
}

async function crossUser(context: ScanContext): Promise<StepResult> {
  const config = await configuration(context);
  if (!config || !/^[a-z0-9-]+\.supabase\.co$/.test(new URL(config.projectUrl).hostname)) return {findings: [], done: true};
  const {ownerId, siteId} = siteIds(context);
  const accounts = await getScannerTestAccounts(ownerId, siteId);
  if (!accounts) return {findings: [], done: true};
  const {tables} = await snapshot(context.scanId);
  const candidates = tables.filter((table) => table.columns.includes('user_id') || table.columns.includes('owner_id')).slice(0, 3);
  const state = context.state && typeof context.state === 'object' && !Array.isArray(context.state) ? context.state : {};
  const cursor = Number(state.cursor ?? 0);
  if (!Number.isInteger(cursor) || cursor < 0 || cursor >= candidates.length) return {findings: [], done: true};
  const first = await signIn(config.projectUrl, config.anonKey, accounts[0].email, accounts[0].password);
  const second = await signIn(config.projectUrl, config.anonKey, accounts[1].email, accounts[1].password);
  if (!first || !second || first.userId === second.userId) return {findings: [makeFinding('cross_user_manual', config.projectUrl, {manualVerification: true})], done: true};
  const table = candidates[cursor];
  const column = table.columns.includes('user_id') ? 'user_id' : 'owner_id';
  const url = new URL(`/rest/v1/${table.name}`, config.projectUrl);
  url.searchParams.set('select', '*');
  url.searchParams.set(column, `eq.${first.userId}`);
  url.searchParams.set('limit', '1');
  const requestOptions = {method: 'HEAD' as const, maxRedirects: 0, followRedirects: false, maxBytes: 1, timeoutMs: 4000, headers: {apikey: config.anonKey}};
  const ownerView = await context.http(url.toString(), {...requestOptions, bearerToken: first.token});
  const ownerHasRow = [200, 206].includes(ownerView.status) && /^0-0\//.test(header(ownerView, 'content-range'));
  const findings: Finding[] = [];
  if (ownerHasRow) {
    const otherView = await context.http(url.toString(), {...requestOptions, bearerToken: second.token});
    if ([200, 206].includes(otherView.status) && /^0-0\//.test(header(otherView, 'content-range'))) findings.push(makeFinding('cross_user_read', config.projectUrl, {table: table.name, columns: [column]}));
  } else findings.push(makeFinding('cross_user_manual', config.projectUrl, {table: table.name, manualVerification: true}));
  return {findings, done: cursor === candidates.length - 1, nextState: {cursor: cursor + 1}};
}

export const supabaseModule = defineModule('supabase', 'Scanner.modules.supabase', [
  {id: 'discovery', verifiedOnly: true, timeoutMs: 7000, run: discovery},
  {id: 'schema', verifiedOnly: true, timeoutMs: 9000, run: inspectSchema},
  {id: 'tables', verifiedOnly: true, timeoutMs: 7000, run: inspectTable},
  {id: 'storage', verifiedOnly: true, timeoutMs: 9000, run: inspectStorage},
  {id: 'auth', verifiedOnly: true, timeoutMs: 7000, run: inspectAuth},
  {id: 'cross-user', verifiedOnly: true, timeoutMs: 25000, run: crossUser}
]);
