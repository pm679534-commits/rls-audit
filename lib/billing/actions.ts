'use server';

import {z} from 'zod';
import {createServerAction} from '@/lib/actions';
import {resolveEntitlements} from './entitlements';
import {billingProvider} from './paddle';
import {syncSubscription} from './sync';
import {ConflictError, ForbiddenError} from '@/lib/errors';
import type {UserContext} from '@/lib/auth';

const choice = z.object({plan: z.enum(['starter', 'pro', 'agency']), period: z.enum(['monthly', 'annual'])});
async function ownedSubscription(context: UserContext) {
  const {subscription} = await resolveEntitlements(context);
  if (!subscription?.paddle_subscription_id || !subscription.paddle_customer_id) throw new ForbiddenError();
  return subscription;
}

export const startCheckout = createServerAction(choice, async (input, possibleContext) => {
  const context = possibleContext!;
  const {subscription} = await resolveEntitlements(context);
  if (subscription && ['active', 'past_due', 'paused', 'trialing'].includes(subscription.status)) throw new ConflictError();
  return {url: await billingProvider.createCheckout({ownerId: context.user.id, email: context.user.email ?? context.profile.email,
    plan: input.plan, period: input.period, customerId: subscription?.paddle_customer_id ?? undefined})};
}, {rateLimit: {name: 'billing_checkout', limit: 5, windowSeconds: 3600}});

export const changeBillingPlan = createServerAction(choice, async (input, possibleContext) => {
  const context = possibleContext!;
  const subscription = await ownedSubscription(context);
  if (!['active', 'trialing'].includes(subscription.status) || subscription.cancel_at_period_end) throw new ConflictError();
  if (subscription.plan_id === input.plan && subscription.billing_period === input.period) throw new ConflictError();
  await billingProvider.changePlan(subscription.paddle_subscription_id!, input.plan, input.period);
  await syncSubscription(subscription.paddle_subscription_id!, context.user.id);
  return {updated: true};
}, {rateLimit: {name: 'billing_change', limit: 6, windowSeconds: 3600}});

export const cancelBilling = createServerAction(z.object({}), async (_input, possibleContext) => {
  const context = possibleContext!;
  const subscription = await ownedSubscription(context);
  if (subscription.status !== 'active' || subscription.cancel_at_period_end) throw new ConflictError();
  await billingProvider.cancelAtPeriodEnd(subscription.paddle_subscription_id!);
  await syncSubscription(subscription.paddle_subscription_id!, context.user.id);
  return {updated: true};
}, {rateLimit: {name: 'billing_cancel', limit: 4, windowSeconds: 3600}});

export const resumeBilling = createServerAction(z.object({}), async (_input, possibleContext) => {
  const context = possibleContext!;
  const subscription = await ownedSubscription(context);
  if (!subscription.cancel_at_period_end && subscription.status !== 'paused') throw new ConflictError();
  await billingProvider.resume(subscription.paddle_subscription_id!);
  await syncSubscription(subscription.paddle_subscription_id!, context.user.id);
  return {updated: true};
}, {rateLimit: {name: 'billing_resume', limit: 4, windowSeconds: 3600}});

export const openBillingPortal = createServerAction(z.object({}), async (_input, possibleContext) => {
  const subscription = await ownedSubscription(possibleContext!);
  return {url: await billingProvider.createPortalSession(subscription.paddle_customer_id!, subscription.paddle_subscription_id!)};
}, {rateLimit: {name: 'billing_portal', limit: 10, windowSeconds: 3600}});
