import 'server-only';

import {z} from 'zod';
import {createAdminClient} from '@/lib/supabase/admin';
import {createClient as createUserClient} from '@/lib/supabase/server';
import {requireUser, requireWritableAccount} from '@/lib/auth';
import {ConflictError, ForbiddenError, NotFoundError, ValidationError} from '@/lib/errors';
import {logger} from '@/lib/logger';
import {safeFetch} from '@/lib/ssrf';
import {parseApiKey, verifyApiKey} from '@/lib/crypto';
import {checkApiKeyRateLimit} from '@/lib/rate-limit';
import type {Json, Tables} from '@/types/database';
import type {PlanId} from '@/lib/plans';
import {resolveOwnerEntitlements} from '@/lib/billing/entitlements';
import {requireSystemFeature} from '@/lib/system/config';
import {generalWebModule} from './modules/general-web';
import {nextjsModule} from './modules/nextjs';
import {supabaseModule} from './modules/supabase';
import {FINDING_REGISTRY, type FindingId} from './registry';
import {calculateScore} from './scoring';
import {sanitizeEvidence} from './evidence';
import type {Finding, ScanContext, ScanModule, StepResult} from './types';

export const SCAN_MODULES: readonly ScanModule[] = [generalWebModule, nextjsModule, supabaseModule];
const CREATE_SCHEMA = z.object({
  siteId: z.string().uuid(),
  kind: z.enum(['manual', 'passive']),
  idempotencyKey: z.string().min(8).max(200).optional()
});
const PROCESS_BUDGET_MS = 35_000;

function isVerified(site: Tables<'sites'>, kind: Tables<'scans'>['kind']): boolean {
  return kind !== 'passive' && Boolean(site.verified_at && site.verification_due_at && new Date(site.verification_due_at).getTime() > Date.now());
}

function scanErrorCode(error: unknown): string {
  if (error instanceof Error && /timed out/i.test(error.message)) return 'timeout';
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[A-Z_]{2,40}$/.test(error.code)) return error.code.toLowerCase();
  return 'step_failed';
}

async function ownerPlan(ownerId: string): Promise<PlanId | null> {
  return (await resolveOwnerEntitlements(ownerId)).effective_plan;
}

export async function createScan(input: unknown): Promise<Tables<'scans'>> {
  const parsed = CREATE_SCHEMA.safeParse(input);
  if (!parsed.success) throw new ValidationError();
  const {siteId, kind, idempotencyKey} = parsed.data;
  await requireSystemFeature('manual_scans');
  const context = await requireUser();
  await requireWritableAccount(context);
  const userDb = await createUserClient();
  const {data: allowed, error: accessError} = await userDb.rpc('can_edit_site', {p_site: siteId});
  if (accessError || !allowed) throw new ForbiddenError();
  return insertScan(siteId, kind, context.user.id, idempotencyKey);
}

export async function createApiScan(apiKey: string, siteId: string, idempotencyKey?: string): Promise<Tables<'scans'>> {
  await requireSystemFeature('api_access');
  if (!z.string().uuid().safeParse(siteId).success || (idempotencyKey && (idempotencyKey.length < 8 || idempotencyKey.length > 200))) throw new ValidationError();
  const parsed = parseApiKey(apiKey);
  if (!parsed.validFormat) throw new ForbiddenError();
  const db = createAdminClient();
  const {data: key, error: keyError} = await db.from('api_keys').select('*').eq('key_prefix', parsed.prefix).maybeSingle();
  if (keyError || !key || !verifyApiKey(apiKey, key.key_hash) || key.revoked_at || (key.expires_at && new Date(key.expires_at).getTime() <= Date.now()) || !key.scopes.includes('scans:write')) throw new ForbiddenError();
  const {data: profile, error: profileError} = await db.from('profiles').select('suspended').eq('id', key.owner_id).single();
  if (profileError || !profile || profile.suspended) throw new ForbiddenError();
  await checkApiKeyRateLimit(key.id, 'scan:create', 30, 3600);
  const result = await insertScan(siteId, 'api', key.owner_id, idempotencyKey);
  await db.from('api_keys').update({last_used_at: new Date().toISOString()}).eq('id', key.id);
  return result;
}

async function insertScan(siteId: string, kind: Tables<'scans'>['kind'], requesterId: string, idempotencyKey?: string): Promise<Tables<'scans'>> {
  const db = createAdminClient();
  const {data: site, error: siteError} = await db.from('sites').select('*').eq('id', siteId).single();
  if (siteError || !site) throw new NotFoundError();
  if (kind === 'api' && site.owner_id !== requesterId) throw new ForbiddenError();
  if (site.status !== 'active' || (kind !== 'passive' && !isVerified(site, kind))) throw new ForbiddenError();
  if (idempotencyKey) {
    const {data: previous} = await db.from('scans').select('*').eq('idempotency_key', idempotencyKey).maybeSingle();
    if (previous) {
      if (previous.site_id !== siteId || previous.requested_by !== requesterId || previous.kind !== kind) throw new ConflictError();
      return previous;
    }
  }
  const priority = (await ownerPlan(site.owner_id)) === 'agency' ? 10 : 0;
  const {data: scan, error} = await db.from('scans').insert({site_id: siteId, kind, requested_by: requesterId, idempotency_key: idempotencyKey ?? null}).select('*').single();
  if (error || !scan) {
    if (idempotencyKey && error?.code === '23505') {
      const {data: existing} = await db.from('scans').select('*').eq('idempotency_key', idempotencyKey).maybeSingle();
      if (existing && existing.site_id === siteId && existing.requested_by === requesterId && existing.kind === kind) return existing;
    }
    throw new ConflictError();
  }
  const {error: queueError} = await db.from('scan_jobs').insert({scan_id: scan.id, module_key: 'orchestrator', step_key: 'bootstrap', priority});
  if (queueError) {
    await db.from('scans').delete().eq('id', scan.id);
    throw new Error('Could not queue scan');
  }
  return scan;
}

async function jobOwned(job: Tables<'scan_jobs'>, worker: string): Promise<void> {
  const {data, error} = await createAdminClient().from('scan_jobs').select('id').eq('id', job.id).eq('status', 'running').eq('locked_by', worker).gt('lease_expires_at', new Date().toISOString()).maybeSingle();
  if (error || !data) throw new ConflictError('Scan job lease is no longer valid.');
}

async function updateJob(job: Tables<'scan_jobs'>, worker: string, changes: Partial<Tables<'scan_jobs'>>): Promise<void> {
  const {data, error} = await createAdminClient().from('scan_jobs').update(changes).eq('id', job.id).eq('status', 'running').eq('locked_by', worker).select('id').maybeSingle();
  if (error || !data) throw new ConflictError('Scan job lease is no longer valid.');
}

async function markJobDone(job: Tables<'scan_jobs'>, worker: string): Promise<void> {
  await updateJob(job, worker, {status: 'succeeded', completed_at: new Date().toISOString(), locked_at: null, locked_by: null, lease_expires_at: null, progress: {}});
}

async function moduleResult(scanId: string, moduleId: string, status: Tables<'scans'>['status'], summary?: Record<string, Json | undefined>, errorCode?: string): Promise<void> {
  const db = createAdminClient();
  const {data: existing, error: readError} = await db.from('scan_modules_results').select('result,started_at').eq('scan_id', scanId).eq('module_key', moduleId).maybeSingle();
  if (readError) throw new Error('Could not read module result');
  const previous = existing?.result && typeof existing.result === 'object' && !Array.isArray(existing.result) ? existing.result : {};
  const result: Record<string, Json | undefined> = {...previous};
  if (summary) for (const [key, value] of Object.entries(summary)) {
    if (value === undefined) continue;
    if (key === 'tableResult') {
      const old = Array.isArray(result.tableResults) ? result.tableResults : [];
      result.tableResults = [...old.filter((item) => !item || typeof item !== 'object' || Array.isArray(item) || item.table !== (value as {table?: string}).table), value].slice(0, 80);
    } else if (key === 'bucketResult') {
      const old = Array.isArray(result.bucketResults) ? result.bucketResults : [];
      result.bucketResults = [...old.filter((item) => !item || typeof item !== 'object' || Array.isArray(item) || item.bucket !== (value as {bucket?: string}).bucket), value].slice(0, 30);
    } else result[key] = value;
  }
  const {error} = await db.from('scan_modules_results').upsert({
    scan_id: scanId, module_key: moduleId, status, result,
    started_at: existing?.started_at ?? new Date().toISOString(),
    completed_at: ['completed', 'failed'].includes(status) ? new Date().toISOString() : null,
    error_code: errorCode ?? null
  }, {onConflict: 'scan_id,module_key'});
  if (error) throw new Error('Could not save module result');
}

async function persistFindings(scan: Tables<'scans'>, site: Tables<'sites'>, moduleId: string, stepId: string, findings: Finding[]): Promise<void> {
  if (!findings.length) return;
  const db = createAdminClient();
  const unique = [...new Map(findings.map((item) => [item.fingerprint, item])).values()];
  const {data: states, error: stateError} = await db.from('finding_states').select('fingerprint,created_at').eq('site_id', site.id).in('fingerprint', unique.map((item) => item.fingerprint));
  if (stateError) throw new Error('Could not read finding history');
  const firstSeen = new Map((states ?? []).map((item) => [item.fingerprint, item.created_at]));
  const rows = unique.map((finding) => {
    const definition = FINDING_REGISTRY[finding.id as FindingId];
    if (!definition || definition.module !== moduleId) throw new Error('Unknown or mismatched finding');
    return {
      scan_id: scan.id, site_id: site.id, finding_key: finding.id, fingerprint: finding.fingerprint,
      severity: definition.severity, score_weight: definition.scoreWeight,
      affected_asset: finding.affectedAsset, title_key: definition.titleKey, description_key: definition.descriptionKey,
      impact_key: definition.impactKey, fix_key: definition.fixKey,
      evidence: sanitizeEvidence(finding.evidence),
      fix_snippets: {},
      metadata: {module: moduleId, step: stepId, ...(finding.metadata ?? {})},
      first_seen_at: firstSeen.get(finding.fingerprint) ?? new Date().toISOString()
    };
  });
  const {error} = await db.from('findings').upsert(rows, {onConflict: 'scan_id,fingerprint'});
  if (error) throw new Error('Could not save findings');
}

async function bootstrap(job: Tables<'scan_jobs'>, worker: string, scan: Tables<'scans'>, site: Tables<'sites'>): Promise<void> {
  const db = createAdminClient();
  const verified = isVerified(site, scan.kind);
  for (const module of SCAN_MODULES) {
    if (!site.enabled_modules.includes(module.id) && !(scan.kind === 'passive' && module.id === 'general-web')) continue;
    const first = module.steps.find((step) => verified || !step.verifiedOnly);
    if (!first) continue;
    const {error} = await db.from('scan_jobs').upsert({scan_id: scan.id, module_key: module.id, step_key: first.id, priority: job.priority}, {onConflict: 'scan_id,module_key,step_key', ignoreDuplicates: true});
    if (error) throw new Error('Could not queue module');
    const {error: resultError} = await db.from('scan_modules_results').upsert({scan_id: scan.id, module_key: module.id, status: 'queued', result: {}}, {onConflict: 'scan_id,module_key', ignoreDuplicates: true});
    if (resultError) throw new Error('Could not initialize module result');
  }
  const {error: finalizerError} = await db.from('scan_jobs').upsert({scan_id: scan.id, module_key: 'orchestrator', step_key: 'finalize', priority: -10}, {onConflict: 'scan_id,module_key,step_key', ignoreDuplicates: true});
  if (finalizerError) throw new Error('Could not queue finalizer');
  await markJobDone(job, worker);
}

async function runStep(job: Tables<'scan_jobs'>, worker: string, scan: Tables<'scans'>, site: Tables<'sites'>): Promise<void> {
  const module = SCAN_MODULES.find((item) => item.id === job.module_key);
  const index = module?.steps.findIndex((item) => item.id === job.step_key) ?? -1;
  const step = index >= 0 ? module?.steps[index] : undefined;
  if (!module || !step) throw new Error('Unknown scan step');
  const verified = isVerified(site, scan.kind);
  if (step.verifiedOnly && !verified) {
    await moduleResult(scan.id, module.id, 'failed', {reasonCode: 'verification_expired'}, 'verification_expired');
    await updateJob(job, worker, {status: 'dead', completed_at: new Date().toISOString(), last_error_code: 'verification_expired', locked_at: null, locked_by: null, lease_expires_at: null});
    return;
  }
  const plan = await ownerPlan(site.owner_id);
  if (!plan) throw new ForbiddenError();
  const deadlineAt = Date.now() + step.timeoutMs;
  const context: ScanContext = {
    site, verified, scanId: scan.id, planId: plan, state: job.progress, deadlineAt,
    http: (url, options = {}) => {
      const remaining = deadlineAt - Date.now() - 250;
      if (remaining < 100) throw new Error('Scan step timed out');
      return safeFetch(url, {...options, timeoutMs: Math.max(100, Math.min(remaining, options.timeoutMs ?? 5000, 30000))});
    }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result: StepResult = await Promise.race([
      step.run(context),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Scan step timed out')), step.timeoutMs); })
    ]);
    if (timer) clearTimeout(timer);
    await jobOwned(job, worker);
    await persistFindings(scan, site, module.id, step.id, result.findings);
    await moduleResult(scan.id, module.id, 'running', result.summary);
    if (!result.done) {
      const nextState = result.nextState ?? {};
      if (JSON.stringify(nextState).length > 30_000) throw new Error('Scan progress too large');
      await updateJob(job, worker, {status: 'queued', attempts: 0, progress: nextState, available_at: new Date().toISOString(), locked_at: null, locked_by: null, lease_expires_at: null});
      return;
    }
    const next = module.steps.slice(index + 1).find((item) => verified || !item.verifiedOnly);
    if (next) {
      const {error} = await createAdminClient().from('scan_jobs').upsert({scan_id: scan.id, module_key: module.id, step_key: next.id, priority: job.priority}, {onConflict: 'scan_id,module_key,step_key', ignoreDuplicates: true});
      if (error) throw new Error('Could not queue next step');
    } else await moduleResult(scan.id, module.id, 'completed');
    await markJobDone(job, worker);
  } finally { if (timer) clearTimeout(timer); }
}

async function retryOrFail(job: Tables<'scan_jobs'>, worker: string, error: unknown): Promise<void> {
  const code = scanErrorCode(error);
  logger.warn('scanner_step_failed', {code: code.toUpperCase(), attempts: job.attempts});
  if (job.attempts >= job.max_attempts) {
    if (job.module_key !== 'orchestrator') await moduleResult(job.scan_id, job.module_key, 'failed', undefined, code);
    else await createAdminClient().from('scans').update({status: 'failed', failure_code: code, completed_at: new Date().toISOString()}).eq('id', job.scan_id);
    await updateJob(job, worker, {status: 'dead', completed_at: new Date().toISOString(), last_error_code: code, locked_at: null, locked_by: null, lease_expires_at: null});
    return;
  }
  const delay = Math.min(3600, 30 * 2 ** Math.min(job.attempts, 7));
  await updateJob(job, worker, {status: 'queued', available_at: new Date(Date.now() + delay * 1000).toISOString(), last_error_code: code, locked_at: null, locked_by: null, lease_expires_at: null});
}

export type ScanDiff = {newFingerprints: string[]; resolvedFingerprints: string[]; persistentFingerprints: string[]; regression: boolean};

export function diffScans(current: readonly Tables<'findings'>[], previous: readonly Tables<'findings'>[], currentScore: number, previousScore: number | null): ScanDiff {
  const now = new Map(current.map((item) => [item.fingerprint, item]));
  const before = new Map(previous.map((item) => [item.fingerprint, item]));
  const newFingerprints = [...now.keys()].filter((key) => !before.has(key));
  const resolvedFingerprints = [...before.keys()].filter((key) => !now.has(key));
  const persistentFingerprints = [...now.keys()].filter((key) => before.has(key));
  const regression = (previousScore !== null && currentScore <= previousScore - 10) || newFingerprints.some((key) => ['critical', 'high'].includes(now.get(key)!.severity));
  return {newFingerprints, resolvedFingerprints, persistentFingerprints, regression};
}

async function finalize(job: Tables<'scan_jobs'>, worker: string, scan: Tables<'scans'>, site: Tables<'sites'>): Promise<void> {
  const db = createAdminClient();
  const {data: otherJobs, error: jobsError} = await db.from('scan_jobs').select('status,module_key').eq('scan_id', scan.id).neq('id', job.id);
  if (jobsError) throw new Error('Could not read scan jobs');
  const pending = (otherJobs ?? []).some((item) => ['queued', 'running'].includes(item.status));
  if (pending) {
    await updateJob(job, worker, {status: 'queued', attempts: 0, available_at: new Date(Date.now() + 5000).toISOString(), locked_at: null, locked_by: null, lease_expires_at: null});
    return;
  }
  const failed = (otherJobs ?? []).some((item) => item.status === 'dead');
  if (failed) {
    const {error} = await db.from('scans').update({status: 'failed', failure_code: 'module_failed', summary: {partial: true}, completed_at: new Date().toISOString()}).eq('id', scan.id);
    if (error) throw new Error('Could not fail scan');
    await markJobDone(job, worker);
    return;
  }
  const {data: current, error: currentError} = await db.from('findings').select('*').eq('scan_id', scan.id);
  if (currentError || !current) throw new Error('Could not load findings');
  const score = calculateScore(current.map((row) => ({id: row.finding_key, fingerprint: row.fingerprint, affectedAsset: row.affected_asset, evidence: {}})));
  const {data: previousScan, error: previousError} = await db.from('scans').select('id,score').eq('site_id', site.id).eq('status', 'completed').neq('id', scan.id).order('created_at', {ascending: false}).limit(1).maybeSingle();
  if (previousError) throw new Error('Could not load previous scan');
  const {data: previous, error: findingsError} = previousScan ? await db.from('findings').select('*').eq('scan_id', previousScan.id) : {data: [], error: null};
  if (findingsError) throw new Error('Could not compare scans');
  const comparable = scan.kind === 'passive' ? (previous ?? []).filter((item) => item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata) && item.metadata.step === 'root') : previous ?? [];
  const diff = diffScans(current, comparable, score, previousScan?.score ?? null);
  const currentFingerprints = new Set(current.map((item) => item.fingerprint));
  for (const row of current) {
    const {data: state, error: readError} = await db.from('finding_states').select('id,status').eq('site_id', site.id).eq('fingerprint', row.fingerprint).maybeSingle();
    if (readError) throw new Error('Could not read finding state');
    if (!state) {
      const {error} = await db.from('finding_states').insert({site_id: site.id, fingerprint: row.fingerprint, status: 'open'});
      if (error && error.code !== '23505') throw new Error('Could not create finding state');
    } else if (state.status === 'fixed') {
      const {error} = await db.from('finding_states').update({status: 'open', reason: null, resolved_at: null}).eq('id', state.id);
      if (error) throw new Error('Could not reopen finding');
    }
  }
  for (const row of comparable) if (!currentFingerprints.has(row.fingerprint)) {
    const {error} = await db.from('finding_states').update({status: 'fixed', resolved_at: new Date().toISOString()}).eq('site_id', site.id).eq('fingerprint', row.fingerprint).neq('status', 'fixed');
    if (error) throw new Error('Could not resolve finding');
  }
  const summary: Json = {new: diff.newFingerprints.length, resolved: diff.resolvedFingerprints.length, persistent: diff.persistentFingerprints.length, regression: diff.regression, previousScore: previousScan?.score ?? null, verified: isVerified(site, scan.kind)};
  const completedAt = new Date().toISOString();
  const {error: scanError} = await db.from('scans').update({status: 'completed', score, summary, completed_at: completedAt}).eq('id', scan.id);
  if (scanError) throw new Error('Could not finalize scan');
  const {error: siteError} = await db.from('sites').update({last_score: score, last_scan_at: completedAt}).eq('id', site.id);
  if (siteError) throw new Error('Could not update site score');
  await markJobDone(job, worker);
}

export async function processJob(job: Tables<'scan_jobs'>, worker: string): Promise<void> {
  await jobOwned(job, worker);
  const db = createAdminClient();
  const {data: scan, error: scanError} = await db.from('scans').select('*').eq('id', job.scan_id).single();
  if (scanError || !scan) throw new NotFoundError();
  const {data: site, error: siteError} = await db.from('sites').select('*').eq('id', scan.site_id).single();
  if (siteError || !site) throw new NotFoundError();
  try {
    if (scan.status === 'canceled' || scan.status === 'failed' || scan.status === 'completed' || site.status !== 'active') {
      await updateJob(job, worker, {status: 'canceled', completed_at: new Date().toISOString(), locked_at: null, locked_by: null, lease_expires_at: null});
      return;
    }
    if (job.module_key === 'orchestrator' && job.step_key === 'bootstrap') await bootstrap(job, worker, scan, site);
    else if (job.module_key === 'orchestrator' && job.step_key === 'finalize') await finalize(job, worker, scan, site);
    else await runStep(job, worker, scan, site);
  } catch (error) { await retryOrFail(job, worker, error); }
}

export async function claimAndProcessJobs(worker: string, maxJobs = 2): Promise<{claimed: number; processed: number}> {
  if (!/^[A-Za-z0-9_.:-]{1,120}$/.test(worker) || !Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > 5) throw new ValidationError();
  const {data, error} = await createAdminClient().rpc('claim_scan_jobs', {p_limit: maxJobs, p_worker: worker, p_lease_seconds: 120});
  if (error || !data) throw new Error('Could not claim scan jobs');
  const started = Date.now();
  let processed = 0;
  for (const job of data) {
    if (Date.now() - started > PROCESS_BUDGET_MS) {
      await createAdminClient().from('scan_jobs').update({status: 'queued', attempts: Math.max(0, job.attempts - 1), locked_at: null, locked_by: null, lease_expires_at: null}).eq('id', job.id).eq('status', 'running').eq('locked_by', worker);
      continue;
    }
    await processJob(job, worker);
    processed++;
  }
  return {claimed: data.length, processed};
}

export async function recoverStuckJobs(): Promise<number> {
  const {data, error} = await createAdminClient().rpc('recover_stuck_jobs');
  if (error) throw new Error('Could not recover scan jobs');
  return data ?? 0;
}
