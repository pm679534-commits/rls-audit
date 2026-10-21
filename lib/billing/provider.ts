import type {BillingPeriod, PlanId} from '@/lib/plans';

export type BillingSubscription = {
  id: string; customerId: string; plan: PlanId; period: BillingPeriod;
  status: 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled';
  periodStart: string | null; periodEnd: string | null; cancelAtPeriodEnd: boolean;
  canceledAt: string | null; country: string | null; ownerId: string | null;
};
export type BillingInvoice = {id: string; number: string | null; date: string; status: string; currency: string; total: string | null; invoiceUrl: string | null};

export interface BillingProvider {
  createCheckout(input: {ownerId: string; email: string; plan: PlanId; period: BillingPeriod; customerId?: string}): Promise<string>;
  createPortalSession(customerId: string, subscriptionId: string): Promise<string>;
  getSubscription(subscriptionId: string): Promise<BillingSubscription>;
  changePlan(subscriptionId: string, plan: PlanId, period: BillingPeriod): Promise<BillingSubscription>;
  cancelAtPeriodEnd(subscriptionId: string): Promise<BillingSubscription>;
  resume(subscriptionId: string): Promise<BillingSubscription>;
  listInvoices(customerId: string): Promise<BillingInvoice[]>;
  getInvoiceUrl(transactionId: string, customerId: string): Promise<string>;
}
