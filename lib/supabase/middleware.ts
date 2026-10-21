import {createServerClient} from '@supabase/ssr';
import type {NextRequest, NextResponse} from 'next/server';
import {getPublicEnv} from '@/lib/public-env';
import type {Database} from '@/types/database';

export function createMiddlewareClient(request: NextRequest, response: NextResponse) {
  const env = getPublicEnv();
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        for (const {name, value, options} of values) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
      }
    }
  });
}
