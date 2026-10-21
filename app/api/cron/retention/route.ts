import {cronEndpoint} from '@/lib/cron';
import {createAdminClient} from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: Request) {
  return cronEndpoint(request, async () => {
    const db = createAdminClient();
    const {data: expired, error: readError} = await db.from('data_exports').select('id,format,storage_path')
      .lt('expires_at', new Date().toISOString()).eq('status', 'completed').limit(100);
    if (readError) throw readError;
    let files = 0;
    for (const row of expired ?? []) {
      if (row.storage_path) {
        const {error: removeError} = await db.storage.from(row.format === 'pdf' ? 'report-pdfs' : 'data-exports').remove([row.storage_path]);
        if (removeError) throw removeError;
      }
      const {error: updateError} = await db.from('data_exports').update({status: 'expired', storage_path: null}).eq('id', row.id);
      if (updateError) throw updateError;
      files++;
    }
    const {data: removed, error} = await db.rpc('purge_expired_scan_history', {p_limit: 500});
    if (error) throw error;
    return {scans: removed ?? 0, exports: files};
  });
}
