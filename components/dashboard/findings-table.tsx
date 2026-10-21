'use client';

import {useMemo, useState} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from 'next/navigation';
import {SeverityBadge} from '@/components/severity-badge';
import {Drawer, DrawerContent, DrawerDescription, DrawerTitle} from '@/components/ui/drawer';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Link} from '@/i18n/navigation';
import {changeFindingStateAction} from '@/lib/dashboard/actions';
import type {FindingView} from '@/lib/dashboard/findings';

const PAGE_SIZE = 10;
const severityRank = {critical: 0, high: 1, medium: 2, low: 3, info: 4};

export function FindingsTable({siteId, findings, canEdit, canGenerate}: {siteId: string; findings: FindingView[]; canEdit: boolean; canGenerate: boolean}) {
  const t = useTranslations('Phase7');
  const scanner = useTranslations('Scanner.findings');
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState<'severity' | 'newest' | 'oldest'>('severity');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<FindingView | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const title = (item: FindingView) => scanner(`${item.finding_key}.title` as Parameters<typeof scanner>[0]);
  const text = (item: FindingView, field: 'description' | 'impact' | 'fix') => scanner(`${item.finding_key}.${field}` as Parameters<typeof scanner>[0]);
  const filtered = useMemo(() => findings.filter((item) =>
    (severity === 'all' || item.severity === severity) && (status === 'all' || item.state === status) &&
    (!query || `${item.finding_key} ${item.affected_asset ?? ''} ${title(item)}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  ).sort((a, b) => sort === 'newest' ? b.created_at.localeCompare(a.created_at) : sort === 'oldest' ? a.created_at.localeCompare(b.created_at)
    : severityRank[a.severity] - severityRank[b.severity] || b.score_weight - a.score_weight), [findings, query, severity, status, sort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  async function changeState(next: 'open' | 'fixed' | 'ignored' | 'accepted') {
    if (!selected) return;
    setBusy(true); setMessage('');
    const result = await changeFindingStateAction({siteId, findingId: selected.id, status: next, reason});
    setBusy(false);
    if (!result.ok) setMessage(result.error.message);
    else {setSelected({...selected, state: next, reason: reason || null}); setMessage(t('findingSaved')); router.refresh();}
  }
  return <section className="rounded-xl border bg-card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">{t('findings')}</h2><p className="text-sm text-muted-foreground">{t('findingCount', {count: filtered.length})}</p></div></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Input value={query} onChange={(e) => {setQuery(e.target.value); setPage(1);}} placeholder={t('searchFindings')} aria-label={t('searchFindings')} />
      <select value={severity} onChange={(e) => {setSeverity(e.target.value); setPage(1);}} aria-label={t('filterSeverity')} className="rounded-md border bg-background px-3 py-2 text-sm"><option value="all">{t('allSeverities')}</option>{(['critical','high','medium','low','info'] as const).map((value) => <option key={value} value={value}>{t(`severity.${value}`)}</option>)}</select>
      <select value={status} onChange={(e) => {setStatus(e.target.value); setPage(1);}} aria-label={t('filterStatus')} className="rounded-md border bg-background px-3 py-2 text-sm"><option value="all">{t('allStatuses')}</option>{(['open','fixed','ignored','accepted'] as const).map((value) => <option key={value} value={value}>{t(`findingStatus.${value}`)}</option>)}</select>
      <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label={t('sortFindings')} className="rounded-md border bg-background px-3 py-2 text-sm"><option value="severity">{t('sortSeverity')}</option><option value="newest">{t('sortNewest')}</option><option value="oldest">{t('sortOldest')}</option></select></div>
    {rows.length ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[36rem] text-left text-sm"><thead className="border-b text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="py-3 pr-4">{t('finding')}</th><th className="py-3 pr-4">{t('severityLabel')}</th><th className="py-3 pr-4">{t('statusLabel')}</th><th className="py-3">{t('asset')}</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id} className="border-b last:border-0"><td className="py-3 pr-4"><button className="text-left font-medium text-primary hover:underline" onClick={() => {setSelected(item); setReason(item.reason ?? ''); setMessage('');}}>{title(item)}</button></td><td className="py-3 pr-4"><SeverityBadge severity={item.severity} /></td><td className="py-3 pr-4">{t(`findingStatus.${item.state}`)}</td><td className="max-w-48 truncate py-3 text-muted-foreground">{item.affected_asset ?? '—'}</td></tr>)}</tbody></table></div> : <p className="mt-6 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t('noFindings')}</p>}
    {filtered.length > PAGE_SIZE && <div className="mt-4 flex items-center justify-between text-sm"><span>{t('pageOf', {page: currentPage, total: pageCount})}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>{t('previous')}</Button><Button variant="outline" size="sm" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>{t('next')}</Button></div></div>}
    <Drawer open={!!selected} onOpenChange={(open) => {if (!open) setSelected(null);}}><DrawerContent className="mx-auto w-full max-w-3xl"><div className="overflow-y-auto pb-6">{selected && <div className="space-y-5"><div><DrawerTitle className="text-2xl font-semibold">{title(selected)}</DrawerTitle><DrawerDescription className="mt-2">{text(selected, 'description')}</DrawerDescription><div className="mt-3 flex flex-wrap items-center gap-2"><SeverityBadge severity={selected.severity} /><span className="text-sm text-muted-foreground">{t(`findingStatus.${selected.state}`)}</span></div></div>
      <div><h3 className="font-semibold">{t('impact')}</h3><p className="mt-1 text-sm text-muted-foreground">{text(selected, 'impact')}</p></div><div><h3 className="font-semibold">{t('fixSteps')}</h3><p className="mt-1 text-sm text-muted-foreground">{text(selected, 'fix')}</p></div>
      {selected.references.length > 0 && <div><h3 className="font-semibold">{t('references')}</h3><ul className="mt-2 space-y-1 text-sm">{selected.references.map((reference) => <li key={reference}><a href={reference} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline">{reference}</a></li>)}</ul></div>}
      <div><h3 className="font-semibold">{t('evidence')}</h3>{Object.keys(selected.evidence as object).length ? <dl className="mt-2 grid gap-2 rounded-lg bg-muted p-3 text-xs">{Object.entries(selected.evidence as Record<string, unknown>).map(([key, value]) => <div key={key} className="grid grid-cols-[8rem_1fr] gap-2"><dt className="font-medium">{key}</dt><dd className="break-all">{Array.isArray(value) ? value.join(', ') : String(value)}</dd></div>)}</dl> : <p className="mt-2 text-sm text-muted-foreground">{t('noEvidence')}</p>}</div>
      {selected.snippets.length ? <div><h3 className="font-semibold">{t('copyFix')}</h3>{selected.snippets.map((snippet, index) => <div key={`${snippet.language}-${index}`} className="mt-3"><div className="flex items-center justify-between"><span className="text-xs uppercase text-muted-foreground">{snippet.language}</span><Button type="button" variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(snippet.code)}>{t('copy')}</Button></div><pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs"><code>{snippet.code}</code></pre></div>)}</div> : !canGenerate && <p className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">{t('fixUpgrade')} <Link href="/dashboard/billing" className="font-semibold text-primary underline">{t('upgrade')}</Link></p>}
      {selected.reason && <p className="text-sm text-muted-foreground">{t('reason')}: {selected.reason}</p>}
      {canEdit && <div className="space-y-3 border-t pt-4"><h3 className="font-semibold">{t('changeStatus')}</h3><Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} placeholder={t('reasonPlaceholder')} aria-label={t('reason')} /><p className="text-xs text-muted-foreground">{t('reasonRequired')}</p><div className="flex flex-wrap gap-2">{(['open','fixed','ignored','accepted'] as const).map((value) => <Button key={value} variant="outline" disabled={busy || ((value === 'ignored' || value === 'accepted') && !reason.trim())} onClick={() => changeState(value)}>{t(`findingStatus.${value}`)}</Button>)}</div>{message && <p role="status" className="text-sm">{message}</p>}</div>}
    </div>}</div></DrawerContent></Drawer>
  </section>;
}
