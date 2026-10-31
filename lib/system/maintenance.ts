import 'server-only';

import {unstable_cache} from 'next/cache';
import {createAdminClient} from '@/lib/supabase/admin';

const databaseMaintenance = unstable_cache(async () => {
  const {data} = await createAdminClient().rpc('maintenance_enabled');
  return data === true;
}, ['siteguard-maintenance'], {revalidate: 30, tags: ['maintenance']});

export async function isMaintenanceMode(): Promise<boolean> {
  return process.env.MAINTENANCE_MODE === 'true' || databaseMaintenance();
}
