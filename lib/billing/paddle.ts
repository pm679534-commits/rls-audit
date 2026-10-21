import 'server-only';
import {Environment, Paddle} from '@paddle/paddle-node-sdk';
import {getServerEnv} from '@/lib/env';
import {ExternalServiceError} from '@/lib/errors';
import type {BillingPeriod, PlanId} from '@/lib/plans';
import type {BillingProvider, BillingSubscription, BillingInvoice} from './provider';

let sdk: Paddle | undefined;
export function paddleClient(): Paddle {
  const env = getServerEnv();
  return sdk ??= new Paddle(env.PADDLE_API_KEY, {environment: env.PADDLE_ENVIRONMENT === 'sandbox' ? Environment.sandbox : Environment.production});
}

function priceId(plan: PlanId, period: BillingPeriod): string {
  const env = getServerEnv();
  return ({starter: {monthly: env.PADDLE_PRICE_STARTER_MONTHLY, annual: env.PADDLE_PRICE_STARTER_ANNUAL},
    pro: {monthly: env.PADDLE_PRICE_PRO_MONTHLY, annual: env.PADDLE_PRICE_PRO_ANNUAL},
    agency: {monthly: env.PADDLE_PRICE_AGENCY_MONTHLY, annual: env.PADDLE_PRICE_AGENCY_ANNUAL}} as const)[plan][period];
}

function planForPrice(id: string): {plan: PlanId; period: BillingPeriod} | null {
  for (const plan of ['starter', 'pro', 'agency'] as const) for (const period of ['monthly', 'annual'] as const)
    if (priceId(plan, period) === id) return {plan, period};
  return null;
}

function ownerFromData(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('ownerId' in value)) return null;
  const id = (value as {ownerId?: unknown}).ownerId;
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id) ? id : null;
}

export class PaddleBillingProvider implements BillingProvider {
  async createCheckout(input: {ownerId: string; email: string; plan: PlanId; period: BillingPeriod; customerId?: string}): Promise<string> {
    const customerId = input.customerId ?? (await paddleClient().customers.create({email: input.email, customData: {ownerId: input.ownerId}})).id;
    const tx = await paddleClient().transactions.create({items: [{priceId: priceId(input.plan, input.period), quantity: 1}],
      customerId, collectionMode: 'automatic', customData: {ownerId: input.ownerId}});
    if (!tx.checkout?.url) throw new ExternalServiceError();
    return tx.checkout.url;
  }
  async createPortalSession(customerId: string, subscriptionId: string): Promise<string> {
    const session = await paddleClient().customerPortalSessions.create(customerId, [subscriptionId]);
    return session.urls.general.overview;
  }
  async getSubscription(subscriptionId: string): Promise<BillingSubscription> {
    const sub = await paddleClient().subscriptions.get(subscriptionId);
    const choice = sub.items.map((item) => planForPrice(item.price.id)).find((item) => item !== null);
    if (!choice) throw new ExternalServiceError();
    let country: string | null = null;
    try { country = (await paddleClient().addresses.get(sub.customerId, sub.addressId)).countryCode; } catch { /* Billing address may not exist yet. */ }
    return {id: sub.id, customerId: sub.customerId, plan: choice.plan, period: choice.period,
      status: sub.status === 'trialing' ? 'trialing' : sub.status === 'past_due' ? 'past_due' : sub.status === 'paused' ? 'paused' : sub.status === 'canceled' ? 'canceled' : 'active',
      periodStart: sub.currentBillingPeriod?.startsAt ?? null, periodEnd: sub.currentBillingPeriod?.endsAt ?? null,
      cancelAtPeriodEnd: sub.scheduledChange?.action === 'cancel', canceledAt: sub.canceledAt,
      country, ownerId: ownerFromData(sub.customData)};
  }
  async changePlan(subscriptionId: string, plan: PlanId, period: BillingPeriod): Promise<BillingSubscription> {
    await paddleClient().subscriptions.update(subscriptionId, {items: [{priceId: priceId(plan, period), quantity: 1}], prorationBillingMode: 'prorated_immediately'});
    return this.getSubscription(subscriptionId);
  }
  async cancelAtPeriodEnd(subscriptionId: string): Promise<BillingSubscription> {
    await paddleClient().subscriptions.cancel(subscriptionId, {effectiveFrom: 'next_billing_period'});
    return this.getSubscription(subscriptionId);
  }
  async resume(subscriptionId: string): Promise<BillingSubscription> {
    const sub = await paddleClient().subscriptions.get(subscriptionId);
    if (sub.scheduledChange?.action === 'cancel') await paddleClient().subscriptions.update(subscriptionId, {scheduledChange: null});
    else if (sub.status === 'paused') await paddleClient().subscriptions.resume(subscriptionId, {effectiveFrom: 'immediately'});
    return this.getSubscription(subscriptionId);
  }
  async listInvoices(customerId: string): Promise<BillingInvoice[]> {
    const collection = paddleClient().transactions.list({customerId: [customerId], perPage: 20});
    const invoices: BillingInvoice[] = [];
    for await (const tx of collection) {
      if (invoices.length >= 20) break;
      if (!tx.invoiceNumber || !['completed', 'billed'].includes(tx.status)) continue;
      invoices.push({id: tx.id, number: tx.invoiceNumber, date: tx.billedAt ?? tx.createdAt,
        status: tx.status, currency: tx.currencyCode, total: tx.details?.totals?.total ?? null, invoiceUrl: `/api/billing/invoice/${tx.id}`});
    }
    return invoices;
  }
  async getInvoiceUrl(transactionId: string, customerId: string): Promise<string> {
    const tx = await paddleClient().transactions.get(transactionId);
    if (tx.customerId !== customerId || !tx.invoiceNumber || !['completed', 'billed'].includes(tx.status)) throw new ExternalServiceError();
    return (await paddleClient().transactions.getInvoicePDF(transactionId)).url;
  }
}

export const billingProvider: BillingProvider = new PaddleBillingProvider();
