import {getTranslations} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';
import {requireUser} from '@/lib/auth';
import {resolveEntitlements, hasEntitlement} from '@/lib/billing/entitlements';
import {listNotifications} from '@/lib/notifications';
import {NotificationCenter} from '@/components/dashboard/notification-center';

export default async function NotificationsPage({searchParams}: {searchParams: Promise<{page?: string}>}) {
  const context = await requireUser();
  const rawPage = Number((await searchParams).page ?? '1');
  const page = Number.isInteger(rawPage) && rawPage > 0 && rawPage <= 10000 ? rawPage : 1;
  const db = await createClient();
  const [data, entitlements, {data: sites}, t] = await Promise.all([
    listNotifications(page), resolveEntitlements(context),
    db.from('sites').select('id,name').eq('owner_id', context.user.id).order('name'),
    getTranslations('Phase7')
  ]);
  return <div className="space-y-6"><div><h1 className="font-display text-3xl">{t('notifications')}</h1><p className="mt-2 text-muted-foreground">{t('notificationsDescription')}</p></div>
    <NotificationCenter {...data} sites={sites ?? []} canChannels={hasEntitlement(entitlements, 'webhookAlerts')} readOnly={entitlements.read_only} />
  </div>;
}
