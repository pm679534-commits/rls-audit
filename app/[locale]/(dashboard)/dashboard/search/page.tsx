import {getTranslations} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';
import {requireUser} from '@/lib/auth';
import {Link} from '@/i18n/navigation';
import {SeverityBadge} from '@/components/severity-badge';

export default async function SearchPage({searchParams}: {searchParams: Promise<{q?: string}>}) {
  await requireUser();
  const query = ((await searchParams).q ?? '').trim().slice(0, 80);
  const t = await getTranslations('Phase7');
  if (!query) return <div><h1 className="font-display text-3xl">{t('searchAll')}</h1><p className="mt-4 text-muted-foreground">{t('searchHint')}</p></div>;
  const db = await createClient();
  const scanner = await getTranslations('Scanner.findings');
  const [{data: allSites, error: siteError}, {data: findings, error: findingsError}] = await Promise.all([
    db.from('sites').select('id,name,domain').order('name'),
    db.from('findings').select('id,site_id,scan_id,finding_key,affected_asset,severity,title_key,created_at').order('created_at', {ascending: false}).limit(500)
  ]);
  if (siteError || findingsError) throw new Error('Could not search workspace');
  const sites = (allSites ?? []).filter((site) => `${site.name} ${site.domain}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const seen = new Set<string>();
  const uniqueFindings = (findings ?? []).filter((finding) => {
    const key = `${finding.site_id}:${finding.finding_key}:${finding.affected_asset ?? ''}`;
    if (seen.has(key) || !`${finding.finding_key} ${finding.affected_asset ?? ''} ${scanner(`${finding.finding_key}.title` as Parameters<typeof scanner>[0])}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) return false;
    seen.add(key); return true;
  }).slice(0, 100);
  return <div className="space-y-6"><div><h1 className="font-display text-3xl">{t('searchResults')}</h1><p className="mt-2 text-muted-foreground">{t('resultsFor', {query})}</p></div><section className="rounded-xl border bg-card p-5"><h2 className="text-lg font-semibold">{t('sites')} ({sites.length})</h2>{sites.length ? <ul className="mt-3 divide-y">{sites.map((site) => <li key={site.id} className="py-3"><Link href={`/dashboard/sites/${site.id}`} className="font-medium text-primary hover:underline">{site.name}</Link><span className="ml-2 text-sm text-muted-foreground">{site.domain}</span></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">{t('noSiteResults')}</p>}</section>
    <section className="rounded-xl border bg-card p-5"><h2 className="text-lg font-semibold">{t('findings')} ({uniqueFindings.length})</h2>{uniqueFindings.length ? <ul className="mt-3 divide-y">{uniqueFindings.map((finding) => <li key={finding.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><Link href={`/dashboard/sites/${finding.site_id}`} className="text-sm font-medium text-primary hover:underline">{scanner(`${finding.finding_key}.title` as Parameters<typeof scanner>[0])}</Link><SeverityBadge severity={finding.severity} /></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">{t('noFindingResults')}</p>}</section></div>;
}
