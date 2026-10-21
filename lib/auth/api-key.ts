import 'server-only';

import {createAdminClient} from '@/lib/supabase/admin';
import {parseApiKey, verifyApiKey} from '@/lib/crypto';
import {EmailUnverifiedError, ForbiddenError, ReadOnlyError, SuspendedError, UnauthenticatedError} from '@/lib/errors';
import type {Database, Tables} from '@/types/database';
import {resolveOwnerEntitlements, hasEntitlement} from '@/lib/billing/entitlements';

export type ApiKeyContext = {key: Tables<'api_keys'>; profile: Tables<'profiles'>; entitlements: Database['public']['Functions']['current_entitlements']['Returns'][number]};

export async function authenticateApiKey(raw: string): Promise<ApiKeyContext> {
  const {prefix, validFormat} = parseApiKey(raw);
  if (!validFormat) throw new UnauthenticatedError();
  const db = createAdminClient();
  const {data: key, error} = await db.from('api_keys').select('*').eq('key_prefix', prefix).maybeSingle();
  if (error || !key || !verifyApiKey(raw, key.key_hash) || key.revoked_at || (key.expires_at && new Date(key.expires_at).getTime() <= Date.now())) throw new UnauthenticatedError();
  const {data: profile, error: profileError} = await db.from('profiles').select('*').eq('id', key.owner_id).single();
  if (profileError || !profile) throw new UnauthenticatedError();
  if (profile.suspended) throw new SuspendedError();
  const {data: {user}, error: userError} = await db.auth.admin.getUserById(profile.id);
  if (userError || !user) throw new UnauthenticatedError();
  if (!user.email_confirmed_at) throw new EmailUnverifiedError();
  const entitlements = await resolveOwnerEntitlements(profile.id);
  if (entitlements.read_only) throw new ReadOnlyError();
  if (!hasEntitlement(entitlements, 'limitedApi') ||
      (!hasEntitlement(entitlements, 'fullApi') && key.scopes.some((scope) => ['exports:read', 'ci:write'].includes(scope)))) throw new ForbiddenError();
  return {key, profile, entitlements};
}

export function requireApiScope(context: ApiKeyContext, scope: string): void {
  if (!context.key.scopes.includes(scope)) throw new ForbiddenError();
}
