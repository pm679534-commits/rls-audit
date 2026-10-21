import 'server-only';

import {createAdminClient} from '@/lib/supabase/admin';
import {decryptSecret, signWebhook} from '@/lib/crypto';
import {safeWebhookPost} from '@/lib/ssrf';
import {sendEmail} from '@/lib/email';
import {emailTemplate, type EmailKind} from '@/lib/email/templates';
import {getSiteUrl} from '@/lib/config';
import {unsubscribeUrl} from './unsubscribe';
import {hasEntitlement, resolveOwnerEntitlements} from '@/lib/billing/entitlements';
import {logger} from '@/lib/logger';
import type {Json, Tables} from '@/types/database';

const emailKinds = new Set<EmailKind>(['welcome','trial_reminder','trial_expired','scan_completed','finding_alert','score_regression','verification_failed','payment_failed','subscription_changed']);
const essential = new Set(['payment_failed','subscription_changed']);
const dataObject = (value: Json): Record<string, Json | undefined> => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const stringValue = (value: Json | undefined) => typeof value === 'string' ? value : undefined;
const numberValue = (value: Json | undefined) => typeof value === 'number' ? value : undefined;

function enabled(preferences: Json, key: string): boolean {
  const fields = dataObject(preferences);
  return fields[key] !== false;
}

function emailAllowed(profile: Tables<'profiles'>, type: string): boolean {
  if (essential.has(type)) return true;
  if (profile.email_unsubscribed_at || !enabled(profile.notification_preferences, 'email')) return false;
  if (type === 'scan_completed') return enabled(profile.notification_preferences, 'scanCompleted');
  if (['finding_alert','score_regression','verification_failed'].includes(type)) return enabled(profile.notification_preferences, 'findingAlerts');
  if (['trial_reminder','trial_expired'].includes(type)) return enabled(profile.notification_preferences, 'trialReminders');
  return true;
}

async function deliver(job: Tables<'notification_deliveries'>): Promise<'delivered' | 'canceled'> {
  const db = createAdminClient();
  const {data: notification} = await db.from('notifications').select('*').eq('id', job.notification_id).maybeSingle();
  if (!notification) return 'canceled';
  const {data: profile} = await db.from('profiles').select('*').eq('id', notification.user_id).maybeSingle();
  if (!profile || profile.suspended) return 'canceled';
  const details = dataObject(notification.data);
  const locale = profile.locale === 'az' ? 'az' : 'en';
  if (job.destination === 'email') {
    if (!emailKinds.has(notification.type as EmailKind) || !emailAllowed(profile, notification.type)) return 'canceled';
    const path = notification.type === 'payment_failed' || notification.type === 'subscription_changed' || notification.type.startsWith('trial_') ? '/dashboard/billing' :
      notification.site_id ? `/dashboard/sites/${notification.site_id}` : '/onboarding';
    const {data: site} = notification.site_id ? await db.from('sites').select('name').eq('id', notification.site_id).maybeSingle() : {data: null};
    const template = emailTemplate(notification.type as EmailKind, locale, {url: getSiteUrl(`/${locale}${path}`).toString(), site: site?.name,
      score: numberValue(details.score), previousScore: numberValue(details.previousScore), severity: stringValue(details.severity), days: numberValue(details.days)});
    await sendEmail({to: profile.email, locale, ...template, idempotencyKey: notification.id,
      ...(!essential.has(notification.type) ? {unsubscribeUrl: unsubscribeUrl(profile.id, new Date(notification.created_at), locale)} : {})});
    await db.from('notifications').update({email_sent_at: new Date().toISOString()}).eq('id', notification.id);
    return 'delivered';
  }
  if (!job.channel_id || !['finding_alert','score_regression','verification_failed'].includes(notification.type) ||
      !enabled(profile.notification_preferences, 'findingAlerts')) return 'canceled';
  const entitlements = await resolveOwnerEntitlements(profile.id);
  const feature = job.destination === 'slack' ? 'slackAlerts' : job.destination === 'discord' ? 'discordAlerts' : 'webhookAlerts';
  if (!hasEntitlement(entitlements, feature)) return 'canceled';
  const {data: channel} = await db.from('notification_channels').select('*').eq('id', job.channel_id).eq('owner_id', profile.id).eq('enabled', true).maybeSingle();
  if (!channel || channel.type !== job.destination || (channel.site_id && channel.site_id !== notification.site_id)) return 'canceled';
  const ids = [channel.url_secret_id, channel.signing_secret_id].filter((value): value is string => !!value);
  const {data: secrets, error} = await db.from('encrypted_secrets').select('*').in('id', ids).eq('owner_id', profile.id);
  if (error) throw error;
  const urlSecret = secrets?.find((item) => item.id === channel.url_secret_id);
  if (!urlSecret) throw new Error('Channel URL unavailable');
  const endpoint = decryptSecret(urlSecret, `channel:${profile.id}:${channel.id}:url`);
  const event = {id: notification.id, type: notification.type, siteId: notification.site_id, createdAt: notification.created_at,
    score: numberValue(details.score), severity: stringValue(details.severity), findingKey: stringValue(details.findingKey)};
  const {data: site} = notification.site_id ? await db.from('sites').select('name').eq('id', notification.site_id).maybeSingle() : {data: null};
  const text = `${notification.type.replace(/_/g, ' ')}${site ? ` · ${site.name}` : ''}${event.severity ? ` · ${event.severity}` : ''}`;
  const body = JSON.stringify(job.destination === 'slack' ? {text} : job.destination === 'discord' ? {content: text} : event);
  const headers: Record<string, string> = {'X-SiteGuard-Event-Id': notification.id};
  if (job.destination === 'webhook') {
    const secretRow = secrets?.find((item) => item.id === channel.signing_secret_id);
    if (!secretRow) throw new Error('Webhook signing secret unavailable');
    const timestamp = Math.floor(Date.now() / 1000);
    const secret = decryptSecret(secretRow, `channel:${profile.id}:${channel.id}:signing`);
    headers['X-SiteGuard-Timestamp'] = String(timestamp);
    headers['X-SiteGuard-Signature'] = `sha256=${signWebhook(body, secret, timestamp)}`;
  }
  const response = await safeWebhookPost(endpoint, body, headers);
  if (response.status < 200 || response.status >= 300) throw new Error(`Delivery HTTP ${response.status}`);
  await db.from('notification_channels').update({last_delivered_at: new Date().toISOString(), last_error_code: null}).eq('id', channel.id);
  return 'delivered';
}

export async function dispatchNotifications(limit = 20): Promise<{claimed: number; delivered: number; retried: number}> {
  const db = createAdminClient();
  const {data: jobs, error} = await db.rpc('claim_notification_deliveries', {p_limit: limit});
  if (error || !jobs) throw new Error('Could not claim notifications');
  let delivered = 0;
  let retried = 0;
  for (const job of jobs) {
    try {
      const outcome = await deliver(job);
      const {error: updateError} = await db.from('notification_deliveries').update({status: outcome === 'delivered' ? 'succeeded' : 'canceled',
        delivered_at: outcome === 'delivered' ? new Date().toISOString() : null, locked_at: null}).eq('id', job.id).eq('status', 'running');
      if (updateError) throw updateError;
      if (outcome === 'delivered') delivered++;
    } catch (failure) {
      logger.warn('notification_delivery_failed', {attempts: job.attempts});
      const status = job.attempts >= 5 ? 'dead' : 'queued';
      const delay = Math.min(3600, 30 * 2 ** Math.min(job.attempts, 6));
      await db.from('notification_deliveries').update({status, locked_at: null,
        available_at: new Date(Date.now() + delay * 1000).toISOString(), last_error_code: failure instanceof Error && /Delivery HTTP 4\d\d/.test(failure.message) ? 'remote_rejected' : 'delivery_failed'})
        .eq('id', job.id).eq('status', 'running');
      if (job.channel_id) await db.from('notification_channels').update({last_error_code: 'delivery_failed'}).eq('id', job.channel_id);
      retried++;
    }
  }
  return {claimed: jobs.length, delivered, retried};
}
