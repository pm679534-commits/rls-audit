import {z} from 'zod';
import {apiEndpoint, json, ownedScan, parseJsonBody} from '@/lib/api/v1';
import {ForbiddenError, NotFoundError} from '@/lib/errors';
import {hasEntitlement} from '@/lib/billing/entitlements';
import {createAdminClient} from '@/lib/supabase/admin';

export const runtime = 'nodejs';
const schema = z.object({scanId: z.string().uuid(), format: z.enum(['pdf', 'csv', 'json'])});
export async function POST(request: Request) {
  return apiEndpoint(request, 'exports:read', 'exports:create', async (context, headers) => {
    const input = schema.parse(await parseJsonBody(request));
    const {scan, site} = await ownedScan(context, input.scanId);
    if (!hasEntitlement(context.entitlements, input.format === 'pdf' ? 'pdfReports' : input.format === 'csv' ? 'csvExport' : 'jsonExport')) throw new ForbiddenError();
    if (scan.status !== 'completed' || new Date(scan.created_at).getTime() < Date.now() - (context.entitlements.history_days ?? 30) * 86_400_000) throw new NotFoundError();
    const db = createAdminClient();
    const {data: existing} = await db.from('data_exports').select('*').eq('owner_id', context.profile.id).eq('scan_id', scan.id).eq('format', input.format).in('status', ['queued', 'processing']).maybeSingle();
    if (existing) return json({data: {id: existing.id, status: existing.status}}, headers, 202);
    const {data, error} = await db.from('data_exports').insert({owner_id: context.profile.id, site_id: site.id, scan_id: scan.id, format: input.format, scope: 'report'}).select('id,status').single();
    if (error || !data) throw error ?? new Error('Could not queue export');
    return json({data, statusUrl: `/api/v1/exports/${data.id}`}, headers, 202);
  });
}
