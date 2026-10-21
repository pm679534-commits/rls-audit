import {notFound} from 'next/navigation';
import {getLocale, getTranslations} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';
import {requireSiteAccess} from '@/lib/auth';
import {resolveOwnerEntitlements, hasEntitlement} from '@/lib/billing/entitlements';
import {diffScans} from '@/lib/scanner';
import {getPlan} from '@/lib/plans';
import {Link} from '@/i18n/navigation';
import {SeverityBadge} from '@/components/severity-badge';
import type {Tables} from '@/types/database';

export default async function ComparePage({params, searchParams}: {params: Promise<{siteId: string}>; searchParams: Promise<{scan?: string}>}) {
  const {siteId} = await params;
  if (!/^[0-9a-f-]{36}$/i.test(siteId)) notFound();
  const site = await requireSiteAccess(siteId);
  const owner = await resolveOwnerEntitlements(site.owner_id);
  const t = await getTranslations('Phase7');
  const locale = await getLocale();
  if (!hasEntitlement(owner, 'scanComparison')) return <div className="rounded-xl border bg-card p-8"><h1 className="font-display text-3xl">{t('compareScans')}</h1><p className="mt-3 text-muted-foreground">{t('comparisonUpgrade')}</p><Link href="/dashboard/billing" className="mt-4 inline-block font-semibold text-primary underline">{t('upgrade')}</Link></div>;
  const cutoff = new Date(Date.now() - (owner.history_days ?? (owner.effective_plan ? getPlan(owner.effective_plan).limits.historyDays : null) ?? 30) * 86_400_000).toISOString();
  const {scan: requested} = await searchParams;
  if (requested && !/^[0-9a-f-]{36}$/i.test(requested)) notFound();
  const db = await createClient();
  let query = db.from('scans').select('*').eq('site_id', site.id).eq('status', 'completed').gte('created_at', cutoff).order('created_at', {ascending: false}).limit(1);
  if (requested) query = query.eq('id', requested);
  const {data: current} = await query.maybeSingle();
  if (!current) notFound();
  const {data: previous} = await db.from('scans').select('*').eq('site_id', site.id).eq('status', 'completed').gte('created_at', cutoff)
    .lt('created_at', current.created_at).order('created_at', {ascending: false}).limit(1).maybeSingle();
  async function allFindings(scanId: string): Promise<Tables<'findings'>[]> {
    const rows: Tables<'findings'>[] = [];
    for (let offset = 0; ; offset += 500) {
      const {data, error} = await db.from('findings').select('*').eq('scan_id', scanId).order('id').range(offset, offset + 499);
      if (error) throw new Error('Could not load scan comparison');
      rows.push(...(data ?? []));
      if (!data || data.length < 500) return rows;
    }
  }
  const [nowFindings, beforeFindings] = await Promise.all([allFindings(current.id), previous ? allFindings(previous.id) : Promise.resolve([])]);
  const diff = diffScans(nowFindings, beforeFindings, current.score ?? 0, previous?.score ?? null);
  const byFingerprint = new Map([...nowFindings, ...beforeFindings].map((row) => [row.fingerprint, row]));
  const scanner = await getTranslations('Scanner.findings');
  const groups = [
    {label: t('newFindings'), keys: diff.newFingerprints, tone: 'text-destructive'},
    {label: t('resolvedFindings'), keys: diff.resolvedFingerprints, tone: 'text-success'},
    {label: t('unchangedFindings'), keys: diff.persistentFingerprints, tone: 'text-muted-foreground'}
  ];
  return <div className="space-y-6"><Link href={`/dashboard/sites/${site.id}`} className="text-sm text-primary underline">← {site.name}</Link><div><h1 className="font-display text-3xl">{t('compareScans')}</h1><p className="mt-2 text-muted-foreground">{previous ? t('compareDates', {current: new Date(current.created_at).toLocaleDateString(locale), previous: new Date(previous.created_at).toLocaleDateString(locale)}) : t('firstScanComparison')}</p></div>
    <div className="grid gap-4 sm:grid-cols-3"><div className="rounded-xl border bg-card p-5"><span className="text-sm text-muted-foreground">{t('currentScore')}</span><strong className="mt-2 block text-3xl">{current.score ?? '—'}</strong></div><div className="rounded-xl border bg-card p-5"><span className="text-sm text-muted-foreground">{t('previousScore')}</span><strong className="mt-2 block text-3xl">{previous?.score ?? '—'}</strong></div><div className="rounded-xl border bg-card p-5"><span className="text-sm text-muted-foreground">{t('scoreChange')}</span><strong className="mt-2 block text-3xl">{previous?.score !== null && previous?.score !== undefined && current.score !== null ? `${current.score - previous.score >= 0 ? '+' : ''}${current.score - previous.score}` : '—'}</strong></div></div>
    {diff.regression && <p role="status" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm font-medium">{t('regressionDetected')}</p>}
    {groups.map((group) => <section key={group.label} className="rounded-xl border bg-card p-5"><h2 className={`text-lg font-semibold ${group.tone}`}>{group.label} ({group.keys.length})</h2>{group.keys.length ? <ul className="mt-4 divide-y">{group.keys.map((key) => {const row = byFingerprint.get(key); return row && <li key={key} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span>{scanner(`${row.finding_key}.title` as Parameters<typeof scanner>[0])}</span><SeverityBadge severity={row.severity} /></li>;})}</ul> : <p className="mt-3 text-sm text-muted-foreground">{t('noneInGroup')}</p>}</section>)}
  </div>;
}
