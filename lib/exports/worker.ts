import 'server-only';

import {createAdminClient} from '@/lib/supabase/admin';
import {hasEntitlement, resolveOwnerEntitlements} from '@/lib/billing/entitlements';
import {ForbiddenError, NotFoundError} from '@/lib/errors';
import {logger} from '@/lib/logger';
import type {Tables} from '@/types/database';
import type {Locale} from '@/i18n/routing';
import en from '@/messages/en.json';
import az from '@/messages/az.json';
import {renderReportPdf} from './pdf';

const db = () => createAdminClient();
const csvCell = (value: unknown): string => `"${String(value ?? '').replace(/^[=+@\-]/, "'$&").replace(/"/g, '""')}"`;

async function allRows<T>(fetchPage: (from: number, to: number) => PromiseLike<{data: T[] | null; error: {message: string} | null}>): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += 500) {
    const {data, error} = await fetchPage(start, start + 499);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}

async function reportFile(job: Tables<'data_exports'>): Promise<{file: Buffer; mime: string}> {
  if (!job.site_id || !job.scan_id) throw new NotFoundError();
  const client = db();
  const [{data: site}, {data: scan}, {data: profile}] = await Promise.all([
    client.from('sites').select('*').eq('id', job.site_id).eq('owner_id', job.owner_id).maybeSingle(),
    client.from('scans').select('*').eq('id', job.scan_id).eq('site_id', job.site_id).eq('status', 'completed').maybeSingle(),
    client.from('profiles').select('locale').eq('id', job.owner_id).maybeSingle()
  ]);
  if (!site || !scan || !profile) throw new NotFoundError();
  const entitlements = await resolveOwnerEntitlements(job.owner_id);
  if (!hasEntitlement(entitlements, job.format === 'pdf' ? 'pdfReports' : job.format === 'csv' ? 'csvExport' : 'jsonExport')) throw new ForbiddenError();
  if (new Date(scan.created_at).getTime() < Date.now() - (entitlements.history_days ?? 30) * 86_400_000) throw new NotFoundError();
  const findings = await allRows<Tables<'findings'>>((from, to) => client.from('findings').select('*').eq('scan_id', scan.id).order('id').range(from, to));
  const locale = profile.locale as Locale;
  const messages = (locale === 'az' ? az : en).Scanner.findings as Record<string, {title: string; description: string; impact: string; fix: string}>;
  if (job.format === 'pdf') {
    let brand: {name: string; color: string; logo?: string} | undefined;
    if (site.workspace_id && hasEntitlement(entitlements, 'whiteLabelReports')) {
      const {data: workspace} = await client.from('client_workspaces').select('name,client_name,brand_color,logo_path').eq('id', site.workspace_id).maybeSingle();
      if (workspace) {
        brand = {name: workspace.client_name || workspace.name, color: workspace.brand_color || '#117d78'};
        if (workspace.logo_path?.startsWith(`${job.owner_id}/`)) {
          const {data: logo} = await client.storage.from('white-label-logos').download(workspace.logo_path);
          if (logo && logo.size <= 5_242_880 && ['image/png','image/jpeg'].includes(logo.type))
            brand.logo = `data:${logo.type};base64,${Buffer.from(await logo.arrayBuffer()).toString('base64')}`;
        }
      }
    }
    return {file: await renderReportPdf({site, scan, findings, locale, brand}), mime: 'application/pdf'};
  }
  const entries = findings.map((finding) => ({id: finding.id, key: finding.finding_key, severity: finding.severity,
    asset: finding.affected_asset, title: messages[finding.finding_key]?.title ?? finding.finding_key,
    description: messages[finding.finding_key]?.description ?? '', impact: messages[finding.finding_key]?.impact ?? '',
    fix: messages[finding.finding_key]?.fix ?? '', firstSeenAt: finding.first_seen_at}));
  if (job.format === 'json') return {file: Buffer.from(JSON.stringify({site: {name: site.name, domain: site.domain},
    scan: {id: scan.id, score: scan.score, completedAt: scan.completed_at}, locale, findings: entries})), mime: 'application/json'};
  const columns = ['id','key','severity','asset','title','description','impact','fix','firstSeenAt'] as const;
  const csv = '\uFEFF' + columns.join(',') + '\r\n' + entries.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\r\n');
  return {file: Buffer.from(csv), mime: 'text/csv'};
}

async function accountFile(job: Tables<'data_exports'>): Promise<{file: Buffer; mime: string}> {
  const client = db();
  const ownerId = job.owner_id;
  const {data: profile} = await client.from('profiles').select('id,email,display_name,locale,trial_started_at,trial_ends_at,notification_preferences,created_at').eq('id', ownerId).maybeSingle();
  if (!profile) throw new NotFoundError();
  const sites = await allRows((from, to) => client.from('sites').select('*').eq('owner_id', ownerId).order('id').range(from, to));
  const siteIds = sites.map((site) => site.id);
  const scans = siteIds.length ? await allRows<Tables<'scans'>>((from, to) => client.from('scans').select('*').in('site_id', siteIds).order('id').range(from, to)) : [];
  const findings = siteIds.length ? await allRows<Tables<'findings'>>((from, to) => client.from('findings').select('*').in('site_id', siteIds).order('id').range(from, to)) : [];
  const states = siteIds.length ? await allRows<Tables<'finding_states'>>((from, to) => client.from('finding_states').select('*').in('site_id', siteIds).order('id').range(from, to)) : [];
  const verifications = siteIds.length ? await allRows<Tables<'site_verifications'>>((from, to) => client.from('site_verifications').select('*').in('site_id', siteIds).order('id').range(from, to)) : [];
  const scanIds = scans.map((scan) => scan.id);
  const [notifications, subscriptions, apiKeys, teams, membership, shareLinks, channels, billingEvents, contactMessages, scanModules] = await Promise.all([
    allRows((from, to) => client.from('notifications').select('*').eq('user_id', ownerId).order('id').range(from, to)),
    allRows((from, to) => client.from('subscriptions').select('*').eq('owner_id', ownerId).order('id').range(from, to)),
    allRows((from, to) => client.from('api_keys').select('id,name,scopes,created_at,revoked_at,last_used_at').eq('owner_id', ownerId).order('id').range(from, to)),
    allRows((from, to) => client.from('teams').select('*').eq('owner_id', ownerId).order('id').range(from, to)),
    allRows((from, to) => client.from('team_members').select('*').eq('user_id', ownerId).order('team_id').range(from, to)),
    siteIds.length ? allRows((from, to) => client.from('share_links').select('id,site_id,scan_id,expires_at,revoked_at,last_accessed_at,created_at').in('site_id', siteIds).order('id').range(from, to)) : [],
    allRows((from, to) => client.from('notification_channels').select('id,site_id,type,name,enabled,created_at').eq('owner_id', ownerId).order('id').range(from, to)),
    allRows((from, to) => client.from('billing_events').select('id,event_type,payload,processed_at,created_at').eq('owner_id', ownerId).order('id').range(from, to)),
    allRows((from, to) => client.from('contact_messages').select('id,name,email,subject,body,status,created_at').eq('user_id', ownerId).order('id').range(from, to)),
    (async () => {
      const rows: Tables<'scan_modules_results'>[] = [];
      for (let index = 0; index < scanIds.length; index += 100) {
        const ids = scanIds.slice(index, index + 100);
        rows.push(...await allRows<Tables<'scan_modules_results'>>((from, to) => client.from('scan_modules_results').select('*').in('scan_id', ids).order('id').range(from, to)));
      }
      return rows;
    })()
  ]);
  const teamIds = teams.map((team) => team.id);
  const [workspaces, invites] = await Promise.all([
    teamIds.length ? allRows((from, to) => client.from('client_workspaces').select('*').in('team_id', teamIds).order('id').range(from, to)) : [],
    allRows((from, to) => client.from('team_invites').select('id,team_id,email,role,invited_by,expires_at,accepted_at,revoked_at,created_at').eq('invited_by', ownerId).order('id').range(from, to))
  ]);
  const file = Buffer.from(JSON.stringify({exportedAt: new Date().toISOString(), profile, sites, scans, findings, findingStates: states,
    scanModules, siteVerifications: verifications, shareLinks, notifications, notificationChannels: channels,
    subscriptions, billingEvents, contactMessages, apiKeys, teams, teamMemberships: membership, teamInvites: invites, clientWorkspaces: workspaces}));
  return {file, mime: 'application/json'};
}

export async function processExports(limit = 1): Promise<{claimed: number; completed: number}> {
  const client = db();
  const {data: jobs, error} = await client.rpc('claim_data_exports', {p_limit: limit});
  if (error || !jobs) throw new Error('Could not claim exports');
  let completed = 0;
  for (const job of jobs) {
    try {
      const {file, mime} = job.scope === 'report' ? await reportFile(job) : await accountFile(job);
      if (file.length > (job.format === 'pdf' ? 20 : 50) * 1024 * 1024) throw new Error('Export exceeds storage limit');
      const bucket = job.format === 'pdf' ? 'report-pdfs' : 'data-exports';
      const path = `${job.owner_id}/${job.id}.${job.format}`;
      const {error: uploadError} = await client.storage.from(bucket).upload(path, file, {contentType: mime, upsert: true});
      if (uploadError) throw uploadError;
      const {data: saved, error: saveError} = await client.from('data_exports').update({status: 'completed', storage_path: path, completed_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(), locked_at: null, error_code: null}).eq('id', job.id).eq('status', 'processing').select('id').maybeSingle();
      if (saveError || !saved) {
        await client.storage.from(bucket).remove([path]);
        if (saveError) throw saveError;
        continue;
      }
      completed++;
    } catch (failure) {
      logger.warn('export_failed', {attempts: job.attempts});
      const status = job.attempts >= 5 ? 'failed' : 'queued';
      await client.from('data_exports').update({status, locked_at: null, error_code: 'export_failed',
        available_at: new Date(Date.now() + Math.min(3600, 30 * 2 ** job.attempts) * 1000).toISOString()}).eq('id', job.id).eq('status', 'processing');
    }
  }
  return {claimed: jobs.length, completed};
}
