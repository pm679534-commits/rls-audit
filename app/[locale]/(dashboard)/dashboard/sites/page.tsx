import {getTranslations} from 'next-intl/server';
import {requireUser} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {Link} from '@/i18n/navigation';
import {SiteForm} from '@/components/sites/site-manager';
import {getTrialStatus} from '@/lib/auth/trial';
import {UpgradePrompt} from '@/components/account/trial-banner';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {ResponsiveFilters} from '@/components/responsive-filters';

export default async function SitesPage({searchParams}: {searchParams: Promise<{q?: string; status?: string; page?: string}>}) {
  const context = await requireUser();
  const {q = '', status = 'all', page: rawPage = '1'} = await searchParams;
  const trial = await getTrialStatus(context);
  const search = q.trim().replace(/[^\p{L}\p{N}\s._-]/gu, '').slice(0, 100);
  const selectedStatus = ['all','active','paused','verified'].includes(status) ? status : 'all';
  const parsedPage = Number(rawPage);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 && parsedPage <= 10000 ? parsedPage : 1;
  let request = (await createClient()).from('sites').select('id,name,domain,status,last_score,verified_at,verification_due_at').order('created_at', {ascending: false});
  if (search) request = request.or(`name.ilike.%${search}%,domain.ilike.%${search}%`);
  if (selectedStatus === 'verified') request = request.not('verified_at', 'is', null).gt('verification_due_at', new Date().toISOString());
  else if (selectedStatus !== 'all') request = request.eq('status', selectedStatus as 'active' | 'paused');
  const {data, error} = await request.range((page - 1) * 20, page * 20);
  if (error) throw new Error('Could not load sites');
  const visible = (data ?? []).slice(0, 20);
  const hasNext = (data ?? []).length > 20;
  const [t,d] = await Promise.all([getTranslations('Phase5.sites'), getTranslations('Phase7')]);
  const query = (nextPage: number) => `/dashboard/sites?${new URLSearchParams({q: search, status: selectedStatus, page: String(nextPage)}).toString()}`;
  return <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]"><section className="min-w-0"><h1 className="font-display text-3xl">{t('title')}</h1><p className="mt-2 text-muted-foreground">{t('description')}</p>
    <ResponsiveFilters label={d('filterSiteStatus')}><form method="get" className="mt-6 flex flex-wrap gap-2"><Input type="search" inputMode="search" autoComplete="off" name="q" defaultValue={search} maxLength={100} placeholder={d('searchSites')} aria-label={d('searchSites')} className="min-w-0 flex-1" />
      <select name="status" defaultValue={selectedStatus} aria-label={d('filterSiteStatus')} className="min-h-11 rounded-md border bg-background px-3 py-2 text-sm"><option value="all">{d('allStatuses')}</option><option value="active">{d('active')}</option><option value="paused">{t('paused')}</option><option value="verified">{t('verified')}</option></select><Button type="submit" variant="outline">{d('searchAll')}</Button></form></ResponsiveFilters>
    <p className="mt-3 text-xs text-muted-foreground">{d('sitesOnPage', {count: visible.length, page})}</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">{visible.length ? visible.map((site) => <Link key={site.id} href={`/dashboard/sites/${site.id}`} className="block min-w-0 rounded-xl border bg-card p-5 transition-colors hover:border-primary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><div className="flex items-start justify-between gap-3"><h2 className="truncate font-semibold">{site.name}</h2><span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs font-medium">{site.last_score === null ? '—' : `${site.last_score}/100`}</span></div><p className="mt-1 truncate text-sm text-muted-foreground">{site.domain}</p><p className="mt-4 text-xs text-muted-foreground">{site.status === 'paused' ? t('paused') : site.verified_at && site.verification_due_at && new Date(site.verification_due_at).getTime() > Date.now() ? t('verified') : t('unverified')}</p></Link>) : <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground sm:col-span-2">{search || selectedStatus !== 'all' ? d('noSiteResults') : t('empty')}</p>}</div>
    {(page > 1 || hasNext) && <nav aria-label={d('sitesPages')} className="mt-5 flex items-center justify-between gap-3 text-sm"><span>{d('pageNumber', {page})}</span><div className="flex gap-2">{page > 1 && <Link href={query(page - 1)} className="inline-flex min-h-11 items-center rounded-md border px-4">{d('previous')}</Link>}{hasNext && <Link href={query(page + 1)} className="inline-flex min-h-11 items-center rounded-md border px-4">{d('next')}</Link>}</div></nav>}
  </section>{!trial.readOnly ? <aside className="min-w-0"><h2 className="mb-3 text-xl font-semibold">{t('add')}</h2><SiteForm /></aside> : <aside><UpgradePrompt /></aside>}</div>;
}
