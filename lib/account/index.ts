import 'server-only';

import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {generateApiKey} from '@/lib/crypto';
import {requireUser, requireWritableAccount} from '@/lib/auth';
import {ConflictError, ForbiddenError, ValidationError} from '@/lib/errors';
import type {UserContext} from '@/lib/auth';
import {requireApiAccess} from '@/lib/billing/entitlements';
import {API_SCOPES} from './scopes';

const BUCKETS = ['avatars', 'white-label-logos', 'report-pdfs', 'data-exports'] as const;

export async function updateProfile(context: UserContext, input: {displayName: string; locale: 'en' | 'az'}): Promise<void> {
  await requireWritableAccount(context);
  const {error} = await (await createClient()).from('profiles').update({display_name: input.displayName.trim() || null, locale: input.locale}).eq('id', context.user.id);
  if (error) throw new Error('Could not update profile');
}

export async function updateNotificationPreferences(context: UserContext, input: Record<string, boolean>): Promise<void> {
  await requireWritableAccount(context);
  const {error} = await (await createClient()).from('profiles').update({notification_preferences: input}).eq('id', context.user.id);
  if (error) throw new Error('Could not update preferences');
  if (input.email) {
    const {error: resubscribeError} = await createAdminClient().from('profiles').update({email_unsubscribed_at: null}).eq('id', context.user.id);
    if (resubscribeError) throw new Error('Could not restore email notifications');
  }
}

export async function createApiKey(context: UserContext, input: {name: string; scopes: string[]; expiresAt?: string}): Promise<string> {
  const entitlements = await requireApiAccess(context);
  if (input.scopes.some((scope) => !API_SCOPES.includes(scope as typeof API_SCOPES[number]))) throw new ValidationError();
  if (entitlements.effective_plan !== 'agency' && input.scopes.some((scope) => ['exports:read', 'ci:write'].includes(scope))) throw new ForbiddenError();
  const db = createAdminClient();
  const {count, error: countError} = await db.from('api_keys').select('id', {count: 'exact', head: true}).eq('owner_id', context.user.id).is('revoked_at', null);
  if (countError || count === null) throw new Error('Could not check API keys');
  if (count >= 10) throw new ConflictError();
  const value = generateApiKey();
  const {error} = await db.from('api_keys').insert({owner_id: context.user.id, name: input.name.trim(), key_prefix: value.prefix, key_hash: value.hash, scopes: input.scopes, expires_at: input.expiresAt ?? null});
  if (error) throw new Error('Could not create API key');
  return value.key;
}

export async function revokeApiKey(context: UserContext, id: string): Promise<void> {
  await requireWritableAccount(context);
  const {data, error} = await createAdminClient().from('api_keys').update({revoked_at: new Date().toISOString()}).eq('id', id).eq('owner_id', context.user.id).is('revoked_at', null).select('id').maybeSingle();
  if (error || !data) throw new ForbiddenError();
}

export async function requestDataExport(context: UserContext): Promise<void> {
  const db = createAdminClient();
  const {data: pending} = await db.from('data_exports').select('id').eq('owner_id', context.user.id).in('status', ['queued', 'processing']).maybeSingle();
  if (pending) throw new ConflictError();
  const {error} = await db.from('data_exports').insert({owner_id: context.user.id, format: 'json', scope: 'account'});
  if (error) throw new Error('Could not request data export');
}

export async function removeStoredFiles(ownerId: string): Promise<void> {
  const db = createAdminClient();
  for (const bucket of BUCKETS) {
    const pending = [ownerId];
    while (pending.length) {
      const path = pending.pop()!;
      const files: string[] = [];
      for (let offset = 0; ; offset += 1000) {
        const {data, error} = await db.storage.from(bucket).list(path, {limit: 1000, offset});
        if (error) throw new Error('Could not list account files');
        for (const item of data ?? []) {
          const itemPath = `${path}/${item.name}`;
          if (item.id) files.push(itemPath);
          else pending.push(itemPath);
        }
        if (!data || data.length < 1000) break;
      }
      for (let offset = 0; offset < files.length; offset += 1000) {
        const {error: removeError} = await db.storage.from(bucket).remove(files.slice(offset, offset + 1000));
        if (removeError) throw new Error('Could not remove account files');
      }
    }
  }
}

export async function deleteAccount(context: UserContext, confirmation: string): Promise<void> {
  if (confirmation !== 'DELETE') throw new ValidationError();
  const db = createAdminClient();
  const {data: subscriptions, error: subscriptionError} = await db.from('subscriptions').select('id').eq('owner_id', context.user.id).in('status', ['trialing', 'active', 'past_due', 'paused']).limit(1);
  if (subscriptionError) throw new Error('Could not check subscription');
  if (subscriptions?.length) throw new ConflictError('Cancel the paid subscription before deleting this account.');
  await removeStoredFiles(context.user.id);
  const {error} = await db.auth.admin.deleteUser(context.user.id);
  if (error) throw new Error('Could not delete account');
  await (await createClient()).auth.signOut();
}

export async function getAccountSettings() {
  const context = await requireUser();
  const db = await createClient();
  const [keys, exports, sessions] = await Promise.all([
    db.from('api_keys').select('id,name,key_prefix,scopes,expires_at,revoked_at,last_used_at,created_at').eq('owner_id', context.user.id).order('created_at', {ascending: false}),
    db.from('data_exports').select('id,format,scope,status,storage_path,expires_at,created_at').eq('owner_id', context.user.id).order('created_at', {ascending: false}).limit(10),
    db.rpc('list_my_sessions')
  ]);
  if (keys.error || exports.error || sessions.error) throw new Error('Could not load settings');
  return {context, keys: keys.data ?? [], exports: exports.data ?? [], sessions: sessions.data ?? []};
}
