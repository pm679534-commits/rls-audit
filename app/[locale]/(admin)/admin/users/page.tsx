import {getTranslations} from 'next-intl/server';
import {requireAdmin} from '@/lib/auth';
import {adminUsers} from '@/lib/admin/data';
import {AdminHeading, AdminEmpty, AdminPager, DateText} from '@/components/admin/primitives';
import {Link} from '@/i18n/navigation';

export default async function AdminUsersPage({searchParams}: {searchParams: Promise<{q?: string; status?: string; page?: string}>}) {
  await requireAdmin();
  const raw = await searchParams;
  const [{rows,count,filter},t] = await Promise.all([adminUsers(raw),getTranslations('Phase8')]);
  const base = `/admin/users?q=${encodeURIComponent(filter.q)}&status=${filter.status}`;
  return <div><AdminHeading eyebrow={t('panel')} title={t('users.title')} description={t('users.description')} />
    <form method="get" className="mb-5 flex flex-wrap gap-2"><input name="q" defaultValue={filter.q} maxLength={120} placeholder={t('search')} aria-label={t('search')} className="min-w-48 flex-1 rounded-md border bg-background px-3 py-2 text-sm" /><select name="status" defaultValue={filter.status} aria-label={t('filter')} className="rounded-md border bg-background px-3 py-2 text-sm"><option value="all">{t('all')}</option><option value="trial">{t('users.trial')}</option><option value="suspended">{t('users.suspended')}</option><option value="admin">{t('users.admin')}</option></select><button className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">{t('search')}</button></form>
    {rows.length ? <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full min-w-[660px] text-left text-sm"><thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="p-3">{t('users.user')}</th><th className="p-3">{t('users.role')}</th><th className="p-3">{t('users.trialEnds')}</th><th className="p-3">{t('status')}</th><th className="p-3">{t('created')}</th></tr></thead><tbody>{rows.map((user) => <tr key={user.id} className="border-t"><td className="p-3"><Link href={`/admin/users/${user.id}`} className="font-medium text-primary hover:underline">{user.display_name || user.email}</Link><div className="text-xs text-muted-foreground">{user.email}</div></td><td className="p-3">{t(`state.${user.role}`)}</td><td className="p-3"><DateText value={user.trial_ends_at} locale={user.locale} /></td><td className="p-3">{user.suspended ? t('users.suspended') : user.plan_override ? t(`plan.${user.plan_override}`) : t('users.active')}</td><td className="p-3"><DateText value={user.created_at} locale={user.locale} /></td></tr>)}</tbody></table></div> : <AdminEmpty text={t('noResults')} />}
    <AdminPager path={base} page={filter.page} count={count} label={t('pages')} />
  </div>;
}
