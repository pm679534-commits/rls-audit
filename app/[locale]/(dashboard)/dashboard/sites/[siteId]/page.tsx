import {notFound} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';
import {requireSiteAccess, requireUser} from '@/lib/auth';
import {SiteForm, SiteControls, VerificationControls, FirstScanButton} from '@/components/sites/site-manager';
import {ScoreChartLazy as ScoreChart} from '@/components/dashboard/score-chart-lazy';
import {FindingsTable} from '@/components/dashboard/findings-table';
import {ScanTimeline} from '@/components/dashboard/scan-timeline';
import {SiteScanSettings} from '@/components/dashboard/site-scan-settings';
import {ScoreRing} from '@/components/score-ring';
import {Link} from '@/i18n/navigation';
import {resolveEntitlements, resolveOwnerEntitlements, hasEntitlement} from '@/lib/billing/entitlements';
import {getScannerConfigPresence} from '@/lib/dashboard/site';
import {getFindingViews} from '@/lib/dashboard/findings';

export default async function SiteDetailPage({params, searchParams}: {params: Promise<{siteId: string}>; searchParams: Promise<{scanPage?: string}>}) {
  const {siteId} = await params;
  if (!/^[0-9a-f-]{36}$/i.test(siteId)) notFound();
  const site = await requireSiteAccess(siteId);
  const context = await requireUser();
  const [ownEntitlements, ownerEntitlements] = await Promise.all([resolveEntitlements(context), resolveOwnerEntitlements(site.owner_id)]);
  const db = await createClient();
  const {data: canEditSite} = await db.rpc('can_edit_site', {p_site: site.id});
  const canEdit = !!canEditSite && !ownEntitlements.read_only && !ownerEntitlements.read_only;
  const historyDays = ownerEntitlements.history_days ?? 30;
  const cutoff = new Date(Date.now() - historyDays * 86_400_000).toISOString();
  const rawPage = Number((await searchParams).scanPage ?? '1');
  const scanPage = Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 1000 ? rawPage : 1;
  const pageSize = 20;
  const [{data: verifications}, {data: scans, count: scanCount, error: scansError}, {data: latest, error: latestError},
    {data: active, error: activeError}, {data: scoreScans, error: scoreError}, presence] = await Promise.all([
    db.from('site_verifications').select('*').eq('site_id', site.id).eq('status', 'pending').order('created_at', {ascending: false}).limit(1),
    db.from('scans').select('id,status,score,created_at,completed_at,kind,summary', {count: 'planned'}).eq('site_id', site.id).gte('created_at', cutoff).order('created_at', {ascending: false}).range((scanPage - 1) * pageSize, scanPage * pageSize - 1),
    db.from('scans').select('id,status,score,created_at,completed_at,kind,summary').eq('site_id', site.id).eq('status', 'completed').gte('created_at', cutoff).order('created_at', {ascending: false}).limit(1).maybeSingle(),
    db.from('scans').select('id,status,score,created_at,completed_at,kind,summary').eq('site_id', site.id).in('status', ['queued', 'running']).gte('created_at', cutoff).order('created_at', {ascending: false}).limit(1).maybeSingle(),
    db.from('scans').select('score,created_at,completed_at').eq('site_id', site.id).eq('status', 'completed').gte('created_at', cutoff).order('created_at', {ascending: false}).limit(60),
    getScannerConfigPresence(site)
  ]);
  if (scansError || latestError || activeError || scoreError) throw new Error('Could not load scan history');
  const totalScanPages = Math.max(1, Math.ceil((scanCount ?? 0) / pageSize));
  if (scanPage > totalScanPages) notFound();
  const [findings, {data: modules}] = await Promise.all([
    latest ? getFindingViews(site.id, latest.id) : Promise.resolve([]),
    active ? db.from('scan_modules_results').select('module_key,status').eq('scan_id', active.id) : Promise.resolve({data: []})
  ]);
  const verified = !!site.verified_at && !!site.verification_due_at && new Date(site.verification_due_at).getTime() > Date.now();
  const t = await getTranslations('Phase7');
  const p5 = await getTranslations('Phase5.sites');
  const extra = await getTranslations('Phase5Labels');
  return <div className="space-y-7"><div className="flex flex-wrap items-center justify-between gap-5"><div><Link href="/dashboard/sites" className="text-sm text-primary hover:underline">← {t('allSites')}</Link><h1 className="mt-2 font-display text-3xl sm:text-4xl">{site.name}</h1><p className="mt-1 break-all text-sm text-muted-foreground">{site.domain} · {site.status === 'paused' ? p5('paused') : verified ? p5('verified') : p5('unverified')}</p></div><ScoreRing score={site.last_score} label={t('latestScore')} /></div>
    {site.status === 'paused' && <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">{p5('pausedReason', {reason: extra(site.paused_reason === 'plan_limit' ? 'pausePlan' : 'pauseUser')})}</p>}
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(19rem,1fr)]"><section className="rounded-xl border bg-card p-5"><h2 className="text-xl font-semibold">{t('scoreHistory')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('historyDays', {days: historyDays})}</p><div className="mt-4"><ScoreChart points={(scoreScans ?? []).filter((scan) => scan.score !== null).reverse().map((scan) => ({date: scan.completed_at ?? scan.created_at, score: scan.score!}))} /></div></section>
      <section className="space-y-3 rounded-xl border bg-card p-5"><h2 className="text-xl font-semibold">{t('verification')}</h2><p className="text-sm text-muted-foreground">{verified ? t('verificationActive') : t('verificationNeeded')}</p>{site.verification_due_at && <p className="text-sm">{p5('verifyDue', {date: new Date(site.verification_due_at).toLocaleDateString(context.profile.locale)})}</p>}{site.next_scan_at && <p className="text-sm">{t('nextScanAt', {date: new Date(site.next_scan_at).toLocaleString(context.profile.locale)})}</p>}{canEdit && site.status === 'active' && <FirstScanButton siteId={site.id} kind={verified ? 'manual' : 'passive'} />}{!verified && <p className="text-xs text-muted-foreground">{t('passiveOnly')}</p>}</section></div>
    {canEdit && site.status === 'active' && !verified && <VerificationControls site={site} challenge={verifications?.[0] ?? null} />}
    {latest && <FindingsTable siteId={site.id} findings={findings} canEdit={canEdit} canGenerate={hasEntitlement(ownerEntitlements, 'generatedFixes')} />}
    {!latest && <section className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t('noFindingsYet')}</section>}
    <ScanTimeline siteId={site.id} scans={scans ?? []} modules={modules ?? []} canCompare={hasEntitlement(ownerEntitlements, 'scanComparison')} page={scanPage} totalPages={totalScanPages} />
    <div className="flex flex-wrap gap-3"><Link href="/dashboard/reports" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">{t('reports')}</Link>{hasEntitlement(ownerEntitlements, 'scanComparison') && latest && <Link href={`/dashboard/sites/${site.id}/compare?scan=${latest.id}`} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">{t('compareScans')}</Link>}</div>
    <SiteScanSettings site={site} minHours={ownerEntitlements.scan_interval_hours} presence={presence} canEdit={canEdit} verified={verified} />
    {canEdit && <div className="grid gap-6 lg:grid-cols-2"><div><h2 className="mb-3 text-xl font-semibold">{p5('edit')}</h2><SiteForm site={site} /></div><SiteControls site={site} /></div>}
  </div>;
}
