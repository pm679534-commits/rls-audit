import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import {billingProvider} from './paddle';
import type {BillingSubscription} from './provider';
import {ExternalServiceError} from '@/lib/errors';

export async function syncSubscription(subscriptionId: string, hintedOwnerId?: string | null): Promise<BillingSubscription> {
  const remote = await billingProvider.getSubscription(subscriptionId);
  const db = createAdminClient();
  const {data: existing, error: existingError} = await db.from('subscriptions').select('owner_id').eq('paddle_subscription_id', subscriptionId).maybeSingle();
  if (existingError) throw new ExternalServiceError();
  const ownerId = existing?.owner_id ?? remote.ownerId ?? hintedOwnerId;
  if (!ownerId || (existing && existing.owner_id !== ownerId) || (remote.ownerId && remote.ownerId !== ownerId)) throw new ExternalServiceError();
  const {data: owner, error: ownerError} = await db.from('profiles').select('id').eq('id', ownerId).maybeSingle();
  if (ownerError || !owner) throw new ExternalServiceError();
  const {data: byOwner, error: ownerSubscriptionError} = await db.from('subscriptions').select('paddle_subscription_id,paddle_customer_id,status').eq('owner_id', ownerId).maybeSingle();
  if (ownerSubscriptionError || (byOwner?.paddle_customer_id && byOwner.paddle_customer_id !== remote.customerId)
    || (byOwner?.paddle_subscription_id && byOwner.paddle_subscription_id !== remote.id && byOwner.status !== 'canceled')) throw new ExternalServiceError();
  const {error} = await db.from('subscriptions').upsert({owner_id: ownerId, paddle_subscription_id: remote.id,
    paddle_customer_id: remote.customerId, plan_id: remote.plan, billing_period: remote.period,
    status: remote.status, current_period_start: remote.periodStart, current_period_end: remote.periodEnd,
    cancel_at_period_end: remote.cancelAtPeriodEnd, canceled_at: remote.canceledAt,
    ...(remote.country ? {billing_country: remote.country} : {})}, {onConflict: 'owner_id'});
  if (error) throw new ExternalServiceError();
  return remote;
}

export async function notifyPaymentFailed(ownerId: string, eventId: string): Promise<void> {
  const db = createAdminClient();
  const {error} = await db.from('notifications').insert({user_id: ownerId, type: 'payment_failed',
    title_key: 'Phase6.paymentFailedTitle', body_key: 'Phase6.paymentFailedBody', data: {billingEventId: eventId}});
  if (error && error.code !== '23505') throw new ExternalServiceError();
  // Phase 9's notification worker sends the corresponding localized dunning email.
}
