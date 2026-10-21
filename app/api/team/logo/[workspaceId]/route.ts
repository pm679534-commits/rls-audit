import {z} from 'zod';
import {requireTeamRole} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin';
import {NotFoundError, toRouteError} from '@/lib/errors';

export const runtime = 'nodejs';
export async function GET(_request: Request, {params}: {params: Promise<{workspaceId: string}>}) {
  try {
    const workspaceId = z.string().uuid().parse((await params).workspaceId);
    const db = createAdminClient();
    const {data: workspace} = await db.from('client_workspaces').select('team_id,logo_path').eq('id', workspaceId).maybeSingle();
    if (!workspace?.logo_path) throw new NotFoundError();
    await requireTeamRole(workspace.team_id);
    const {data: file, error} = await db.storage.from('white-label-logos').download(workspace.logo_path);
    if (error || !file) throw new NotFoundError();
    return new Response(file, {headers: {'Content-Type': file.type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
  } catch (error) { return toRouteError(error); }
}
