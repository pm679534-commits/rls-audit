import 'server-only';

import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {requireSiteAccess, requireUser, requireWritableAccount} from '@/lib/auth';
import {resolveOwnerEntitlements, hasEntitlement} from '@/lib/billing/entitlements';
import {constantTimeEqual, secureRandomToken, sha256Bytea} from '@/lib/crypto';
import {ConflictError, ForbiddenError, NotFoundError} from '@/lib/errors';
import type {Tables} from '@/types/database';

export type PublicReport = {site: Pick<Tables<'sites'>, 'name' | 'domain'>; scan: Pick<Tables<'scans'>, 'score' | 'completed_at'>;
  findings: Pick<Tables<'findings'>, 'finding_key' | 'severity' | 'title_key'>[]};

export async function createShareLink(siteId: string, scanId: string): Promise<{id: string; token: string}> {
  const site = await requireSiteAccess(siteId, 'edit');
  const context = await requireUser();
  const owner = await resolveOwnerEntitlements(site.owner_id);
  if (!hasEntitlement(owner, 'publicScoreLink')) throw new ForbiddenError();
  const db = createAdminClient();
  const {data: scan} = await db.from('scans').select('id,created_at').eq('id', scanId).eq('site_id', site.id).eq('status', 'completed').maybeSingle();
  if (!scan || new Date(scan.created_at).getTime() < Date.now() - (owner.history_days ?? 30) * 86_400_000) throw new NotFoundError();
  const token = secureRandomToken(32);
  const {data, error} = await db.from('share_links').insert({site_id: site.id, scan_id: scan.id, created_by: context.user.id,
    token_prefix: token.slice(0, 12), token_hash: sha256Bytea(token), expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString()}).select('id').single();
  if (error || !data) throw new Error('Could not create report link');
  return {id: data.id, token};
}

export async function revokeShareLink(id: string): Promise<void> {
  const db = createAdminClient();
  const {data: link} = await db.from('share_links').select('site_id').eq('id', id).maybeSingle();
  if (!link) throw new NotFoundError();
  await requireSiteAccess(link.site_id, 'edit');
  const {error} = await db.from('share_links').update({revoked_at: new Date().toISOString()}).eq('id', id).is('revoked_at', null);
  if (error) throw new Error('Could not revoke report link');
}

async function validLink(token: string): Promise<Tables<'share_links'>> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new NotFoundError();
  const {data, error} = await createAdminClient().from('share_links').select('*').eq('token_prefix', token.slice(0, 12)).is('revoked_at', null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).limit(20);
  if (error) throw new NotFoundError();
  const hash = sha256Bytea(token);
  const matched = (data ?? []).find((row) => constantTimeEqual(row.token_hash, hash));
  if (!matched) throw new NotFoundError();
  return matched;
}

export async function getPublicReport(token: string): Promise<PublicReport> {
  const link = await validLink(token);
  const db = createAdminClient();
  const [{data: site}, {data: scan}] = await Promise.all([
    db.from('sites').select('name,domain').eq('id', link.site_id).maybeSingle(),
    link.scan_id ? db.from('scans').select('id,score,completed_at').eq('id', link.scan_id).eq('site_id', link.site_id).eq('status', 'completed').maybeSingle() : Promise.resolve({data: null})
  ]);
  if (!site || !scan) throw new NotFoundError();
  const findings: PublicReport['findings'] = [];
  for (let offset = 0; ; offset += 500) {
    const {data, error} = await db.from('findings').select('finding_key,severity,title_key').eq('scan_id', scan.id).order('id').range(offset, offset + 499);
    if (error) throw new NotFoundError();
    findings.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  await db.from('share_links').update({last_accessed_at: new Date().toISOString()}).eq('id', link.id);
  return {site, scan, findings};
}

export async function getBadgeScore(token: string): Promise<number | null> {
  const link = await validLink(token);
  const db = createAdminClient();
  const {data: site} = await db.from('sites').select('owner_id').eq('id', link.site_id).maybeSingle();
  if (!site || !hasEntitlement(await resolveOwnerEntitlements(site.owner_id), 'scoreBadge')) throw new NotFoundError();
  if (!link.scan_id) throw new NotFoundError();
  const {data: scan} = await db.from('scans').select('score').eq('id', link.scan_id).eq('site_id', link.site_id).eq('status', 'completed').maybeSingle();
  if (!scan) throw new NotFoundError();
  return scan.score;
}

export type ReportExportFormat = 'pdf' | 'csv' | 'json';
export interface ReportExportQueue { request(siteId: string, scanId: string, format: ReportExportFormat): Promise<Tables<'data_exports'>>; }

export const reportExportQueue: ReportExportQueue = {
  async request(siteId, scanId, format) {
    const site = await requireSiteAccess(siteId, 'edit');
    const context = await requireUser();
    await requireWritableAccount(context);
    const owner = await resolveOwnerEntitlements(site.owner_id);
    if (!hasEntitlement(owner, format === 'pdf' ? 'pdfReports' : format === 'csv' ? 'csvExport' : 'jsonExport')) throw new ForbiddenError();
    const db = createAdminClient();
    const {data: scan} = await db.from('scans').select('id,created_at').eq('id', scanId).eq('site_id', site.id).eq('status', 'completed').maybeSingle();
    if (!scan || new Date(scan.created_at).getTime() < Date.now() - (owner.history_days ?? 30) * 86_400_000) throw new NotFoundError();
    const {data: pending} = await db.from('data_exports').select('*').eq('owner_id', context.user.id).eq('scan_id', scan.id).eq('format', format).in('status', ['queued', 'processing']).maybeSingle();
    if (pending) return pending;
    const {data, error} = await db.from('data_exports').insert({owner_id: context.user.id, site_id: site.id, scan_id: scan.id,
      format, scope: 'report'}).select('*').single();
    if (error || !data) throw error?.code === '23505' ? new ConflictError() : new Error('Could not queue report export');
    return data;
  }
};

export async function listReports(page = 1) {
  const context = await requireUser();
  const db = await createClient();
  const offset = (Math.max(1, Math.min(page, 10000)) - 1) * 25;
  const [{data: sites, error: sitesError}, {data: links, error: linksError}, {data: exports, error: exportsError}] = await Promise.all([
    db.from('sites').select('id,name,domain,owner_id,last_score').order('name').limit(100),
    db.from('share_links').select('id,site_id,scan_id,created_at,expires_at,revoked_at,last_accessed_at').order('created_at', {ascending: false}).range(offset, offset + 25),
    db.from('data_exports').select('id,format,status,created_at,storage_path').eq('owner_id', context.user.id).eq('scope', 'report').order('created_at', {ascending: false}).range(offset, offset + 25)
  ]);
  if (sitesError || linksError || exportsError) throw new Error('Could not load reports');
  return {sites: sites ?? [], links: (links ?? []).slice(0, 25), exports: (exports ?? []).slice(0, 25), hasNext: (links?.length ?? 0) > 25 || (exports?.length ?? 0) > 25};
}
