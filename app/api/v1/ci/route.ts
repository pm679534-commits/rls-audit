import {z} from 'zod';
import {apiEndpoint, json, ownedSite, parseJsonBody} from '@/lib/api/v1';
import {hasEntitlement} from '@/lib/billing/entitlements';
import {ForbiddenError, NotFoundError} from '@/lib/errors';
import {createAdminClient} from '@/lib/supabase/admin';

export const runtime = 'nodejs';
const schema = z.object({siteId: z.string().uuid(), minScore: z.number().int().min(0).max(100).default(80), maxCritical: z.number().int().min(0).max(100).default(0)});
export async function POST(request: Request) {
  return apiEndpoint(request, 'ci:write', 'ci:check', async (context, headers) => {
    if (!hasEntitlement(context.entitlements, 'ciEndpoint')) throw new ForbiddenError();
    const input = schema.parse(await parseJsonBody(request));
    const site = await ownedSite(context, input.siteId);
    const db = createAdminClient();
    const {data: scan} = await db.from('scans').select('id,score,completed_at').eq('site_id', site.id).eq('status', 'completed').order('completed_at', {ascending: false}).limit(1).maybeSingle();
    if (!scan || scan.score === null) throw new NotFoundError();
    const {count, error} = await db.from('findings').select('id', {count: 'exact', head: true}).eq('scan_id', scan.id).eq('severity', 'critical');
    if (error) throw error;
    const critical = count ?? 0;
    const passed = scan.score >= input.minScore && critical <= input.maxCritical;
    return json({passed, score: scan.score, critical, thresholds: {minScore: input.minScore, maxCritical: input.maxCritical},
      scanId: scan.id, completedAt: scan.completed_at,
      ...(passed ? {} : {error: {code: 'CI_THRESHOLD_FAILED', message: 'The latest scan did not meet the configured thresholds.'}})}, headers, passed ? 200 : 422);
  });
}
