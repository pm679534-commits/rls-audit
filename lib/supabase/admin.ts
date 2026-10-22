import 'server-only';

import {createClient as createSupabaseClient} from '@supabase/supabase-js';
import {getServiceRoleEnv} from '@/lib/env';
import type {Database} from '@/types/database';

let client: ReturnType<typeof createSupabaseClient<Database>> | undefined;

export function createAdminClient() {
  if (!client) {
    const env = getServiceRoleEnv();
    client = createSupabaseClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {autoRefreshToken: false, persistSession: false, detectSessionInUrl: false}
    });
  }
  return client;
}
