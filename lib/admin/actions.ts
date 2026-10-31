'use server';

import {headers} from 'next/headers';
import {randomUUID} from 'node:crypto';
import {isIP} from 'node:net';
import {z} from 'zod';
import {createServerAction} from '@/lib/actions';
import {requireAdmin, type UserContext} from '@/lib/auth';
import {createAdminClient} from '@/lib/supabase/admin';
import {ConflictError, NotFoundError, ValidationError} from '@/lib/errors';
import {removeStoredFiles} from '@/lib/account';
import {paddleClient} from '@/lib/billing/paddle';
import {syncSubscription, notifyPaymentFailed} from '@/lib/billing/sync';
import {trustedClientIp} from '@/lib/rate-limit';
import {revalidatePath} from 'next/cache';
import type {Json} from '@/types/database';

const id = z.string().uuid();
const text = z.string().trim().min(1).max(10000);
const url = z.union([z.literal(''), z.string().url().refine((value) => new URL(value).protocol === 'https:')]);
const reason = z.string().trim().min(5).max(500);
const inputSchema = z.discriminatedUnion('kind', [
  z.object({kind: z.literal('trial'), id, mode: z.enum(['extend','end']), days: z.coerce.number().int().min(1).max(365).optional(), reason}),
  z.object({kind: z.literal('plan'), id, plan: z.enum(['none','starter','pro','agency']), expiresAt: z.union([z.literal(''), z.string().datetime({offset: true})]).default(''), reason}),
  z.object({kind: z.literal('suspend'), id, suspended: z.boolean(), reason}),
  z.object({kind: z.literal('verify_email'), id, reason}),
  z.object({kind: z.literal('delete_user'), id, confirmation: z.literal('DELETE'), reason}),
  z.object({kind: z.literal('replay_event'), id}),
  z.object({kind: z.literal('requeue_scan'), id}),
  z.object({kind: z.literal('cancel_scan'), id}),
  z.object({kind: z.literal('blocked_create'), pattern: z.string().trim().min(1).max(253), ruleKind: z.enum(['exact','suffix','tld','cidr']), reason: z.string().trim().min(3).max(300)}),
  z.object({kind: z.literal('blocked_edit'), id, pattern: z.string().trim().min(1).max(253), ruleKind: z.enum(['exact','suffix','tld','cidr']), reason: z.string().trim().min(3).max(300)}),
  z.object({kind: z.literal('blocked_update'), id, active: z.boolean()}),
  z.object({kind: z.literal('blocked_delete'), id, confirmation: z.literal('DELETE')}),
  z.object({kind: z.literal('inbox_update'), inbox: z.enum(['abuse_reports','contact_messages']), id, status: z.enum(['new','in_progress','resolved','spam']), notes: z.string().max(5000)}),
  z.object({kind: z.literal('announcement_save'), id: id.optional(), title_en: text.max(200), title_az: text.max(200), body_en: text, body_az: text, link_url: url, starts_at: z.string().datetime({offset: true}), ends_at: z.union([z.literal(''), z.string().datetime({offset: true})]), published: z.boolean()}),
  z.object({kind: z.literal('announcement_delete'), id, confirmation: z.literal('DELETE')}),
  z.object({kind: z.literal('changelog_save'), id: id.optional(), slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(120), title_en: text.max(200), title_az: text.max(200), body_en: text, body_az: text, published: z.boolean()}),
  z.object({kind: z.literal('changelog_delete'), id, confirmation: z.literal('DELETE')}),
  z.object({kind: z.literal('flag'), key: z.string().regex(/^[a-z][a-z0-9_]*$/), enabled: z.boolean()}),
  z.object({kind: z.literal('maintenance'), enabled: z.boolean()}),
  z.object({kind: z.literal('setting'), key: z.enum(['global_scan_concurrency','per_user_scan_concurrency','verification_recheck_days','public_check_rate_per_hour']), value: z.coerce.number().int().min(1).max(1000)})
]);
type Input = z.infer<typeof inputSchema>;

async function audit(context: UserContext, input: Input, targetTable: string, targetId: string | null, details: Record<string, Json>, operation: () => Promise<void>) {
  const requestHeaders = await headers();
  const ip = trustedClientIp(requestHeaders);
  const db = createAdminClient();
  const {data: entry, error} = await db.from('admin_audit_log').insert({actor_id: context.user.id, action: input.kind,
    target_table: targetTable, target_id: targetId, details: {...details, outcome: 'started'}, ip_address: ip === 'unknown' ? null : ip}).select('id').single();
  if (error || !entry) throw new Error('Could not write audit log');
  try {
    await operation();
    const {error: updateError} = await db.from('admin_audit_log').update({details: {...details, outcome: 'completed'}}).eq('id', entry.id);
    if (updateError) throw new Error('Could not finalize audit log');
  } catch (cause) {
    await db.from('admin_audit_log').update({details: {...details, outcome: 'failed', errorClass: cause instanceof Error ? cause.name : 'unknown'}}).eq('id', entry.id);
    throw cause;
  }
}

async function replayEvent(eventId: string) {
  const db = createAdminClient();
  const {data: event, error} = await db.from('billing_events').select('*').eq('id', eventId).maybeSingle();
  if (error || !event) throw new NotFoundError();
  const supported = ['subscription.created','subscription.updated','subscription.canceled','subscription.past_due','subscription.paused','subscription.resumed',
    'transaction.completed','transaction.payment_failed','transaction.past_due'];
  if (!supported.includes(event.event_type)) throw new ValidationError();
  if (event.processing_started_at && !event.processed_at && Date.now() - new Date(event.processing_started_at).getTime() < 120_000) throw new ConflictError();
  const resourceId = event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload) ? event.payload.resourceId : null;
  if (typeof resourceId !== 'string' || !resourceId) throw new ValidationError();
  let subscriptionId: string | null = event.event_type.startsWith('subscription.') ? resourceId : null;
  if (event.event_type.startsWith('transaction.')) {
    const transaction = await paddleClient().transactions.get(resourceId);
    subscriptionId = transaction.subscriptionId ?? null;
  }
  const remote = subscriptionId ? await syncSubscription(subscriptionId, event.owner_id) : null;
  const ownerId = remote ? (await db.from('subscriptions').select('owner_id').eq('paddle_subscription_id', remote.id).single()).data?.owner_id : event.owner_id;
  if ((event.event_type === 'transaction.payment_failed' || event.event_type === 'transaction.past_due') && !ownerId) throw new ValidationError();
  if (ownerId && (event.event_type === 'transaction.payment_failed' || event.event_type === 'transaction.past_due')) await notifyPaymentFailed(ownerId, event.provider_event_id);
  const {error: updateError} = await db.from('billing_events').update({owner_id: ownerId ?? null, processed_at: new Date().toISOString(), processing_started_at: null, processing_error: null}).eq('id', event.id);
  if (updateError) throw new Error('Could not mark event replayed');
}

function normalizeRule(kind: 'exact' | 'suffix' | 'tld' | 'cidr', pattern: string) {
  const value = pattern.toLowerCase().replace(/\.$/, '');
  if (kind === 'cidr') {
    const [address, prefix, extra] = value.split('/');
    const version = isIP(address);
    if (extra || !version || !/^(0|[1-9]\d{0,2})$/.test(prefix ?? '') || Number(prefix) > (version === 4 ? 32 : 128)) throw new ValidationError();
  } else if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(value) || value.split('.').some((label) => label.length > 63 || label.startsWith('-') || label.endsWith('-')) || (kind === 'tld' && value.includes('.'))) throw new ValidationError();
  return value;
}

async function mutate(input: Input, context: UserContext) {
  const db = createAdminClient();
  const createdId = ['blocked_create','announcement_save','changelog_save'].includes(input.kind) && (!('id' in input) || !input.id) ? randomUUID() : null;
  const target = 'id' in input ? input.id ?? createdId : 'key' in input ? input.key : input.kind === 'maintenance' ? 'maintenance_mode' : createdId;
  const table = input.kind === 'trial' || input.kind === 'plan' || input.kind === 'suspend' || input.kind === 'verify_email' || input.kind === 'delete_user' ? 'profiles'
    : input.kind === 'replay_event' ? 'billing_events' : input.kind === 'requeue_scan' || input.kind === 'cancel_scan' ? 'scans'
    : input.kind.startsWith('blocked_') ? 'blocked_domains' : input.kind === 'inbox_update' ? input.inbox
    : input.kind.startsWith('announcement_') ? 'announcements' : input.kind.startsWith('changelog_') ? 'changelog_entries'
    : input.kind === 'flag' ? 'feature_flags' : 'app_settings';
  const details: Record<string, Json> = {};
  if (input.kind === 'trial') {details.mode = input.mode; details.days = input.days ?? null;}
  if (input.kind === 'plan') details.plan = input.plan;
  if (input.kind === 'suspend') details.suspended = input.suspended;
  if (input.kind === 'flag' || input.kind === 'maintenance') details.enabled = input.enabled;
  if (input.kind === 'setting') details.value = input.value;
  if (input.kind === 'inbox_update') details.status = input.status;
  if (['trial','plan','suspend','verify_email','delete_user'].includes(input.kind) && 'id' in input && typeof input.id === 'string') {
    const {data: prior, error: priorError} = await db.from('profiles').select('*').eq('id', input.id).maybeSingle();
    if (priorError || !prior) throw new NotFoundError();
    if ((input.kind === 'suspend' || input.kind === 'delete_user') && prior.role === 'admin') throw new ConflictError();
    details.reason = 'reason' in input ? input.reason : null;
    details.before = {trialEndsAt: prior.trial_ends_at, planOverride: prior.plan_override, expiresAt: prior.plan_override_expires_at, suspended: prior.suspended};
    if (input.kind === 'verify_email') {
      const {data: authUser, error: authError} = await db.auth.admin.getUserById(input.id);
      if (authError || !authUser.user) throw new NotFoundError();
      details.before = {...details.before as object, emailVerified: !!authUser.user.email_confirmed_at};
    }
    details.after = input.kind === 'plan' ? {...details.before as object, planOverride: input.plan === 'none' ? null : input.plan, expiresAt: input.expiresAt || null}
      : input.kind === 'trial' ? {...details.before as object, trialEndsAt: new Date(input.mode === 'end' ? Date.now() : Math.max(Date.now(), Date.parse(prior.trial_ends_at)) + (input.days ?? 3) * 86_400_000).toISOString()}
      : input.kind === 'suspend' ? {...details.before as object, suspended: input.suspended}
      : input.kind === 'delete_user' ? {...details.before as object, deleted: true} : {...details.before as object, emailVerified: true};
  }
  await audit(context, input, table, target, details, async () => {
    if (input.kind === 'trial') {
      const {data: profile} = await db.from('profiles').select('trial_ends_at').eq('id', input.id).maybeSingle();
      if (!profile) throw new NotFoundError();
      const end = input.mode === 'end' ? new Date() : new Date(Math.max(Date.now(), new Date(profile.trial_ends_at).getTime()) + (input.days ?? 3) * 86_400_000);
      const {data,error} = await db.from('profiles').update({trial_ends_at: end.toISOString()}).eq('id', input.id).select('id').maybeSingle(); if (error || !data) throw new NotFoundError();
    } else if (input.kind === 'plan') {
      if (input.plan !== 'none' && input.expiresAt && Date.parse(input.expiresAt) <= Date.now()) throw new ValidationError();
      const record = {plan_override: input.plan === 'none' ? null : input.plan,
        plan_override_expires_at: input.plan === 'none' ? null : input.expiresAt || null};
      let result = await db.from('profiles').update(record).eq('id', input.id).select('id').maybeSingle();
      if (result.error && !input.expiresAt && ['42703','PGRST204'].includes(result.error.code)) {
        result = await db.from('profiles').update({plan_override: record.plan_override}).eq('id', input.id).select('id').maybeSingle();
      }
      if (result.error || !result.data) throw new NotFoundError();
    } else if (input.kind === 'suspend') {
      if (input.id === context.user.id && input.suspended) throw new ConflictError();
      const {data,error} = await db.from('profiles').update({suspended: input.suspended}).eq('id', input.id).select('id').maybeSingle(); if (error || !data) throw new NotFoundError();
    } else if (input.kind === 'verify_email') {
      const {error} = await db.auth.admin.updateUserById(input.id, {email_confirm: true}); if (error) throw error;
    } else if (input.kind === 'delete_user') {
      if (input.id === context.user.id) throw new ConflictError();
      const {data: targetUser, error: userError} = await db.from('profiles').select('id').eq('id', input.id).maybeSingle();
      if (userError || !targetUser) throw new NotFoundError();
      const {data: sub, error: subError} = await db.from('subscriptions').select('paddle_subscription_id,status').eq('owner_id', input.id).maybeSingle();
      if (subError) throw subError;
      if (sub?.paddle_subscription_id && sub.status !== 'canceled') await paddleClient().subscriptions.cancel(sub.paddle_subscription_id, {effectiveFrom: 'immediately'});
      await removeStoredFiles(input.id);
      const {error} = await db.auth.admin.deleteUser(input.id); if (error) throw error;
    } else if (input.kind === 'replay_event') await replayEvent(input.id);
    else if (input.kind === 'requeue_scan' || input.kind === 'cancel_scan') {
      const {error} = await db.rpc(input.kind === 'requeue_scan' ? 'admin_requeue_scan' : 'admin_cancel_scan', {p_scan: input.id}); if (error) throw error;
    } else if (input.kind === 'blocked_create') {
      const {error} = await db.from('blocked_domains').insert({id: createdId!, kind: input.ruleKind, pattern: normalizeRule(input.ruleKind, input.pattern), reason: input.reason, created_by: context.user.id}); if (error) throw error;
    } else if (input.kind === 'blocked_edit') {
      const {data,error} = await db.from('blocked_domains').update({kind: input.ruleKind, pattern: normalizeRule(input.ruleKind, input.pattern), reason: input.reason}).eq('id', input.id).select('id').maybeSingle();
      if (error || !data) throw new NotFoundError();
    } else if (input.kind === 'blocked_update') {
      const {data,error} = await db.from('blocked_domains').update({active: input.active}).eq('id', input.id).select('id').maybeSingle(); if (error || !data) throw new NotFoundError();
    } else if (input.kind === 'blocked_delete') {
      const {data,error} = await db.from('blocked_domains').delete().eq('id', input.id).select('id').maybeSingle(); if (error || !data) throw new NotFoundError();
    } else if (input.kind === 'inbox_update') {
      const updates = {status: input.status, admin_notes: input.notes.trim() || null};
      const {data,error} = input.inbox === 'abuse_reports' ? await db.from('abuse_reports').update(updates).eq('id', input.id).select('id').maybeSingle()
        : await db.from('contact_messages').update(updates).eq('id', input.id).select('id').maybeSingle();
      if (error || !data) throw new NotFoundError();
    } else if (input.kind === 'announcement_save') {
      if (input.ends_at && input.ends_at <= input.starts_at) throw new ValidationError();
      const record = {title_en: input.title_en, title_az: input.title_az, body_en: input.body_en, body_az: input.body_az,
        link_url: input.link_url || null, starts_at: input.starts_at, ends_at: input.ends_at || null, published: input.published};
      const {data,error} = input.id ? await db.from('announcements').update(record).eq('id', input.id).select('id').maybeSingle()
        : await db.from('announcements').insert({...record, id: createdId!, created_by: context.user.id}).select('id').maybeSingle(); if (error || !data) throw new NotFoundError();
    } else if (input.kind === 'announcement_delete') {
      const {data,error} = await db.from('announcements').delete().eq('id', input.id).select('id').maybeSingle(); if (error || !data) throw new NotFoundError();
    } else if (input.kind === 'changelog_save') {
      const {data: existing} = input.id ? await db.from('changelog_entries').select('published_at').eq('id', input.id).maybeSingle() : {data: null};
      const record = {slug: input.slug, title_en: input.title_en, title_az: input.title_az, body_en: input.body_en, body_az: input.body_az,
        published_at: input.published ? existing?.published_at ?? new Date().toISOString() : null};
      const {data,error} = input.id ? await db.from('changelog_entries').update(record).eq('id', input.id).select('id').maybeSingle()
        : await db.from('changelog_entries').insert({...record, id: createdId!, created_by: context.user.id}).select('id').maybeSingle(); if (error || !data) throw new NotFoundError();
    } else if (input.kind === 'changelog_delete') {
      const {data,error} = await db.from('changelog_entries').delete().eq('id', input.id).select('id').maybeSingle(); if (error || !data) throw new NotFoundError();
    } else if (input.kind === 'flag') {
      const {data,error} = await db.from('feature_flags').update({enabled: input.enabled, updated_by: context.user.id}).eq('key', input.key).select('key').maybeSingle();
      if (error || !data) throw new NotFoundError();
    } else if (input.kind === 'maintenance') {
      const {data,error} = await db.from('app_settings').update({value: input.enabled, updated_by: context.user.id}).eq('key', 'maintenance_mode').select('key').maybeSingle(); if (error || !data) throw new NotFoundError();
    } else if (input.kind === 'setting') {
      const max = {global_scan_concurrency: 50, per_user_scan_concurrency: 10, verification_recheck_days: 365, public_check_rate_per_hour: 1000}[input.key];
      if (input.value > max) throw new ValidationError();
      const {data,error} = await db.from('app_settings').update({value: input.value, updated_by: context.user.id}).eq('key', input.key).select('key').maybeSingle(); if (error || !data) throw new NotFoundError();
    }
  });
  if ('id' in input && ['trial','plan','suspend','verify_email','delete_user'].includes(input.kind)) {
    revalidatePath('/[locale]/dashboard', 'page');
    revalidatePath('/[locale]/dashboard/billing', 'page');
    revalidatePath('/[locale]/admin/users', 'page');
    revalidatePath('/[locale]/admin/users/[userId]', 'page');
  }
  return {saved: true};
}

export async function adminMutate(raw: unknown) {
  return createServerAction(inputSchema, async (input) => mutate(input, await requireAdmin()),
    {access: 'admin', rateLimit: {name: 'admin-mutation', limit: 100, windowSeconds: 3600}})(raw);
}
