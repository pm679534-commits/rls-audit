import {getTranslations} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';
import {requireUser} from '@/lib/auth';
import {listReports} from '@/lib/reports';
import {resolveEntitlements, resolveOwnerEntitlements, hasEntitlement} from '@/lib/billing/entitlements';
import {getSiteUrl} from '@/lib/config';
import {ReportManager} from '@/components/dashboard/report-manager';

export default async function ReportsPage({searchParams}: {searchParams: Promise<{page?: string}>}) {
  const context = await requireUser();
  const rawPage = Number((await searchParams).page ?? '1');
  const page = Number.isInteger(rawPage) && rawPage > 0 && rawPage <= 10000 ? rawPage : 1;
  const [{sites, links, exports, hasNext}, entitlements] = await Promise.all([listReports(page), resolveEntitlements(context)]);
  const db = await createClient();
  const ids = sites.map((site) => site.id);
  const owners = new Map(await Promise.all([...new Set(sites.map((site) => site.owner_id))].map(async (id) => [id, await resolveOwnerEntitlements(id)] as const)));
  const batch = ids.length ? await db.rpc('can_edit_sites', {p_site_ids: ids}) : {data: [], error: null};
  let editable = new Set((batch.data ?? []).filter((row) => row.can_edit).map((row) => row.site_id));
  if (batch.error) {
    if (!['PGRST202', '42883'].includes(batch.error.code)) throw new Error('Could not load report permissions');
    const oldChecks = await Promise.all(sites.map((site) => db.rpc('can_edit_site', {p_site: site.id})));
    if (oldChecks.some((check) => check.error)) throw new Error('Could not load report permissions');
    editable = new Set(sites.filter((_, index) => !!oldChecks[index].data).map((site) => site.id));
  }
  const siteGates = Object.fromEntries(sites.map((site) => {
    const owner = owners.get(site.owner_id)!;
    return [site.id, {edit: editable.has(site.id) && !entitlements.read_only, pdf: hasEntitlement(owner, 'pdfReports'), data: hasEntitlement(owner, 'csvExport') && hasEntitlement(owner, 'jsonExport'),
      badge: hasEntitlement(owner, 'scoreBadge'), historyDays: owner.history_days ?? 30}];
  }));
  const oldestCutoff = new Date(Date.now() - Math.max(30, ...Object.values(siteGates).map((gate) => gate.historyDays)) * 86_400_000).toISOString();
  const {data: scans} = ids.length ? await db.from('scans').select('id,site_id,score,completed_at,created_at').in('site_id', ids).eq('status', 'completed').gte('created_at', oldestCutoff).order('created_at', {ascending: false}).limit(500) : {data: []};
  const visibleScans = (scans ?? []).filter((scan) => new Date(scan.created_at).getTime() >= Date.now() - siteGates[scan.site_id].historyDays * 86_400_000);
  const t = await getTranslations('Phase7');
  return <div className="space-y-6"><div><h1 className="font-display text-3xl">{t('reports')}</h1><p className="mt-2 text-muted-foreground">{t('reportsDescription')}</p></div>
    <ReportManager sites={sites} scans={visibleScans} links={links} exports={exports} siteGates={siteGates} readOnly={entitlements.read_only} page={page} hasNext={hasNext}
      baseUrl={getSiteUrl().origin} />
  </div>;
}
