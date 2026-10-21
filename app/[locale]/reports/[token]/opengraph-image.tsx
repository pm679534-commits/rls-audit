import {ImageResponse} from 'next/og';
import {notFound} from 'next/navigation';
import {getPublicReport} from '@/lib/reports';
import en from '@/messages/en.json';
import az from '@/messages/az.json';

export const runtime = 'nodejs';
export const alt = 'SiteGuard shared security report';
export const size = {width: 1200, height: 630};
export const contentType = 'image/png';
export default async function ReportOpenGraphImage({params}: {params: Promise<{token: string; locale: string}>}) {
  const {token, locale} = await params;
  let report;
  try { report = await getPublicReport(token); } catch { notFound(); }
  const copy = locale === 'az' ? az.Phase9.og : en.Phase9.og;
  const score = report.scan.score ?? 0;
  const color = score >= 80 ? '#3dd6a3' : score >= 50 ? '#f8c66a' : '#ff817e';
  return new ImageResponse(<div style={{width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center',
    padding: 80, background: '#082b34', color: '#fff', fontFamily: 'sans-serif'}}>
    <div style={{fontSize: 25, color: '#92c6bc'}}>SITEGUARD · {copy.shared}</div>
    <div style={{fontSize: 62, fontWeight: 700, marginTop: 28}}>{report.site.name.slice(0, 70)}</div>
    <div style={{fontSize: 28, color: '#b6d5d0', marginTop: 12}}>{report.site.domain}</div>
    <div style={{fontSize: 90, fontWeight: 800, color, marginTop: 36}}>{score}<span style={{fontSize: 34}}>/100</span></div>
  </div>, size);
}
