import 'server-only';

import {NextResponse} from 'next/server';
import {z} from 'zod';
import {authenticateApiKey, requireApiScope, type ApiKeyContext} from '@/lib/auth/api-key';
import {hasEntitlement} from '@/lib/billing/entitlements';
import {ForbiddenError, NotFoundError, UnauthenticatedError, ValidationError, toRouteError} from '@/lib/errors';
import {checkApiKeyRateLimit, checkRouteRateLimit} from '@/lib/rate-limit';
import {createAdminClient} from '@/lib/supabase/admin';
import {requireSystemFeature} from '@/lib/system/config';
import type {Tables} from '@/types/database';

export const uuid = z.string().uuid();
export const apiNoStore = {'Cache-Control': 'no-store'};
type Scope = 'sites:read' | 'scans:read' | 'scans:write' | 'reports:read' | 'exports:read' | 'ci:write';

export async function apiEndpoint(request: Request, scope: Scope, name: string,
  run: (context: ApiKeyContext, headers: Headers) => Promise<Response>): Promise<Response> {
  let headers = new Headers(apiNoStore);
  try {
    await requireSystemFeature('api_access');
    const ipRate = await checkRouteRateLimit(request, 'api-v1-auth', 2000, 3600);
    ipRate.headers.forEach((value, key) => headers.set(key, value));
    const authorization = request.headers.get('authorization') ?? '';
    if (!authorization.startsWith('Bearer ') || authorization.length > 256) throw new UnauthenticatedError();
    const context = await authenticateApiKey(authorization.slice(7));
    requireApiScope(context, scope);
    if ((scope === 'ci:write' || scope === 'exports:read') && !hasEntitlement(context.entitlements, 'fullApi')) throw new ForbiddenError();
    const rate = await checkApiKeyRateLimit(context.key.id, name, scope === 'scans:write' ? 30 : scope === 'ci:write' ? 120 : 600, 3600);
    rate.headers.forEach((value, key) => headers.set(key, value));
    const {error: usageError} = await createAdminClient().from('api_keys').update({last_used_at: new Date().toISOString()}).eq('id', context.key.id);
    if (usageError) throw usageError;
    return await run(context, headers);
  } catch (error) { return toRouteError(error, headers, 'en', `api_v1_${name}_failed`); }
}

export function json(data: unknown, headers: Headers, status = 200): Response {
  return NextResponse.json(data, {status, headers});
}

export async function parseJsonBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get('content-length') ?? 0) > 16_384) throw new ValidationError();
  const reader = request.body?.getReader();
  if (!reader) return {};
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_384) {await reader.cancel(); throw new ValidationError();}
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  if (!size) return {};
  try {
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {body.set(chunk, offset); offset += chunk.byteLength;}
    return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(body)) as unknown;
  } catch {throw new ValidationError();}
}

export async function ownedSite(context: ApiKeyContext, siteId: string): Promise<Tables<'sites'>> {
  const id = uuid.parse(siteId);
  const {data, error} = await createAdminClient().from('sites').select('*').eq('id', id).eq('owner_id', context.profile.id).maybeSingle();
  if (error || !data) throw new NotFoundError();
  return data;
}

export async function ownedScan(context: ApiKeyContext, scanId: string): Promise<{scan: Tables<'scans'>; site: Tables<'sites'>}> {
  const id = uuid.parse(scanId);
  const db = createAdminClient();
  const {data: scan} = await db.from('scans').select('*').eq('id', id).maybeSingle();
  if (!scan) throw new NotFoundError();
  const site = await ownedSite(context, scan.site_id);
  return {scan, site};
}
