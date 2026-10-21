import {requireAdmin} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin';
import {checkRouteRateLimit, clientIp} from '@/lib/rate-limit';
import {toRouteError} from '@/lib/errors';

export const runtime = 'nodejs';
export const maxDuration = 60;

function csvCell(value: unknown): string {
  const raw = typeof value === 'string' ? value : value === null || value === undefined ? '' : JSON.stringify(value);
  const safe = /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  try {
    const actor = await requireAdmin();
    const rate = await checkRouteRateLimit(request, `admin-audit-export:${actor.user.id}`, 5, 3600);
    const db = createAdminClient();
    const ip = clientIp(request);
    const {error: auditError} = await db.from('admin_audit_log').insert({actor_id: actor.user.id, action: 'audit_csv_export', target_table: 'admin_audit_log', details: {outcome: 'started'}, ip_address: ip === 'unknown' ? null : ip});
    if (auditError) throw new Error('Could not audit export');
    let cursor: number | null = null;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {controller.enqueue(encoder.encode('id,created_at,actor_id,action,target_table,target_id,ip_address,details\r\n'));},
      async pull(controller) {
        try {
          let query = db.from('admin_audit_log').select('id,created_at,actor_id,action,target_table,target_id,ip_address,details').order('id', {ascending: false}).limit(500);
          if (cursor !== null) query = query.lt('id', cursor);
          const {data,error} = await query;
          if (error) throw error;
          if (!data?.length) {controller.close(); return;}
          const lines = data.map((row) => [row.id,row.created_at,row.actor_id,row.action,row.target_table,row.target_id,row.ip_address,row.details].map(csvCell).join(',')).join('\r\n') + '\r\n';
          controller.enqueue(encoder.encode(lines));
          cursor = data[data.length - 1].id;
          if (data.length < 500) controller.close();
        } catch (error) {controller.error(error);}
      }
    });
    return new Response(stream, {headers: {'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="siteguard-admin-audit.csv"', 'Cache-Control': 'private, no-store', ...Object.fromEntries(rate.headers)}});
  } catch (error) {return toRouteError(error);}
}
