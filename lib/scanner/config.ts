import 'server-only';

import {createHash} from 'node:crypto';
import {z} from 'zod';
import {createAdminClient} from '@/lib/supabase/admin';
import {decryptSecret, encryptSecret} from '@/lib/crypto';
import {requireSiteAccess, requireVerifiedSite} from '@/lib/auth';
import {ForbiddenError, ValidationError} from '@/lib/errors';
import {jwtRole} from './html';

const projectSchema = z.string().url().refine((value) => {
  try { const url = new URL(value); return url.protocol === 'https:' && /^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/'; }
  catch { return false; }
});
const keySchema = z.string().min(20).max(4096).refine((value) => value.startsWith('sb_publishable_') || jwtRole(value) === 'anon');
const accountSchema = z.object({email: z.string().email().max(254), password: z.string().min(1).max(256)});

export type SupabaseScanConfig = {projectUrl: string; anonKey: string};
export type TestAccounts = [z.infer<typeof accountSchema>, z.infer<typeof accountSchema>];
type SecretKind = 'supabase_scan_config' | 'supabase_discovery' | 'scanner_test_accounts';

function secretId(ownerId: string, siteId: string, kind: SecretKind): string {
  const bytes = createHash('sha256').update(`siteguard-scanner:${ownerId}:${siteId}:${kind}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function writeSecret(ownerId: string, siteId: string, kind: SecretKind, value: unknown): Promise<void> {
  const encrypted = encryptSecret(JSON.stringify(value), `scanner:${ownerId}:${siteId}:${kind}`);
  const {error} = await createAdminClient().from('encrypted_secrets').upsert({
    id: secretId(ownerId, siteId, kind), owner_id: ownerId, site_id: siteId, kind, ...encrypted
  }, {onConflict: 'id'});
  if (error) throw new Error('Could not save scanner configuration');
}

async function readSecret<T>(ownerId: string, siteId: string, kind: SecretKind): Promise<T | null> {
  const {data, error} = await createAdminClient().from('encrypted_secrets').select('key_version,ciphertext,iv,tag').eq('id', secretId(ownerId, siteId, kind)).maybeSingle();
  if (error) throw new Error('Could not read scanner configuration');
  if (!data) return null;
  return JSON.parse(decryptSecret(data, `scanner:${ownerId}:${siteId}:${kind}`)) as T;
}

export async function saveSupabaseScanConfig(siteId: string, input: unknown): Promise<void> {
  const site = requireVerifiedSite(await requireSiteAccess(siteId, 'edit'));
  const parsed = z.object({projectUrl: projectSchema, anonKey: keySchema}).safeParse(input);
  if (!parsed.success) throw new ValidationError();
  await writeSecret(site.owner_id, site.id, 'supabase_scan_config', {projectUrl: new URL(parsed.data.projectUrl).origin, anonKey: parsed.data.anonKey});
}

export async function saveScannerTestAccounts(siteId: string, input: unknown): Promise<void> {
  const site = requireVerifiedSite(await requireSiteAccess(siteId, 'edit'));
  const parsed = z.tuple([accountSchema, accountSchema]).safeParse(input);
  if (!parsed.success || parsed.data[0].email.toLowerCase() === parsed.data[1].email.toLowerCase()) throw new ValidationError();
  const config = await readSecret<SupabaseScanConfig>(site.owner_id, site.id, 'supabase_scan_config');
  if (!config || !/^[a-z0-9-]+\.supabase\.co$/.test(new URL(config.projectUrl).hostname)) throw new ForbiddenError();
  await writeSecret(site.owner_id, site.id, 'scanner_test_accounts', parsed.data);
}

export async function getSupabaseScanConfig(ownerId: string, siteId: string): Promise<SupabaseScanConfig | null> {
  const manual = await readSecret<SupabaseScanConfig>(ownerId, siteId, 'supabase_scan_config');
  if (manual) return manual;
  const discovered = await readSecret<Partial<SupabaseScanConfig>>(ownerId, siteId, 'supabase_discovery');
  return discovered?.projectUrl && discovered.anonKey ? {projectUrl: discovered.projectUrl, anonKey: discovered.anonKey} : null;
}

export async function saveDiscoveredConfig(ownerId: string, siteId: string, partial: Partial<SupabaseScanConfig>): Promise<void> {
  const existing = await readSecret<Partial<SupabaseScanConfig>>(ownerId, siteId, 'supabase_discovery');
  await writeSecret(ownerId, siteId, 'supabase_discovery', {...existing, ...partial});
}

export function getScannerTestAccounts(ownerId: string, siteId: string): Promise<TestAccounts | null> {
  return readSecret<TestAccounts>(ownerId, siteId, 'scanner_test_accounts');
}
