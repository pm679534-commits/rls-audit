'use server';

import {z} from 'zod';
import {createServerAction} from '@/lib/actions';
import {acceptInvite, assignSiteWorkspace, createTeam, createWorkspace, inviteMember, removeMember, removeWorkspace, renameWorkspace, revokeInvite, setMemberRole, setWorkspaceBrand} from './index';

const teamId = z.string().uuid();
const workspaceId = z.string().uuid();
const name = z.string().trim().min(1).max(120);

export async function createTeamAction(raw: unknown) {
  return createServerAction(z.object({name}), async (input) => ({team: await createTeam(input.name)}))(raw);
}
export async function inviteMemberAction(raw: unknown) {
  return createServerAction(z.object({teamId, email: z.string().email().max(254), role: z.enum(['member','viewer'])}), async (input) => {
    await inviteMember(input.teamId, input.email, input.role); return {sent: true};
  }, {rateLimit: {name: 'team-invite', limit: 10, windowSeconds: 3600}})(raw);
}
export async function acceptInviteAction(raw: unknown) {
  return createServerAction(z.object({token: z.string().regex(/^[A-Za-z0-9_-]{43}$/)}), async (input) => {
    await acceptInvite(input.token); return {joined: true};
  })(raw);
}
export async function revokeInviteAction(raw: unknown) {
  return createServerAction(z.object({teamId, id: z.string().uuid()}), async (input) => {
    await revokeInvite(input.teamId, input.id); return {revoked: true};
  })(raw);
}
export async function setMemberRoleAction(raw: unknown) {
  return createServerAction(z.object({teamId, userId: z.string().uuid(), role: z.enum(['member','viewer'])}), async (input) => {
    await setMemberRole(input.teamId, input.userId, input.role); return {updated: true};
  })(raw);
}
export async function removeMemberAction(raw: unknown) {
  return createServerAction(z.object({teamId, userId: z.string().uuid()}), async (input) => {
    await removeMember(input.teamId, input.userId); return {removed: true};
  })(raw);
}
export async function createWorkspaceAction(raw: unknown) {
  return createServerAction(z.object({teamId, name, clientName: z.string().trim().max(120).optional()}), async (input) => {
    await createWorkspace(input.teamId, input.name, input.clientName); return {created: true};
  })(raw);
}
export async function renameWorkspaceAction(raw: unknown) {
  return createServerAction(z.object({teamId, workspaceId, name, clientName: z.string().trim().max(120).optional()}), async (input) => {
    await renameWorkspace(input.teamId, input.workspaceId, input.name, input.clientName); return {updated: true};
  })(raw);
}
export async function setWorkspaceBrandAction(raw: unknown) {
  return createServerAction(z.object({teamId, workspaceId, color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    logo: z.custom<File | null>((value) => value === null || value instanceof File), removeLogo: z.boolean()}), async (input) => {
    await setWorkspaceBrand(input.teamId, input.workspaceId, input.color, input.logo, input.removeLogo); return {updated: true};
  }, {rateLimit: {name: 'workspace-brand', limit: 20, windowSeconds: 3600}})(raw);
}
export async function removeWorkspaceAction(raw: unknown) {
  return createServerAction(z.object({teamId, workspaceId}), async (input) => {
    await removeWorkspace(input.teamId, input.workspaceId); return {removed: true};
  })(raw);
}
export async function assignSiteWorkspaceAction(raw: unknown) {
  return createServerAction(z.object({teamId, siteId: z.string().uuid(), workspaceId: workspaceId.nullable()}), async (input) => {
    await assignSiteWorkspace(input.teamId, input.siteId, input.workspaceId); return {updated: true};
  })(raw);
}
