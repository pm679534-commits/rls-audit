'use client';

import {useEffect} from 'react';
import {useLocale, useTranslations} from 'next-intl';
import {useRouter} from 'next/navigation';
import {Link} from '@/i18n/navigation';
import {Button} from '@/components/ui/button';
import type {Tables} from '@/types/database';

type Scan = Pick<Tables<'scans'>, 'id' | 'status' | 'kind' | 'score' | 'created_at' | 'completed_at' | 'summary'>;
type Module = Pick<Tables<'scan_modules_results'>, 'module_key' | 'status'>;

export function ScanTimeline({siteId, scans, modules, canCompare, page, totalPages}: {siteId: string; scans: Scan[]; modules: Module[]; canCompare: boolean; page: number; totalPages: number}) {
  const t = useTranslations('Phase7');
  const locale = useLocale();
  const p5 = useTranslations('Phase5Labels');
  const router = useRouter();
  const activeScanId = scans.find((scan) => scan.status === 'queued' || scan.status === 'running')?.id;
  const active = !!activeScanId;
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => router.refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [active, router]);
  return <section className="rounded-xl border bg-card p-5" aria-live={active ? 'polite' : 'off'}><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{t('scanTimeline')}</h2>{active && <span className="inline-flex items-center gap-2 text-xs font-medium text-primary"><span className="size-2 animate-pulse rounded-full bg-primary" />{t('liveProgress')}</span>}</div>
    {scans.length ? <ol className="mt-4 divide-y">{scans.map((scan) => <li key={scan.id} className="py-4 first:pt-0"><div className="flex flex-wrap items-center justify-between gap-2 text-sm"><div><time dateTime={scan.created_at} className="font-medium">{new Date(scan.created_at).toLocaleString(locale)}</time><span className="ml-2 text-muted-foreground">{p5(`kind.${scan.kind}`)}</span></div><span className="font-medium">{p5(`status.${scan.status}`)} {scan.score !== null ? `· ${scan.score}/100` : ''}</span></div>
      {activeScanId === scan.id && modules.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{modules.map((module) => <span key={module.module_key} className="rounded-full border bg-muted px-2 py-1 text-xs">{['general-web','nextjs','supabase'].includes(module.module_key) ? t(`module.${module.module_key as 'general-web'|'nextjs'|'supabase'}`) : module.module_key}: {p5(`status.${module.status as 'queued'|'running'|'completed'|'failed'|'canceled'}`)}</span>)}</div>}
      {canCompare && scan.status === 'completed' && <Link href={`/dashboard/sites/${siteId}/compare?scan=${scan.id}`} className="mt-2 inline-block text-xs font-medium text-primary underline">{t('compareScans')}</Link>}
    </li>)}</ol> : <p className="mt-4 text-sm text-muted-foreground">{t('noScans')}</p>}
    {totalPages > 1 && <nav className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-4" aria-label={t('scanTimeline')}><span className="text-xs text-muted-foreground">{t('pageOf', {page, total: totalPages})}</span><div className="flex gap-2">{page > 1 && <Button asChild variant="outline" size="sm"><Link href={`/dashboard/sites/${siteId}?scanPage=${page - 1}`}>{t('previous')}</Link></Button>}{page < totalPages && <Button asChild variant="outline" size="sm"><Link href={`/dashboard/sites/${siteId}?scanPage=${page + 1}`}>{t('next')}</Link></Button>}</div></nav>}
  </section>;
}
