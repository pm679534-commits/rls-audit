'use client';

import {createBrowserClient} from '@supabase/ssr';
import type {Database} from '@/types/database';

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createClient() {
  return client ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
