import {cronEndpoint} from '@/lib/cron';
import {createAdminClient} from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: Request) {
  return cronEndpoint(request, async () => {
    const db = createAdminClient();
    const {data: queued, error} = await db.rpc('enqueue_trial_notifications', {p_limit: 500});
    if (error) throw error;
    return {queued: queued ?? 0};
  });
}
