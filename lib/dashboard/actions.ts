'use server';

import {z} from 'zod';
import {createServerAction} from '@/lib/actions';
import {saveSiteScanSettings, saveManualSupabase, saveCrossUserAccounts, removeScannerSecret} from './site';
import {SCAN_MODULE_KEYS} from './constants';
import {changeFindingState} from './findings';

const siteId = z.string().uuid();

export async function saveScanSettingsAction(raw: unknown) {
  return createServerAction(z.object({siteId, intervalHours: z.union([z.literal(24), z.literal(168), z.literal(720), z.null()]),
    modules: z.array(z.enum(SCAN_MODULE_KEYS)).min(1).max(3)}), async (input) => {
    await saveSiteScanSettings(input.siteId, input); return {saved: true};
  }, {rateLimit: {name: 'scan-settings', limit: 20, windowSeconds: 3600}})(raw);
}

export async function saveSupabaseConfigAction(raw: unknown) {
  return createServerAction(z.object({siteId, projectUrl: z.string().url().max(300), anonKey: z.string().min(20).max(4096)}), async (input) => {
    await saveManualSupabase(input.siteId, input.projectUrl, input.anonKey); return {saved: true};
  }, {rateLimit: {name: 'scanner-credentials', limit: 10, windowSeconds: 3600}})(raw);
}

export async function saveTestAccountsAction(raw: unknown) {
  return createServerAction(z.object({siteId, accounts: z.tuple([
    z.object({email: z.string().email().max(254), password: z.string().min(1).max(256)}),
    z.object({email: z.string().email().max(254), password: z.string().min(1).max(256)})
  ])}), async (input) => {
    await saveCrossUserAccounts(input.siteId, input.accounts); return {saved: true};
  }, {rateLimit: {name: 'scanner-test-accounts', limit: 10, windowSeconds: 3600}})(raw);
}

export async function clearScannerSecretAction(raw: unknown) {
  return createServerAction(z.object({siteId, kind: z.enum(['supabase_scan_config', 'scanner_test_accounts'])}), async (input) => {
    await removeScannerSecret(input.siteId, input.kind); return {removed: true};
  })(raw);
}

export async function changeFindingStateAction(raw: unknown) {
  return createServerAction(z.object({siteId, findingId: z.string().uuid(), status: z.enum(['open', 'fixed', 'ignored', 'accepted']),
    reason: z.string().trim().max(2000).optional()}), async (input) => {
    await changeFindingState(input); return {saved: true};
  }, {rateLimit: {name: 'finding-state', limit: 100, windowSeconds: 3600}})(raw);
}
