import 'server-only';

import {ReadOnlyError} from '@/lib/errors';
import {getEntitlements, type UserContext} from './index';

export type TrialStatus = {active: boolean; expired: boolean; daysRemaining: number; endsAt: string; readOnly: boolean};

export async function getTrialStatus(context: UserContext): Promise<TrialStatus> {
  const entitlements = await getEntitlements(context);
  const remaining = new Date(context.profile.trial_ends_at).getTime() - Date.now();
  return {
    active: entitlements.is_trial && remaining > 0,
    expired: remaining <= 0,
    daysRemaining: Math.max(0, Math.ceil(remaining / 86_400_000)),
    endsAt: context.profile.trial_ends_at,
    readOnly: entitlements.read_only
  };
}

export async function requireMutationAccess(context: UserContext): Promise<void> {
  const status = await getTrialStatus(context);
  if (status.readOnly) throw new ReadOnlyError();
}
