import {z} from 'zod';
import {apiEndpoint, json, uuid} from '@/lib/api/v1';
import {createAdminClient} from '@/lib/supabase/admin';

export const runtime = 'nodejs';
const querySchema = z.object({limit: z.coerce.number().int().min(1).max(100).default(25), cursor: uuid.optional()});
export async function GET(request: Request) {
  return apiEndpoint(request, 'sites:read', 'sites:list', async (context, headers) => {
    const {limit: page, cursor} = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    let query = createAdminClient().from('sites').select('id,name,domain,normalized_url,status,verified_at,last_score,last_scan_at,next_scan_at,created_at')
      .eq('owner_id', context.profile.id).order('id').limit(page + 1);
    if (cursor) query = query.gt('id', cursor);
    const {data, error} = await query;
    if (error) throw error;
    return json({data: (data ?? []).slice(0, page), nextCursor: (data?.length ?? 0) > page ? data![page - 1].id : null}, headers);
  });
}
