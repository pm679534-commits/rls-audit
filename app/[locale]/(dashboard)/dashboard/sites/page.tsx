import {getTranslations} from 'next-intl/server';
import {requireUser} from '@/lib/auth';
import {createClient} from '@/lib/supabase/server';
import {Link} from '@/i18n/navigation';
import {SiteForm} from '@/components/sites/site-manager';
import {getTrialStatus} from '@/lib/auth/trial';
import {UpgradePrompt} from '@/components/account/trial-banner';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';

export default async function SitesPage({searchParams}: {searchParams: Promise<{q?: string; status?: string}>}) {
  const context = await requireUser();
  const trial = await getTrialStatus(context);
  const {q = '', status = 'all'} = await searchParams;
  const query = q.trim().slice(0, 100).toLocaleLowerCase();
  const {data: sites, error} = await (await createClient()).from('sites').select('*').order('created_at', {ascending: false});
  if (error) throw new Error('Could not load sites');
  const visible = (sites ?? []).filter((site) => (!query || `${site.name} ${site.domain}`.toLocaleLowerCase().includes(query)) &&
    (status === 'all' || (status === 'verified' ? !!site.verified_at && !!site.verification_due_at && new Date(site.verification_due_at).getTime() > Date.now() : site.status === status)));
  const t = await getTranslations('Phase5.sites');
  const d = await getTranslations('Phase7');
  return <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]"><section><h1 className="font-display text-3xl">{t('title')}</h1><p className="mt-2 text-muted-foreground">{t('description')}</p>
    <form method="get" className="mt-6 flex flex-wrap gap-2"><Input name="q" defaultValue={q} maxLength={100} placeholder={d('searchSites')} aria-label={d('searchSites')} className="min-w-48 flex-1" />
      <select name="status" defaultValue={status} aria-label={d('filterSiteStatus')} className="rounded-md border bg-background px-3 py-2 text-sm"><option value="all">{d('allStatuses')}</option><option value="active">{d('active')}</option><option value="paused">{t('paused')}</option><option value="verified">{t('verified')}</option></select><Button type="submit" variant="outline">{d('searchAll')}</Button></form>
    <p className="mt-3 text-xs text-muted-foreground">{d('siteCount', {count: visible.length})}</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">{visible.length ? visible.map((site) => <Link key={site.id} href={`/dashboard/sites/${site.id}`} className="block min-w-0 rounded-xl border bg-card p-5 transition-colors hover:border-primary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><div className="flex items-start justify-between gap-3"><h2 className="truncate font-semibold">{site.name}</h2><span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs font-medium">{site.last_score === null ? '—' : `${site.last_score}/100`}</span></div><p className="mt-1 truncate text-sm text-muted-foreground">{site.domain}</p><p className="mt-4 text-xs text-muted-foreground">{site.status === 'paused' ? t('paused') : site.verified_at && site.verification_due_at && new Date(site.verification_due_at).getTime() > Date.now() ? t('verified') : t('unverified')}</p></Link>) : <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground sm:col-span-2">{query || status !== 'all' ? d('noSiteResults') : t('empty')}</p>}</div>
  </section>{!trial.readOnly ? <aside><h2 className="mb-3 text-xl font-semibold">{t('add')}</h2><SiteForm /></aside> : <aside><UpgradePrompt /></aside>}</div>;
}
