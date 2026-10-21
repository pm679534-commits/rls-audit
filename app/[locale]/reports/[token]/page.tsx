import {notFound} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {getPublicReport} from '@/lib/reports';
import {ScoreRing} from '@/components/score-ring';
import {SeverityBadge} from '@/components/severity-badge';
import {Link} from '@/i18n/navigation';
import {BRAND_NAME} from '@/lib/config';
import type {Metadata} from 'next';
import en from '@/messages/en.json';
import az from '@/messages/az.json';

export async function generateMetadata({params}: {params: Promise<{token: string; locale: string}>}): Promise<Metadata> {
  const {token, locale} = await params;
  try {
    const report = await getPublicReport(token);
    return {title: `${report.site.name} · ${(locale === 'az' ? az : en).Phase9.report.title}`, robots: {index: false, follow: false, nocache: true}, referrer: 'no-referrer'};
  } catch { return {title: 'Report unavailable', robots: {index: false, follow: false, nocache: true}}; }
}

export default async function PublicReportPage({params}: {params: Promise<{token: string; locale: string}>}) {
  const {token, locale} = await params;
  let report;
  try { report = await getPublicReport(token); } catch { notFound(); }
  const t = await getTranslations('Phase7');
  const scanner = await getTranslations('Scanner.findings');
  return <main className="mx-auto max-w-3xl space-y-7 px-4 py-12 sm:py-20"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">{BRAND_NAME}</p><h1 className="mt-2 font-display text-3xl">{t('publicReportTitle', {site: report.site.name})}</h1><p className="mt-2 text-sm text-muted-foreground">{report.site.domain} · {report.scan.completed_at ? new Date(report.scan.completed_at).toLocaleDateString(locale) : ''}</p></div><ScoreRing score={report.scan.score} label={t('securityScore')} /></div><p className="rounded-xl border bg-muted/50 p-4 text-sm text-muted-foreground">{t('redactedReport')}</p>
    <section className="rounded-xl border bg-card p-5"><h2 className="text-xl font-semibold">{t('findings')}</h2>{report.findings.length ? <ul className="mt-4 divide-y">{report.findings.map((finding, index) => <li key={`${finding.finding_key}:${index}`} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span>{scanner(`${finding.finding_key}.title` as Parameters<typeof scanner>[0])}</span><SeverityBadge severity={finding.severity} /></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">{t('noFindings')}</p>}</section><Link href="/" className="inline-block text-sm font-medium text-primary underline">{t('poweredBy', {brand: BRAND_NAME})}</Link></main>;
}
