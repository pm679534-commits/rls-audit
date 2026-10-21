import {NextResponse, type NextRequest} from 'next/server';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {requireUser} from '@/lib/auth';
import {toRouteError, NotFoundError} from '@/lib/errors';

export async function GET(_request: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const id = z.string().uuid().parse((await params).id);
    const context = await requireUser();
    const db = await createClient();
    const {data} = await db.from('data_exports').select('storage_path,status,expires_at,format').eq('id', id).eq('owner_id', context.user.id).single();
    if (!data || data.status !== 'completed' || !data.storage_path || (data.expires_at && new Date(data.expires_at).getTime() <= Date.now())) throw new NotFoundError();
    const {data: signed, error} = await db.storage.from(data.format === 'pdf' ? 'report-pdfs' : 'data-exports').createSignedUrl(data.storage_path, 60);
    if (error || !signed?.signedUrl) throw new NotFoundError();
    return NextResponse.redirect(signed.signedUrl, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {return toRouteError(error);}
}
