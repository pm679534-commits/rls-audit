import {cronEndpoint} from '@/lib/cron';
import {createAdminClient} from '@/lib/supabase/admin';
import {isSystemFeatureEnabled} from '@/lib/system/config';

export const runtime = 'nodejs';
export const maxDuration = 30;
export async function GET(request: Request) {
  return cronEndpoint(request, async () => {
    if (!await isSystemFeatureEnabled('automatic_scans')) return {enqueued: 0, disabled: true};
    const {data, error} = await createAdminClient().rpc('enqueue_due_scans', {p_limit: 100});
    if (error) throw error;
    return {enqueued: data ?? 0};
  });
}
