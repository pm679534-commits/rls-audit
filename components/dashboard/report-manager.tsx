'use client';

import {useEffect, useState} from 'react';
import {useLocale, useTranslations} from 'next-intl';
import {useRouter} from 'next/navigation';
import {Button} from '@/components/ui/button';
import {createShareLinkAction, revokeShareLinkAction, requestReportExportAction} from '@/lib/reports/actions';
import type {Tables} from '@/types/database';
import {BRAND_NAME} from '@/lib/config';
import {Link} from '@/i18n/navigation';

type Site = Pick<Tables<'sites'>, 'id' | 'name' | 'domain' | 'owner_id' | 'last_score'>;
type Scan = Pick<Tables<'scans'>, 'id' | 'site_id' | 'score' | 'completed_at' | 'created_at'>;
type ShareLink = Pick<Tables<'share_links'>, 'id' | 'site_id' | 'scan_id' | 'created_at' | 'expires_at' | 'revoked_at' | 'last_accessed_at'>;
type ExportRow = Pick<Tables<'data_exports'>, 'id' | 'format' | 'status' | 'created_at' | 'storage_path'>;

export function ReportManager({sites, scans, links, exports: exportRows, siteGates, readOnly, baseUrl, page, hasNext}: {sites: Site[]; scans: Scan[]; links: ShareLink[]; exports: ExportRow[];
  siteGates: Record<string, {edit: boolean; pdf: boolean; data: boolean; badge: boolean; historyDays: number}>; readOnly: boolean; baseUrl: string; page: number; hasNext: boolean}) {
  const t = useTranslations('Phase7');
  const statuses = useTranslations('Phase5Labels.exportStatus');
  const locale = useLocale();
  const router = useRouter();
  const [siteId, setSiteId] = useState(sites[0]?.id ?? '');
  const availableScans = scans.filter((scan) => scan.site_id === siteId);
  const [scanId, setScanId] = useState(availableScans[0]?.id ?? '');
  const [newToken, setNewToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const selectedScan = availableScans.some((scan) => scan.id === scanId) ? scanId : availableScans[0]?.id ?? '';
  const canPdf = !!siteGates[siteId]?.pdf;
  const canDataExport = !!siteGates[siteId]?.data;
  const canBadge = !!siteGates[siteId]?.badge;
  const canEdit = !!siteGates[siteId]?.edit && !readOnly;
  useEffect(() => {
    if (!exportRows.some((item) => item.status === 'queued' || item.status === 'processing')) return;
    const timer = window.setInterval(() => router.refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [exportRows, router]);
  async function share() {
    setBusy(true); setMessage(''); setNewToken('');
    const result = await createShareLinkAction({siteId, scanId: selectedScan});
    setBusy(false);
    if (!result.ok) setMessage(result.error.message);
    else {setNewToken(result.data.token); setMessage(t('linkCreated')); router.refresh();}
  }
  async function revoke(id: string) {
    setBusy(true); const result = await revokeShareLinkAction({id}); setBusy(false);
    setMessage(result.ok ? t('linkRevoked') : result.error.message); if (result.ok) router.refresh();
  }
  async function exportReport(format: 'pdf' | 'csv' | 'json') {
    setBusy(true); setMessage('');
    const result = await requestReportExportAction({siteId, scanId: selectedScan, format});
    setBusy(false);
    setMessage(result.ok ? t('exportQueued') : result.error.message); if (result.ok) router.refresh();
  }
  const shareUrl = newToken ? `${baseUrl}/${locale}/reports/${newToken}` : '';
  const badgeUrl = newToken ? `${baseUrl}/api/badge/${newToken}?lang=${locale}` : '';
  return <div className="space-y-6"><section className="rounded-xl border bg-card p-5"><h2 className="text-xl font-semibold">{t('prepareReport')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('selectCompletedScan')}</p>{sites.length && scans.length ? <><div className="mt-4 grid gap-3 sm:grid-cols-2"><select aria-label={t('selectSite')} value={siteId} onChange={(e) => {setSiteId(e.target.value); setScanId(scans.find((scan) => scan.site_id === e.target.value)?.id ?? ''); setNewToken('');}} className="rounded-md border bg-background px-3 py-2 text-sm">{sites.map((site) => <option key={site.id} value={site.id}>{site.name} · {site.domain}</option>)}</select><select aria-label={t('selectScan')} value={selectedScan} onChange={(e) => {setScanId(e.target.value); setNewToken('');}} className="rounded-md border bg-background px-3 py-2 text-sm">{availableScans.map((scan) => <option key={scan.id} value={scan.id}>{new Date(scan.completed_at ?? scan.created_at).toLocaleString(locale)} · {scan.score ?? '—'}/100</option>)}</select></div>
      {selectedScan && <div className="mt-4 flex flex-wrap gap-2"><Button disabled={busy || !canEdit} onClick={share}>{t('createShareLink')}</Button><Button variant="outline" disabled={busy || !canEdit || !canPdf} onClick={() => exportReport('pdf')}>{t('exportPdf')}</Button><Button variant="outline" disabled={busy || !canEdit || !canDataExport} onClick={() => exportReport('csv')}>{t('exportCsv')}</Button><Button variant="outline" disabled={busy || !canEdit || !canDataExport} onClick={() => exportReport('json')}>{t('exportJson')}</Button></div>}{(!canPdf || !canDataExport) && <p className="mt-3 text-xs text-muted-foreground">{t('reportPlanGates')}</p>}{!canEdit && <p className="mt-3 text-xs text-muted-foreground">{t('reportViewOnly')}</p>}</> : <p className="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t('noReportScans')}</p>}
      {message && <p role="status" className="mt-3 text-sm">{message}</p>}
      {newToken && <div className="mt-5 rounded-lg border border-primary/30 bg-primary/5 p-4"><strong>{t('copyLinkNow')}</strong><p className="mt-1 break-all text-xs">{shareUrl}</p><Button className="mt-3" variant="outline" onClick={() => navigator.clipboard.writeText(shareUrl)}>{t('copy')}</Button>{canBadge && <div className="mt-4"><p className="text-sm font-medium">{t('badgeSnippet')}</p><code className="mt-2 block break-all rounded bg-background p-3 text-xs">{`![${BRAND_NAME} ${t('securityScore')}](${badgeUrl})`}</code><Button className="mt-3" variant="outline" onClick={() => navigator.clipboard.writeText(`![${BRAND_NAME} ${t('securityScore')}](${badgeUrl})`)}>{t('copy')}</Button></div>}</div>}
    </section>
    <section className="rounded-xl border bg-card p-5"><h2 className="text-xl font-semibold">{t('sharedLinks')}</h2>{links.length ? <ul className="mt-4 divide-y">{links.map((link) => <li key={link.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><p>{sites.find((site) => site.id === link.site_id)?.name ?? t('site')} · {new Date(link.created_at).toLocaleDateString(locale)}</p><p className="text-xs text-muted-foreground">{link.revoked_at ? t('revoked') : link.expires_at && new Date(link.expires_at).getTime() <= Date.now() ? t('expired') : t('active')} · {t('expiresAt', {date: link.expires_at ? new Date(link.expires_at).toLocaleDateString(locale) : '—'})}</p></div>{!link.revoked_at && <Button variant="outline" size="sm" disabled={busy || !siteGates[link.site_id]?.edit || readOnly} onClick={() => revoke(link.id)}>{t('revoke')}</Button>}</li>)}</ul> : <p className="mt-4 text-sm text-muted-foreground">{t('noShareLinks')}</p>}</section>
    <section className="rounded-xl border bg-card p-5"><h2 className="text-xl font-semibold">{t('exportRequests')}</h2>{exportRows.length ? <ul className="mt-4 divide-y">{exportRows.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span>{item.format.toUpperCase()} · {statuses(item.status)} · {new Date(item.created_at).toLocaleString(locale)}</span>{item.status === 'completed' && item.storage_path && <a href={`/api/account/export/${item.id}`} className="font-medium text-primary underline">{t('download')}</a>}</li>)}</ul> : <p className="mt-4 text-sm text-muted-foreground">{t('noExportRequests')}</p>}</section>
    {(page > 1 || hasNext) && <nav aria-label={t('reportPages')} className="flex items-center justify-between gap-3 text-sm"><span>{t('pageNumber', {page})}</span><div className="flex gap-2">{page > 1 && <Link href={'/dashboard/reports?page=' + String(page - 1)} className="inline-flex min-h-11 items-center rounded-md border px-4">{t('previous')}</Link>}{hasNext && <Link href={'/dashboard/reports?page=' + String(page + 1)} className="inline-flex min-h-11 items-center rounded-md border px-4">{t('next')}</Link>}</div></nav>}
  </div>;
}
