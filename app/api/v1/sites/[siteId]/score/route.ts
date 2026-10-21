import {apiEndpoint, json, ownedSite} from '@/lib/api/v1';
import {createAdminClient} from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export async function GET(request: Request, {params}: {params: Promise<{siteId: string}>}) {
  return apiEndpoint(request, 'sites:read', 'score:read', async (context, headers) => {
    const site = await ownedSite(context, (await params).siteId);
    const {data: scans, error} = await createAdminClient().from('scans').select('id,score,completed_at')
      .eq('site_id', site.id).eq('status', 'completed').order('completed_at', {ascending: false}).limit(30);
    if (error) throw error;
    return json({data: {siteId: site.id, score: site.last_score, history: scans ?? []}}, headers);
  });
}
