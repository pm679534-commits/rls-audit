import {NextResponse} from 'next/server';
import {z} from 'zod';
import {requireUser} from '@/lib/auth';
import {resolveEntitlements} from '@/lib/billing/entitlements';
import {billingProvider} from '@/lib/billing/paddle';
import {toRouteError, ForbiddenError} from '@/lib/errors';

export const runtime = 'nodejs';

export async function GET(_request: Request, {params}: {params: Promise<{transactionId: string}>}) {
  try {
    const context = await requireUser();
    const sub = (await resolveEntitlements(context)).subscription;
    if (!sub?.paddle_customer_id || !sub.paddle_subscription_id) throw new ForbiddenError();
    const transactionId = z.string().regex(/^txn_[a-z0-9]+$/i).parse((await params).transactionId);
    const url = await billingProvider.getInvoiceUrl(transactionId, sub.paddle_customer_id);
    return NextResponse.redirect(url, {headers: {'Cache-Control': 'private, no-store'}});
  } catch (error) { return toRouteError(error); }
}
