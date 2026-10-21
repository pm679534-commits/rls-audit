import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
import {NextResponse, type NextRequest} from 'next/server';
import {z} from 'zod';
import {getPublicEnv} from '@/lib/env';
import {parseJsonBody} from '@/lib/api/v1';

const bodySchema = z.object({locale: z.enum(['en', 'az'])});

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(getPublicEnv().NEXT_PUBLIC_SITE_URL).origin) return NextResponse.json({error: 'Forbidden'}, {status: 403});
  const body = bodySchema.safeParse(await parseJsonBody(request).catch(() => null));
  if (!body.success) return NextResponse.json({error: 'Invalid locale'}, {status: 400});
  const cookieStore = await cookies();
  const env = getPublicEnv();
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
  if (updateError) return NextResponse.json({error: 'Could not save language preference'}, {status: 500});
  const response = new NextResponse(null, {status: 204});
  response.cookies.set('siteguard_locale', body.data.locale, {path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production'});
  return response;
}
