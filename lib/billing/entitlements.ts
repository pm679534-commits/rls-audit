import 'server-only';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {ForbiddenError, ReadOnlyError} from '@/lib/errors';
import type {UserContext} from '@/lib/auth';
import type {Database, Tables} from '@/types/database';
import type {PlanFeature} from '@/lib/plans';
import {requireSystemFeature} from '@/lib/system/config';

type DbEntitlements = Database['public']['Functions']['current_entitlements']['Returns'][number];
export type ResolvedEntitlements = DbEntitlements & {
  source: 'override' | 'subscription' | 'trial' | 'none';
  subscription: Tables<'subscriptions'> | null;
  trialEndsAt: string;
  overrideExpiresAt: string | null;
  paymentFailed: boolean;
};

export async function resolveEntitlements(context: UserContext): Promise<ResolvedEntitlements> {
  const db = await createClient();
  const [{data: rows, error}, {data: subscription}] = await Promise.all([
    db.rpc('current_entitlements', {p_user: context.user.id}),
    db.from('subscriptions').select('*').eq('owner_id', context.user.id).maybeSingle()
  ]);
  if (error || !rows?.[0]) throw new ForbiddenError();
  const value = rows[0];
  const override = context.profile.plan_override;
  const validOverride = override && (!context.profile.plan_override_expires_at || Date.parse(context.profile.plan_override_expires_at) > Date.now());
  return {...value, source: validOverride && value.effective_plan === override ? 'override' : ['active', 'trialing'].includes(subscription?.status ?? '') && value.effective_plan === subscription?.plan_id ? 'subscription' : value.is_trial ? 'trial' : 'none',
    subscription: subscription ?? null, trialEndsAt: context.profile.trial_ends_at, paymentFailed: subscription?.status === 'past_due',
    overrideExpiresAt: validOverride ? context.profile.plan_override_expires_at : null};
}

export async function resolveOwnerEntitlements(ownerId: string): Promise<DbEntitlements> {
  const {data, error} = await createAdminClient().rpc('current_entitlements', {p_user: ownerId});
  if (error || !data?.[0]) throw new ForbiddenError();
  return data[0];
}

export function hasEntitlement(entitlements: DbEntitlements, feature: PlanFeature): boolean {
  const features = entitlements.features;
  return !entitlements.read_only && !!features && typeof features === 'object' && !Array.isArray(features) && features[feature] === true;
}

export async function requireFeature(context: UserContext, feature: PlanFeature): Promise<ResolvedEntitlements> {
  const entitlements = await resolveEntitlements(context);
  if (entitlements.read_only) throw new ReadOnlyError();
  if (!hasEntitlement(entitlements, feature)) throw new ForbiddenError();
  return entitlements;
}

export const requireAlerts = (context: UserContext, channel: 'slack' | 'discord' | 'webhook') => requireFeature(context, `${channel}Alerts`);
export const requirePdfReports = (context: UserContext) => requireFeature(context, 'pdfReports');
export const requireScoreBadge = (context: UserContext) => requireFeature(context, 'scoreBadge');
export async function requireApiAccess(context: UserContext, full = false) {
  await requireSystemFeature('api_access');
  return requireFeature(context, full ? 'fullApi' : 'limitedApi');
}
export const requireWhiteLabel = (context: UserContext) => requireFeature(context, 'whiteLabelReports');
export const requireScanDiff = (context: UserContext) => requireFeature(context, 'scanComparison');
export const requireTeam = (context: UserContext) => requireFeature(context, 'team');
export const requireClientWorkspaces = (context: UserContext) => requireFeature(context, 'clientWorkspaces');
export const requireGeneratedFixes = (context: UserContext) => requireFeature(context, 'generatedFixes');
