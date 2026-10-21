import {z} from 'zod';
import {apiEndpoint, json, uuid} from '@/lib/api/v1';
import {NotFoundError} from '@/lib/errors';
import {createAdminClient} from '@/lib/supabase/admin';

export const runtime = 'nodejs';
const querySchema = z.object({download: z.enum(['1']).optional()});
export async function GET(request: Request, {params}: {params: Promise<{id: string}>}) {
  return apiEndpoint(request, 'exports:read', 'exports:read', async (context, headers) => {
    const id = uuid.parse((await params).id);
    const db = createAdminClient();
    const {data} = await db.from('data_exports').select('id,status,format,scope,storage_path,expires_at,error_code,completed_at')
      .eq('id', id).eq('owner_id', context.profile.id).eq('scope', 'report').maybeSingle();
    if (!data) throw new NotFoundError();
    const download = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams)).download === '1';
    if (download) {
      if (data.status !== 'completed' || !data.storage_path || (data.expires_at && new Date(data.expires_at).getTime() < Date.now())) throw new NotFoundError();
      const {data: file, error} = await db.storage.from(data.format === 'pdf' ? 'report-pdfs' : 'data-exports').download(data.storage_path);
      if (error || !file) throw new NotFoundError();
      headers.set('Content-Type', data.format === 'pdf' ? 'application/pdf' : data.format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8');
      headers.set('Content-Disposition', `attachment; filename="siteguard-${id}.${data.format}"`);
      return new Response(file, {headers});
    }
    return json({data: {id: data.id, status: data.status, format: data.format, completedAt: data.completed_at,
      expiresAt: data.expires_at, errorCode: data.error_code, downloadUrl: data.status === 'completed' ? `/api/v1/exports/${id}?download=1` : null}}, headers);
  });
}
