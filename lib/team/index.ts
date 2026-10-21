import 'server-only';

import {createElement} from 'react';
import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {requireTeamRole, requireUser, requireWritableAccount} from '@/lib/auth';
import {resolveOwnerEntitlements, hasEntitlement, requireTeam} from '@/lib/billing/entitlements';
import {secureRandomToken, sha256Bytea} from '@/lib/crypto';
import {sendEmail} from '@/lib/email';
import {BRAND_NAME, getSiteUrl} from '@/lib/config';
import {requireSystemFeature} from '@/lib/system/config';
import {getTranslations} from 'next-intl/server';
import {ConflictError, ForbiddenError, NotFoundError} from '@/lib/errors';
import type {Tables} from '@/types/database';

export async function getTeamDashboard(selectedTeamId?: string) {
  const context = await requireUser();
  const db = await createClient();
  const {data: memberships, error} = await db.from('team_members').select('team_id,role').eq('user_id', context.user.id);
  if (error) throw new Error('Could not load teams');
  const teamId = memberships?.find((item) => item.team_id === selectedTeamId)?.team_id ?? memberships?.[0]?.team_id;
  if (!teamId) return {team: null, membership: null, memberships: [], members: [], invites: [], workspaces: [], sites: []};
  const [{data: team, error: teamError}, {data: membershipTeams, error: membershipTeamsError}] = await Promise.all([
    db.from('teams').select('*').eq('id', teamId).maybeSingle(),
    db.from('teams').select('id,name').in('id', (memberships ?? []).map((item) => item.team_id))
  ]);
  if (teamError || membershipTeamsError) throw new Error('Could not load teams');
  const namedMemberships = (memberships ?? []).map((item) => ({...item, name: membershipTeams?.find((row) => row.id === item.team_id)?.name ?? null}));
  if (!team) return {team: null, membership: null, memberships: memberships ?? [], members: [], invites: [], workspaces: [], sites: []};
  const [{data: members, error: membersError}, {data: invites, error: invitesError}, {data: workspaces, error: workspacesError}, {data: sites, error: sitesError}] = await Promise.all([
    db.from('team_members').select('*').eq('team_id', team.id).order('joined_at'),
    team.owner_id === context.user.id ? db.from('team_invites').select('id,email,role,expires_at,accepted_at,revoked_at,created_at').eq('team_id', team.id).order('created_at', {ascending: false}) : Promise.resolve({data: [], error: null}),
    db.from('client_workspaces').select('*').eq('team_id', team.id).order('name'),
    db.from('sites').select('id,name,domain,workspace_id,team_id,owner_id').eq('owner_id', team.owner_id).order('name')
  ]);
  if (membersError || invitesError || workspacesError || sitesError) throw new Error('Could not load team workspace');
  const ids = (members ?? []).map((item) => item.user_id);
  const {data: profiles, error: profilesError} = ids.length ? await createAdminClient().from('profiles').select('id,email,display_name').in('id', ids) : {data: [], error: null};
  if (profilesError) throw new Error('Could not load team members');
  return {team, membership: memberships?.find((item) => item.team_id === team.id) ?? null, memberships: namedMemberships, members: (members ?? []).map((item) => ({...item, profile: profiles?.find((p) => p.id === item.user_id) ?? null})),
    invites: invites ?? [], workspaces: workspaces ?? [], sites: sites ?? []};
}

export async function createTeam(name: string): Promise<Tables<'teams'>> {
  const context = await requireUser();
  await requireWritableAccount(context);
  await requireTeam(context);
  const db = createAdminClient();
  const {data: existing} = await db.from('teams').select('id').eq('owner_id', context.user.id).maybeSingle();
  if (existing) throw new ConflictError();
  const {data, error} = await db.from('teams').insert({owner_id: context.user.id, name: name.trim()}).select('*').single();
  if (error || !data) throw new Error('Could not create team');
  return data;
}

async function editableTeam(teamId: string, ownerOnly = false) {
  const context = await requireTeamRole(teamId, ownerOnly ? ['owner'] : ['owner', 'member']);
  await requireWritableAccount(context);
  const db = createAdminClient();
  const {data: team} = await db.from('teams').select('*').eq('id', teamId).maybeSingle();
  if (!team || !hasEntitlement(await resolveOwnerEntitlements(team.owner_id), 'team')) throw new ForbiddenError();
  return {context, team, db};
}

export async function inviteMember(teamId: string, email: string, role: 'member' | 'viewer'): Promise<void> {
  await requireSystemFeature('team_invites');
  const {context, team, db} = await editableTeam(teamId);
  const targetEmail = email.trim().toLowerCase();
  const ownerPlan = await resolveOwnerEntitlements(team.owner_id);
  const {count: seats} = await db.from('team_members').select('user_id', {count: 'exact', head: true}).eq('team_id', teamId);
  const {count: pending} = await db.from('team_invites').select('id', {count: 'exact', head: true}).eq('team_id', teamId).is('accepted_at', null).is('revoked_at', null).gt('expires_at', new Date().toISOString());
  if ((seats ?? 0) + (pending ?? 0) >= (ownerPlan.team_member_limit ?? 0)) throw new ConflictError();
  const {data: profile} = await db.from('profiles').select('id').eq('email', targetEmail).maybeSingle();
  if (profile) {
    const {data: member} = await db.from('team_members').select('user_id').eq('team_id', teamId).eq('user_id', profile.id).maybeSingle();
    if (member) throw new ConflictError();
  }
  const token = secureRandomToken(32);
  const {data: invite, error} = await db.from('team_invites').insert({team_id: teamId, email: targetEmail, role,
    token_hash: sha256Bytea(token), invited_by: context.user.id, expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString()}).select('id').single();
  if (error || !invite) throw new ConflictError();
  const locale = context.profile.locale;
  const url = getSiteUrl(`/${locale}/dashboard/team/invite?token=${token}`).toString();
  const t = await getTranslations({locale, namespace: 'Phase7'});
  const subject = t('teamInviteSubject', {brand: BRAND_NAME});
  const line = t('teamInviteBody', {team: team.name});
  try { await sendEmail({to: targetEmail, locale, subject, preview: line,
    content: createElement('div', null, createElement('p', null, line), createElement('a', {href: url}, url))}); }
  catch (sendError) { await db.from('team_invites').delete().eq('id', invite.id); throw sendError; }
}

export async function previewInvite(token: string) {
  const context = await requireUser();
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new NotFoundError();
  const db = createAdminClient();
  const {data: invite} = await db.from('team_invites').select('id,team_id,email,role,expires_at,accepted_at,revoked_at').eq('token_hash', sha256Bytea(token)).maybeSingle();
  if (!invite || invite.revoked_at || invite.accepted_at || new Date(invite.expires_at).getTime() <= Date.now() || invite.email.toLowerCase() !== context.profile.email.toLowerCase()) throw new NotFoundError();
  const {data: team} = await db.from('teams').select('id,name,owner_id').eq('id', invite.team_id).maybeSingle();
  if (!team || !hasEntitlement(await resolveOwnerEntitlements(team.owner_id), 'team')) throw new NotFoundError();
  return {invite, team};
}

export async function acceptInvite(token: string): Promise<void> {
  const {invite} = await previewInvite(token);
  const context = await requireUser();
  const db = createAdminClient();
  const {data: claimed, error: claimError} = await db.from('team_invites').update({accepted_at: new Date().toISOString()}).eq('id', invite.id)
    .is('accepted_at', null).is('revoked_at', null).gt('expires_at', new Date().toISOString()).select('id').maybeSingle();
  if (claimError || !claimed) throw new ConflictError();
  const {error} = await db.from('team_members').insert({team_id: invite.team_id, user_id: context.user.id, role: invite.role});
  if (error) { await db.from('team_invites').update({accepted_at: null}).eq('id', invite.id); throw new ConflictError(); }
}

export async function revokeInvite(teamId: string, id: string): Promise<void> {
  const {db} = await editableTeam(teamId);
  const {error} = await db.from('team_invites').update({revoked_at: new Date().toISOString()}).eq('id', id).eq('team_id', teamId).is('accepted_at', null);
  if (error) throw new Error('Could not revoke invite');
}

export async function setMemberRole(teamId: string, userId: string, role: 'member' | 'viewer'): Promise<void> {
  const {team, db} = await editableTeam(teamId, true);
  if (userId === team.owner_id) throw new ForbiddenError();
  const {data, error} = await db.from('team_members').update({role}).eq('team_id', teamId).eq('user_id', userId).neq('role', 'owner').select('user_id').maybeSingle();
  if (error || !data) throw new NotFoundError();
}

export async function removeMember(teamId: string, userId: string): Promise<void> {
  const {team, db} = await editableTeam(teamId, true);
  if (userId === team.owner_id) throw new ForbiddenError();
  const {error} = await db.from('team_members').delete().eq('team_id', teamId).eq('user_id', userId).neq('role', 'owner');
  if (error) throw new Error('Could not remove member');
}

export async function createWorkspace(teamId: string, name: string, clientName?: string): Promise<void> {
  const {db} = await editableTeam(teamId);
  const {error} = await db.from('client_workspaces').insert({team_id: teamId, name: name.trim(), client_name: clientName?.trim() || null});
  if (error) throw new Error('Could not create workspace');
}

export async function renameWorkspace(teamId: string, workspaceId: string, name: string, clientName?: string): Promise<void> {
  const {db} = await editableTeam(teamId);
  const {error} = await db.from('client_workspaces').update({name: name.trim(), client_name: clientName?.trim() || null}).eq('id', workspaceId).eq('team_id', teamId);
  if (error) throw new Error('Could not update workspace');
}

export async function setWorkspaceBrand(teamId: string, workspaceId: string, color: string, logo: File | null, removeLogo: boolean): Promise<void> {
  const {team, db} = await editableTeam(teamId);
  if (!hasEntitlement(await resolveOwnerEntitlements(team.owner_id), 'whiteLabelReports') || !/^#[0-9a-fA-F]{6}$/.test(color)) throw new ForbiddenError();
  const {data: workspace} = await db.from('client_workspaces').select('id,logo_path').eq('id', workspaceId).eq('team_id', teamId).maybeSingle();
  if (!workspace) throw new NotFoundError();
  let path = removeLogo ? null : workspace.logo_path;
  if (logo && logo.size > 0) {
    if (logo.size > 5_242_880) throw new ForbiddenError();
    const bytes = Buffer.from(await logo.arrayBuffer());
    const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg = bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!png && !jpeg) throw new ForbiddenError();
    path = `${team.owner_id}/${workspaceId}/${secureRandomToken(16)}.${png ? 'png' : 'jpg'}`;
    const {error: uploadError} = await db.storage.from('white-label-logos').upload(path, bytes, {contentType: png ? 'image/png' : 'image/jpeg', upsert: false});
    if (uploadError) throw new Error('Could not upload logo');
  }
  const {error} = await db.from('client_workspaces').update({brand_color: color, logo_path: path}).eq('id', workspaceId).eq('team_id', teamId);
  if (error) {
    if (path && path !== workspace.logo_path) await db.storage.from('white-label-logos').remove([path]);
    throw new Error('Could not save branding');
  }
  if (workspace.logo_path && workspace.logo_path !== path) await db.storage.from('white-label-logos').remove([workspace.logo_path]);
}

export async function removeWorkspace(teamId: string, workspaceId: string): Promise<void> {
  const {db} = await editableTeam(teamId, true);
  const {data: workspace} = await db.from('client_workspaces').select('logo_path').eq('id', workspaceId).eq('team_id', teamId).maybeSingle();
  const {error} = await db.from('client_workspaces').delete().eq('id', workspaceId).eq('team_id', teamId);
  if (error) throw new Error('Could not remove workspace');
  if (workspace?.logo_path) await db.storage.from('white-label-logos').remove([workspace.logo_path]);
}

export async function assignSiteWorkspace(teamId: string, siteId: string, workspaceId: string | null): Promise<void> {
  const {team, db} = await editableTeam(teamId, true);
  const {data: site} = await db.from('sites').select('id').eq('id', siteId).eq('owner_id', team.owner_id).maybeSingle();
  if (!site) throw new NotFoundError();
  if (workspaceId) {
    const {data: workspace} = await db.from('client_workspaces').select('id').eq('id', workspaceId).eq('team_id', teamId).maybeSingle();
    if (!workspace) throw new NotFoundError();
  }
  const {error} = await db.from('sites').update({team_id: teamId, workspace_id: workspaceId}).eq('id', siteId).eq('owner_id', team.owner_id);
  if (error) throw new Error('Could not assign site');
}
