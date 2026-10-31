import 'server-only';

import {Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer, type TextProps} from '@react-pdf/renderer';
import {join} from 'node:path';
import type {Tables} from '@/types/database';
import type {Locale} from '@/i18n/routing';
import en from '@/messages/en.json';
import az from '@/messages/az.json';

Font.register({family: 'InterPDF', fonts: [
  {src: join(process.cwd(), 'public', 'fonts', 'inter-pdf-regular.woff2'), fontWeight: 400},
  {src: join(process.cwd(), 'public', 'fonts', 'inter-pdf-bold.woff2'), fontWeight: 700}
]});
const styles = StyleSheet.create({page: {padding: 40, fontFamily: 'InterPDF', fontSize: 10, color: '#172a35'},
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24},
  brand: {fontSize: 21, fontWeight: 700}, logo: {width: 90, height: 40, objectFit: 'contain'},
  title: {fontSize: 27, fontWeight: 700, marginBottom: 8}, muted: {color: '#526674', marginBottom: 12},
  score: {fontSize: 36, fontWeight: 700, marginVertical: 16}, item: {borderTop: '1 solid #dce5e8', paddingVertical: 12},
  finding: {fontSize: 13, fontWeight: 700, marginBottom: 4}, label: {fontWeight: 700, marginTop: 6}});

function PdfText({value, style}: {value: string; style?: TextProps['style']}) {
  return <Text style={style}>{value}</Text>;
}

export async function renderReportPdf(input: {site: Tables<'sites'>; scan: Tables<'scans'>; findings: Tables<'findings'>[];
  locale: Locale; brand?: {name: string; color: string; logo?: string}}): Promise<Buffer> {
  const copy = (input.locale === 'az' ? az : en).Phase9.report;
  const findingCopy = (input.locale === 'az' ? az : en).Scanner.findings as Record<string, {title: string; description: string; impact: string; fix: string}>;
  const accent = input.brand?.color ?? '#117d78';
  const document = <Document title={`${input.site.name} · ${copy.title}`} author={input.brand?.name ?? 'SiteGuard'}>
    <Page size="A4" style={styles.page}>
      <View style={styles.header}><PdfText style={[styles.brand, {color: accent}]} value={input.brand?.name ?? 'SiteGuard'} />{input.brand?.logo && <Image src={input.brand.logo} style={styles.logo} />}</View>
      <PdfText style={styles.title} value={copy.title} />
      <PdfText style={styles.muted} value={`${input.site.name} · ${input.site.domain} · ${new Date(input.scan.completed_at ?? input.scan.created_at).toLocaleDateString(input.locale)}`} />
      <PdfText style={[styles.score, {color: accent}]} value={`${input.scan.score ?? '—'} / 100`} />
      <PdfText style={styles.muted} value={`${copy.findings}: ${input.findings.length}`} />
      {input.findings.map((finding) => {
        const item = findingCopy[finding.finding_key];
        return <View key={finding.id} style={styles.item} wrap={false}>
          <PdfText style={styles.finding} value={`${item?.title ?? finding.finding_key} · ${finding.severity.toUpperCase()}`} />
          {finding.affected_asset && <PdfText style={styles.muted} value={finding.affected_asset.slice(0, 220)} />}
          <PdfText value={item?.description ?? ''} />
          <PdfText style={styles.label} value={copy.impact} /><PdfText value={item?.impact ?? ''} />
          <PdfText style={styles.label} value={copy.fix} /><PdfText value={item?.fix ?? ''} />
        </View>;
      })}
      <PdfText style={styles.muted} value={`${copy.generated}: ${new Date().toLocaleString(input.locale)}`} />
    </Page>
  </Document>;
  return renderToBuffer(document as Parameters<typeof renderToBuffer>[0]);
}
