import {getTranslations} from 'next-intl/server';
import {requireUser} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {resolveEntitlements} from '@/lib/billing/entitlements';
import {billingProvider} from '@/lib/billing/paddle';
import {BillingPage} from '@/components/billing/billing-page';

export default async function Page() {
  const context = await requireUser();
  const entitlements = await resolveEntitlements(context);
  const db = await createClient();
  const [{data: sites, error: sitesError}, {data: scans, error: scansError}, {data: team, error: teamError}] = await Promise.all([
    db.rpc('active_site_count', {p_user: context.user.id}),
    db.rpc('manual_scan_count_this_month', {p_user: context.user.id}),
    db.from('teams').select('id').eq('owner_id', context.user.id).maybeSingle()
  ]);
  if (sitesError || scansError || teamError) throw new Error('Billing usage unavailable');
  const {data: seats, error: seatsError} = team ? await db.rpc('team_seat_count', {p_team: team.id}) : {data: 0, error: null};
  if (seatsError) throw new Error('Billing usage unavailable');
  let invoices: Awaited<ReturnType<typeof billingProvider.listInvoices>> = [];
  let invoiceError = false;
  if (entitlements.subscription?.paddle_customer_id) {
    try { invoices = await billingProvider.listInvoices(entitlements.subscription.paddle_customer_id); }
    catch { invoiceError = true; }
  }
  const t = await getTranslations('Phase6');
  return <div className="space-y-6"><div><h1 className="font-display text-3xl">{t('title')}</h1><p className="mt-2 text-muted-foreground">{t('description')}</p></div>
    <BillingPage entitlements={entitlements} usage={{sites: sites ?? 0, scans: scans ?? 0, seats: seats ?? 0}} invoices={invoices} invoiceError={invoiceError} />
  </div>;
}
