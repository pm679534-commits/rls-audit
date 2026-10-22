import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
import {NextResponse, type NextRequest} from 'next/server';
import {z} from 'zod';
import {getPublicSupabaseEnv} from '@/lib/public-env';
import {getSiteUrl} from '@/lib/config';
import {toRouteError} from '@/lib/errors';
import {parseJsonBody} from '@/lib/api/v1';

const bodySchema = z.object({locale: z.enum(['en', 'az'])});

export async function POST(request: NextRequest) {
  try {
  const origin = request.headers.get('origin');
  if (!origin || origin !== getSiteUrl().origin) return NextResponse.json({error: 'Forbidden'}, {status: 403});
  const body = bodySchema.safeParse(await parseJsonBody(request).catch(() => null));
  if (!body.success) return NextResponse.json({error: 'Invalid locale'}, {status: 400});
  const cookieStore = await cookies();
  const env = getPublicSupabaseEnv();
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (updated) => updated.forEach(({name, value, options}) => cookieStore.set(name, value, options))
    }
  });
  const {data: {user}, error} = await supabase.auth.getUser();
  if (error || !user) {
    const response = new NextResponse(null, {status: 204});
    response.cookies.set('siteguard_locale', body.data.locale, {path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production'});
    return response;
  }
  const {error: updateError} = await supabase.from('profiles').update({locale: body.data.locale}).eq('id', user.id);
  if (updateError) throw updateError;
  const response = new NextResponse(null, {status: 204});
  response.cookies.set('siteguard_locale', body.data.locale, {path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production'});
  return response;
  } catch (error) { return toRouteError(error, {'Cache-Control': 'no-store'}, 'en', 'profile_locale_failed'); }
}
