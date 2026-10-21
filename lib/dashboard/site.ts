import 'server-only';

import {createAdminClient} from '@/lib/supabase/admin';
import {requireSiteAccess, requireUser, requireWritableAccount} from '@/lib/auth';
import {resolveOwnerEntitlements} from '@/lib/billing/entitlements';
import {saveSupabaseScanConfig, saveScannerTestAccounts} from '@/lib/scanner/config';
import {ForbiddenError, ValidationError} from '@/lib/errors';
import type {Tables} from '@/types/database';
import type {ScanModuleKey} from './constants';


export async function saveSiteScanSettings(siteId: string, input: {intervalHours: number | null; modules: ScanModuleKey[]}): Promise<void> {
  const site = await requireSiteAccess(siteId, 'edit');
  const owner = await resolveOwnerEntitlements(site.owner_id);
  if (owner.read_only || !owner.scan_interval_hours) throw new ForbiddenError();
  if (input.intervalHours !== null && (!([24, 168, 720] as number[]).includes(input.intervalHours) || input.intervalHours < owner.scan_interval_hours)) throw new ValidationError();
  if (!input.modules.length || new Set(input.modules).size !== input.modules.length) throw new ValidationError();
  const interval = input.intervalHours ?? owner.scan_interval_hours;
  const nextScanAt = site.status === 'active' ? new Date(Math.max(Date.now(), new Date(site.last_scan_at ?? site.created_at).getTime() + interval * 3_600_000)).toISOString() : null;
  const {error} = await createAdminClient().from('sites').update({scan_interval_hours: input.intervalHours, enabled_modules: input.modules, next_scan_at: nextScanAt}).eq('id', site.id);
  if (error) throw new Error('Could not save scan settings');
}

export async function getScannerConfigPresence(site: Tables<'sites'>): Promise<{manualConfig: boolean; testAccounts: boolean}> {
  const {data, error} = await createAdminClient().from('encrypted_secrets').select('kind').eq('site_id', site.id).eq('owner_id', site.owner_id).in('kind', ['supabase_scan_config', 'scanner_test_accounts']);
  if (error) throw new Error('Could not load scanner settings');
  return {manualConfig: !!data?.some((row) => row.kind === 'supabase_scan_config'), testAccounts: !!data?.some((row) => row.kind === 'scanner_test_accounts')};
}

export async function removeScannerSecret(siteId: string, kind: 'supabase_scan_config' | 'scanner_test_accounts'): Promise<void> {
  const site = await requireSiteAccess(siteId, 'edit');
  const {error} = await createAdminClient().from('encrypted_secrets').delete().eq('site_id', site.id).eq('owner_id', site.owner_id).eq('kind', kind);
  if (error) throw new Error('Could not clear scanner setting');
  if (kind === 'supabase_scan_config') await removeScannerSecret(siteId, 'scanner_test_accounts');
}

export async function saveManualSupabase(siteId: string, projectUrl: string, anonKey: string): Promise<void> {
  await requireWritableAccount(await requireUser());
  await saveSupabaseScanConfig(siteId, {projectUrl, anonKey});
}

export async function saveCrossUserAccounts(siteId: string, accounts: {email: string; password: string}[]): Promise<void> {
  await requireWritableAccount(await requireUser());
  await saveScannerTestAccounts(siteId, accounts);
}
