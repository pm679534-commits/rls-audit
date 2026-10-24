import 'server-only';

import {cache} from 'react';
import type {User} from '@supabase/supabase-js';
import {createClient} from '@/lib/supabase/server';
import {EmailUnverifiedError, ForbiddenError, NotFoundError, ReadOnlyError, SuspendedError, UnauthenticatedError} from '@/lib/errors';
import type {Database, Tables} from '@/types/database';
import type {PlanFeature} from '@/lib/plans';
import {resolveEntitlements, requireFeature} from '@/lib/billing/entitlements';

export type UserContext = {user: User; profile: Tables<'profiles'>};
export type Entitlements = Database['public']['Functions']['current_entitlements']['Returns'][number];
export type TeamRole = Database['public']['Enums']['team_role'];

export const getSession = cache(async (): Promise<UserContext | null> => {
  const db = await createClient();
  const {data: {user}, error} = await db.auth.getUser();
  if (error || !user) return null;
  const {data: profile, error: profileError} = await db.from('profiles').select('*').eq('id', user.id).single();
  if (profileError || !profile) return null;
  return {user, profile};
});

export function requireVerifiedEmail(context: UserContext): UserContext {
  if (!context.user.email_confirmed_at) throw new EmailUnverifiedError();
  return context;
}

export function requireActiveAccount(context: UserContext): UserContext {
  if (context.profile.suspended) throw new SuspendedError();
  return context;
}

export const requireUser = cache(async (): Promise<UserContext> => {
  const context = await getSession();
  if (!context) throw new UnauthenticatedError();
  return requireActiveAccount(requireVerifiedEmail(context));
});

export const requireAdmin = cache(async (): Promise<UserContext> => {
  const context = await requireUser();
  if (context.profile.role !== 'admin') throw new ForbiddenError();
  const db = await createClient();
  const {data, error} = await db.rpc('is_admin');
  if (error || !data) throw new ForbiddenError();
  return context;
});

export async function requireTeamRole(teamId: string, roles: readonly TeamRole[] = ['owner', 'member', 'viewer']): Promise<UserContext & {role: TeamRole}> {
  const context = await requireUser();
  const db = await createClient();
  const {data, error} = await db.from('team_members').select('role').eq('team_id', teamId).eq('user_id', context.user.id).maybeSingle();
  if (error || !data || !roles.includes(data.role)) throw new ForbiddenError();
  return {...context, role: data.role};
}

export async function requireTeamEdit(teamId: string): Promise<UserContext & {role: TeamRole}> {
  const context = await requireTeamRole(teamId, ['owner', 'member']);
  await requireWritableAccount(context);
  const db = await createClient();
  const {data, error} = await db.rpc('can_edit_team', {p_team: teamId});
  if (error || !data) throw new ForbiddenError();
  return context;
}

export async function getEntitlements(context: UserContext): Promise<Entitlements> {
  return resolveEntitlements(context);
}

export async function requireWritableAccount(context: UserContext): Promise<Entitlements> {
  requireActiveAccount(context);
  const entitlements = await getEntitlements(context);
  if (entitlements.read_only) throw new ReadOnlyError();
  return entitlements;
}

export async function requirePlanFeature(context: UserContext, feature: PlanFeature): Promise<Entitlements> {
  return requireFeature(context, feature);
}

export async function requireSiteAccess(siteId: string, action: 'view' | 'edit' = 'view'): Promise<Tables<'sites'>> {
  const context = await requireUser();
  if (action === 'edit') await requireWritableAccount(context);
  const db = await createClient();
  const functionName = action === 'edit' ? 'can_edit_site' : 'can_view_site';
  const {data: allowed, error: accessError} = await db.rpc(functionName, {p_site: siteId});
  if (accessError || !allowed) throw new ForbiddenError();
  const {data: site, error} = await db.from('sites').select('*').eq('id', siteId).single();
  if (error || !site) throw new NotFoundError();
  return site;
}

export function requireVerifiedSite(site: Tables<'sites'>): Tables<'sites'> {
  if (site.status !== 'active' || !site.verified_at || !site.verification_due_at || new Date(site.verification_due_at).getTime() <= Date.now()) throw new ForbiddenError();
  return site;
}

export async function requireCanAddSite(context: UserContext): Promise<void> {
  await requireWritableAccount(context);
  const db = await createClient();
  const {data, error} = await db.rpc('can_add_site', {p_user: context.user.id});
  if (error || !data) throw new ForbiddenError();
}

export async function requireCanRunManualScan(context: UserContext): Promise<void> {
  await requireWritableAccount(context);
  const db = await createClient();
  const {data, error} = await db.rpc('can_run_manual_scan', {p_user: context.user.id});
  if (error || !data) throw new ForbiddenError();
}
