import 'server-only';
import {cache} from 'react';

import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
import {getPublicEnv} from '@/lib/env';
import type {Database} from '@/types/database';

export const createClient = cache(async () => {
  const cookieStore = await cookies();
  const env = getPublicEnv();
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => {
        try {
          for (const {name, value, options} of values) cookieStore.set(name, value, options);
        } catch {
          // React Server Components cannot write cookies; middleware refreshes them.
        }
      }
    }
  });
});
