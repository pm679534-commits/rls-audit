import {getTranslations} from 'next-intl/server';
import {DashboardShell} from '@/components/shells/dashboard-shell';
import {requireUser} from '@/lib/auth';
import {TrialBanner} from '@/components/account/trial-banner';
import {CommandPalette} from '@/components/dashboard/command-palette';
import {createClient} from '@/lib/supabase/server';
import {AnnouncementBanner} from '@/components/announcement-banner';

export default async function DashboardLayout({children}: {children: React.ReactNode}) {
  const context = await requireUser();
  const t = await getTranslations('Nav');
  const db = await createClient();
  const [{data: sites}, {count: unread}] = await Promise.all([
    db.from('sites').select('id,name,domain').order('name').limit(50),
    db.from('notifications').select('id', {count: 'exact', head: true}).eq('user_id', context.user.id).is('read_at', null)
  ]);
  return <DashboardShell title={t('dashboard')} action={<CommandPalette sites={sites ?? []} />} navigation={[{href: '/dashboard', label: t('dashboard')}, {href: '/dashboard/sites', label: t('sites')}, {href: '/dashboard/reports', label: t('reports')}, {href: '/dashboard/notifications', label: `${t('notifications')}${unread ? ` (${unread})` : ''}`}, {href: '/dashboard/team', label: t('team')}, {href: '/dashboard/api-keys', label: t('apiKeys')}, {href: '/dashboard/billing', label: t('billing')}, {href: '/dashboard/settings', label: t('settings')}] }>
    <AnnouncementBanner /><TrialBanner context={context} />{children}
  </DashboardShell>;
}
