import 'server-only';
import {unstable_cache} from 'next/cache';

import {createAdminClient} from '@/lib/supabase/admin';
import {ForbiddenError} from '@/lib/errors';

export type SystemFeature = 'public_passive_check' | 'manual_scans' | 'automatic_scans' | 'api_access' | 'team_invites';

export const isSystemFeatureEnabled = unstable_cache(async (key: SystemFeature): Promise<boolean> => {
  const {data,error} = await createAdminClient().from('feature_flags').select('enabled').eq('key', key).maybeSingle();
  if (error) throw new Error('Could not load feature flag');
  return data?.enabled === true;
}, ['siteguard-system-feature'], {revalidate: 60, tags: ['system-features']});

export async function requireSystemFeature(key: SystemFeature): Promise<void> {
  if (!(await isSystemFeatureEnabled(key))) throw new ForbiddenError();
}

export async function systemNumberSetting(key: 'verification_recheck_days' | 'public_check_rate_per_hour', fallback: number): Promise<number> {
  const {data,error} = await createAdminClient().from('app_settings').select('value').eq('key', key).maybeSingle();
  if (error) throw new Error('Could not load system setting');
  return typeof data?.value === 'number' && Number.isInteger(data.value) && data.value > 0 ? data.value : fallback;
}
