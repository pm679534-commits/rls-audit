import 'server-only';

import {randomUUID} from 'node:crypto';
import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {requireUser, requireWritableAccount} from '@/lib/auth';
import {requireAlerts} from '@/lib/billing/entitlements';
import {encryptSecret, secureRandomToken} from '@/lib/crypto';
import {ForbiddenError, NotFoundError, ValidationError} from '@/lib/errors';
import type {Tables} from '@/types/database';

type Channel = Tables<'notification_channels'>['type'];

function validateChannelUrl(type: Channel, raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw new ValidationError(); }
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password || url.hash || raw.length > 2048) throw new ValidationError();
  if (type === 'slack' && (url.hostname !== 'hooks.slack.com' || !url.pathname.startsWith('/services/'))) throw new ValidationError();
  if (type === 'discord' && (!['discord.com', 'discordapp.com'].includes(url.hostname) || !url.pathname.startsWith('/api/webhooks/'))) throw new ValidationError();
  if (type === 'webhook' && (url.hostname === 'localhost' || url.hostname.endsWith('.local') || !url.hostname.includes('.'))) throw new ValidationError();
  return url.toString();
}

export async function listNotifications() {
  const context = await requireUser();
  const db = await createClient();
  const [{data: notifications, error}, {count, error: countError}, {data: channels, error: channelsError}] = await Promise.all([
    db.from('notifications').select('*').eq('user_id', context.user.id).order('created_at', {ascending: false}).limit(100),
    db.from('notifications').select('id', {count: 'exact', head: true}).eq('user_id', context.user.id).is('read_at', null),
    db.from('notification_channels').select('id,name,type,site_id,enabled,last_delivered_at,last_error_code,created_at').eq('owner_id', context.user.id).order('created_at', {ascending: false})
  ]);
  if (error || countError || channelsError) throw new Error('Could not load notifications');
  return {notifications: notifications ?? [], unread: count ?? 0, channels: channels ?? []};
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  const context = await requireUser();
  if (!ids.length) return;
  const {error} = await createAdminClient().from('notifications').update({read_at: new Date().toISOString()}).eq('user_id', context.user.id).in('id', ids).is('read_at', null);
  if (error) throw new Error('Could not mark notifications read');
}

export async function markAllNotificationsRead(): Promise<void> {
  const context = await requireUser();
  const {error} = await createAdminClient().from('notifications').update({read_at: new Date().toISOString()}).eq('user_id', context.user.id).is('read_at', null);
  if (error) throw new Error('Could not mark notifications read');
}

export async function addNotificationChannel(input: {name: string; type: Channel; url: string; siteId?: string}): Promise<{id: string; signingSecret?: string}> {
  const context = await requireUser();
  await requireWritableAccount(context);
  await requireAlerts(context, input.type);
  const endpoint = validateChannelUrl(input.type, input.url);
  const db = createAdminClient();
  if (input.siteId) {
    const {data: site} = await db.from('sites').select('id').eq('id', input.siteId).eq('owner_id', context.user.id).maybeSingle();
    if (!site) throw new ForbiddenError();
  }
  const {count} = await db.from('notification_channels').select('id', {count: 'exact', head: true}).eq('owner_id', context.user.id);
  if ((count ?? 0) >= 20) throw new ForbiddenError();
  const channelId = randomUUID();
  const urlId = randomUUID();
  const signingId = input.type === 'webhook' ? randomUUID() : null;
  const signingSecret = signingId ? secureRandomToken(32) : undefined;
  const secrets = [{id: urlId, owner_id: context.user.id, site_id: input.siteId ?? null, kind: 'notification_url',
    ...encryptSecret(endpoint, `channel:${context.user.id}:${channelId}:url`)}];
  if (signingId && signingSecret) secrets.push({id: signingId, owner_id: context.user.id, site_id: input.siteId ?? null,
    kind: 'notification_signing_secret', ...encryptSecret(signingSecret, `channel:${context.user.id}:${channelId}:signing`)});
  const {error: secretError} = await db.from('encrypted_secrets').insert(secrets);
  if (secretError) throw new Error('Could not save channel secrets');
  const {error} = await db.from('notification_channels').insert({id: channelId, owner_id: context.user.id, site_id: input.siteId ?? null,
    type: input.type, name: input.name.trim(), url_secret_id: urlId, signing_secret_id: signingId});
  if (error) { await db.from('encrypted_secrets').delete().in('id', secrets.map((secret) => secret.id)); throw new Error('Could not create channel'); }
  return {id: channelId, ...(signingSecret ? {signingSecret} : {})};
}

export async function setNotificationChannelEnabled(id: string, enabled: boolean): Promise<void> {
  const context = await requireUser();
  await requireWritableAccount(context);
  const db = createAdminClient();
  const {data: channel} = await db.from('notification_channels').select('type').eq('id', id).eq('owner_id', context.user.id).maybeSingle();
  if (!channel) throw new NotFoundError();
  if (enabled) await requireAlerts(context, channel.type);
  const {error} = await db.from('notification_channels').update({enabled}).eq('id', id).eq('owner_id', context.user.id);
  if (error) throw new Error('Could not update channel');
}

export async function removeNotificationChannel(id: string): Promise<void> {
  const context = await requireUser();
  await requireWritableAccount(context);
  const db = createAdminClient();
  const {data: channel} = await db.from('notification_channels').select('url_secret_id,signing_secret_id').eq('id', id).eq('owner_id', context.user.id).maybeSingle();
  if (!channel) throw new NotFoundError();
  const {error} = await db.from('notification_channels').delete().eq('id', id).eq('owner_id', context.user.id);
  if (error) throw new Error('Could not remove channel');
  await db.from('encrypted_secrets').delete().eq('owner_id', context.user.id).in('id', [channel.url_secret_id, channel.signing_secret_id].filter((value): value is string => !!value));
}
