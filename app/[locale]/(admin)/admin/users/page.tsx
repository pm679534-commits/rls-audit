import {getTranslations} from 'next-intl/server';
import {adminUsers} from '@/lib/admin/data';
import {AdminHeading, AdminEmpty, DateText} from '@/components/admin/primitives';
import {Link} from '@/i18n/navigation';

type Params = {q?: string; plan?: string; status?: string; role?: string; sort?: string; direction?: string; page?: string};

export default async function AdminUsersPage({searchParams}: {searchParams: Promise<Params>}) {
  const {rows,hasNext,filter} = await adminUsers(await searchParams);
  const t = await getTranslations('Phase8');
  const query = (changes: Partial<Params>) => `/admin/users?${new URLSearchParams({...filter, page: String(filter.page), ...changes}).toString()}`;
  const sorted = (key: typeof filter.sort) => query({sort: key, direction: filter.sort === key && filter.direction === 'asc' ? 'desc' : 'asc', page: '1'});
  return <div><AdminHeading eyebrow={t('panel')} title={t('users.title')} description={t('users.description')} />
    <form method="get" className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_repeat(3,auto)_auto]">
      <input name="q" defaultValue={filter.q} maxLength={120} placeholder={t('users.searchHint')} aria-label={t('users.searchHint')} className="min-w-48 rounded-md border bg-background px-3 py-2 text-sm" />
      <select name="plan" defaultValue={filter.plan} aria-label={t('users.planFilter')} className="rounded-md border bg-background px-3 py-2 text-sm"><option value="all">{t('users.allPlans')}</option><option value="none">{t('users.none')}</option>{(['starter','pro','agency'] as const).map((plan) => <option key={plan} value={plan}>{t(`plan.${plan}`)}</option>)}</select>
      <select name="status" defaultValue={filter.status} aria-label={t('status')} className="rounded-md border bg-background px-3 py-2 text-sm">{(['all','trial','active','past_due','canceled','suspended'] as const).map((status) => <option key={status} value={status}>{t(`users.status.${status}`)}</option>)}</select>
      <select name="role" defaultValue={filter.role} aria-label={t('users.role')} className="rounded-md border bg-background px-3 py-2 text-sm"><option value="all">{t('users.allRoles')}</option><option value="user">{t('state.user')}</option><option value="admin">{t('state.admin')}</option></select>
      <button className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">{t('search')}</button>
      <input type="hidden" name="sort" value={filter.sort} /><input type="hidden" name="direction" value={filter.direction} />
    </form>
    {rows.length ? <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr>
      {([['email','user'],['effective_plan','effectivePlan'],['status','status'],['sites_used','sitesUsage'],['trial_ends_at','trialEnds'],['created_at','created'],['last_sign_in_at','lastSignIn'],['role','role']] as const).map(([sort,label]) => <th key={sort} scope="col" className="p-3"><Link href={sorted(sort)} className="hover:text-foreground">{label === 'status' ? t('status') : label === 'created' ? t('created') : t(`users.${label}`)} {filter.sort === sort ? (filter.direction === 'asc' ? '↑' : '↓') : ''}</Link></th>)}
    </tr></thead><tbody>{rows.map((user) => <tr key={user.id} className="border-t"><td className="p-3"><Link href={`/admin/users/${user.id}`} className="font-medium text-primary hover:underline">{user.email}</Link>{user.display_name && <div className="text-xs text-muted-foreground">{user.display_name}</div>}</td>
      <td className="p-3">{user.effective_plan ? t(`plan.${user.effective_plan}`) : t('users.none')}<div className="text-xs text-muted-foreground">{t(`users.source.${user.plan_source}`)}</div></td>
      <td className="p-3">{t(`users.status.${user.status as 'trial'|'active'|'past_due'|'canceled'|'suspended'}`)}</td><td className="p-3 tabular-nums">{user.sites_used} / {user.site_limit}</td><td className="p-3"><DateText value={user.trial_ends_at} locale={user.locale} /></td><td className="p-3"><DateText value={user.created_at} locale={user.locale} /></td><td className="p-3"><DateText value={user.last_sign_in_at} locale={user.locale} /></td><td className="p-3">{t(`state.${user.role as 'user'|'admin'}`)}</td></tr>)}</tbody></table></div> : <AdminEmpty text={t('noResults')} />}
    {(filter.page > 1 || hasNext) && <nav aria-label={t('pages')} className="mt-5 flex items-center justify-between text-sm"><span>{t('users.pageNumber', {page: filter.page})}</span><div className="flex gap-2">{filter.page > 1 && <Link href={query({page: String(filter.page - 1)})} className="rounded-md border px-3 py-2">{t('users.previous')}</Link>}{hasNext && <Link href={query({page: String(filter.page + 1)})} className="rounded-md border px-3 py-2">{t('users.next')}</Link>}</div></nav>}
  </div>;
}
