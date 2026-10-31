import {getTranslations} from 'next-intl/server';
import {DashboardShell} from '@/components/shells/dashboard-shell';
import {requirePageUser} from '@/lib/auth/page';
import {TrialBanner} from '@/components/account/trial-banner';
import {CommandPaletteLauncher} from '@/components/dashboard/command-palette-launcher';
import {createClient} from '@/lib/supabase/server';
import {AnnouncementBanner} from '@/components/announcement-banner';
import {Suspense} from 'react';
import {Skeleton} from '@/components/ui/skeleton';
import {unreadNotificationCount} from '@/lib/notifications/unread';

export const dynamic = 'force-dynamic';

async function Palette() {
  const db = await createClient();
  const {data: sites} = await db.from('sites').select('id,name,domain').order('name').limit(50);
  return <CommandPaletteLauncher sites={sites ?? []} />;
}

async function UnreadCount({userId}: {userId: string}) {
  const count = await unreadNotificationCount(userId);
  return count ? <span className="ml-1 tabular-nums">({count === 100 ? '99+' : count})</span> : null;
}

export default async function DashboardLayout({children}: {children: React.ReactNode}) {
  const [context, t] = await Promise.all([requirePageUser(), getTranslations('Nav')]);
  return <DashboardShell title={t('dashboard')} action={<Suspense fallback={<Skeleton className="h-9 w-24" />}><Palette /></Suspense>}
    notificationCount={<Suspense fallback={null}><UnreadCount userId={context.user.id} /></Suspense>}
    navigation={[{href: '/dashboard', label: t('dashboard')}, {href: '/dashboard/sites', label: t('sites')}, {href: '/dashboard/reports', label: t('reports')}, {href: '/dashboard/notifications', label: t('notifications')}, {href: '/dashboard/team', label: t('team')}, {href: '/dashboard/api-keys', label: t('apiKeys')}, {href: '/dashboard/billing', label: t('billing')}, {href: '/dashboard/settings', label: t('settings')}] }>
    <Suspense fallback={null}><AnnouncementBanner /></Suspense>
    <Suspense fallback={<Skeleton className="mb-6 h-20 rounded-xl" />}><TrialBanner context={context} /></Suspense>
    {children}
  </DashboardShell>;
}
