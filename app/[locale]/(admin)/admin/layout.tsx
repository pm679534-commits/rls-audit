import {getTranslations} from 'next-intl/server';
import {AdminShell} from '@/components/shells/admin-shell';
import {requireAdmin} from '@/lib/auth';

export default async function AdminLayout({children}: {children: React.ReactNode}) {
  await requireAdmin();
  const t = await getTranslations('Phase8');
  const navigation = [
    {href: '/admin', label: t('nav.overview')}, {href: '/admin/users', label: t('nav.users')},
    {href: '/admin/billing', label: t('nav.billing')}, {href: '/admin/sites', label: t('nav.sites')},
    {href: '/admin/scans', label: t('nav.scans')}, {href: '/admin/inbox', label: t('nav.inbox')},
    {href: '/admin/content', label: t('nav.content')}, {href: '/admin/system', label: t('nav.system')}
  ];
  return <AdminShell title={t('panel')} navigation={navigation}>
    {children}
  </AdminShell>;
}
