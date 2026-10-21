import type {Metadata} from 'next';
import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {getSiteUrl} from '@/lib/config';
import {marketingMetadata} from '@/lib/marketing/seo';
import type {Locale} from '@/i18n/routing';

export async function generateMetadata({params}: {params: Promise<{locale: Locale}>}): Promise<Metadata> {
  const {locale} = await params; const t = await getTranslations({locale, namespace: 'Phase9.docs'});
  return marketingMetadata(locale, 'docs', t('title'), t('intro'));
}

const endpoints = [
  ['GET', '/api/v1/sites', 'sites:read'], ['POST', '/api/v1/sites/{siteId}/scans', 'scans:write'],
  ['GET', '/api/v1/scans/{scanId}', 'scans:read'], ['GET', '/api/v1/scans/{scanId}/findings', 'scans:read'],
  ['GET', '/api/v1/sites/{siteId}/score', 'sites:read'], ['POST', '/api/v1/exports', 'exports:read'],
  ['GET', '/api/v1/exports/{id}', 'exports:read'], ['POST', '/api/v1/ci', 'ci:write']
] as const;

export default async function DocsPage() {
  const t = await getTranslations('Phase9.docs');
  const workflow = ['name: SiteGuard security gate', 'on: [push, pull_request]', 'jobs:', '  siteguard:', '    runs-on: ubuntu-latest', '    steps:', '      - name: Check latest security scan',
    '        env:', '          SITEGUARD_API_KEY: ${{ secrets.SITEGUARD_API_KEY }}', '          SITEGUARD_SITE_ID: ${{ secrets.SITEGUARD_SITE_ID }}',
    '        run: |', `          curl --fail-with-body --show-error --silent --request POST '${getSiteUrl('/api/v1/ci')}' \\`,
    '            --header "Authorization: Bearer $SITEGUARD_API_KEY" \\', '            --header "Content-Type: application/json" \\',
    '            --data "{\\"siteId\\":\\"$SITEGUARD_SITE_ID\\",\\"minScore\\":80,\\"maxCritical\\":0}"'].join('\n');
  return <main className="container max-w-5xl space-y-12 py-14 sm:py-20">
    <header className="max-w-3xl"><p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">{t('eyebrow')}</p><h1 className="mt-4 font-display text-5xl">{t('title')}</h1><p className="mt-5 text-lg text-muted-foreground">{t('intro')}</p>
      <a href="/api/v1/openapi.json" className="mt-6 inline-block rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{t('openapi')}</a></header>
    <div className="grid gap-8 md:grid-cols-2"><section className="rounded-2xl border bg-card p-7"><h2 className="text-2xl font-semibold">{t('authentication')}</h2><p className="mt-3 text-muted-foreground">{t('authBody')}</p><Link href="/dashboard/api-keys" className="mt-4 inline-block text-sm font-medium text-primary underline">{t('apiKeys')} →</Link></section>
      <section className="rounded-2xl border bg-card p-7"><h2 className="text-2xl font-semibold">{t('plans')}</h2><p className="mt-3 text-muted-foreground">{t('pro')}</p><p className="mt-3 text-muted-foreground">{t('agency')}</p></section></div>
    <section><h2 className="mb-5 font-display text-3xl">{t('endpoints')}</h2><div className="overflow-x-auto rounded-2xl border bg-card"><table className="w-full min-w-[650px] text-left text-sm"><thead className="border-b bg-muted/50"><tr><th className="p-4">HTTP</th><th className="p-4">{t('path')}</th><th className="p-4">{t('scope')}</th></tr></thead><tbody>{endpoints.map(([method, path, scope]) => <tr key={path} className="border-b last:border-0"><td className="p-4 font-semibold text-primary">{method}</td><td className="p-4 font-mono">{path}</td><td className="p-4 font-mono text-muted-foreground">{scope}</td></tr>)}</tbody></table></div></section>
    <section className="rounded-2xl border bg-card p-7"><h2 className="text-2xl font-semibold">{t('rateLimits')}</h2><p className="mt-3 text-muted-foreground">{t('rateBody')}</p></section>
    <section className="rounded-2xl border bg-card p-7"><h2 className="text-2xl font-semibold">{t('webhookTitle')}</h2><p className="mt-3 text-muted-foreground">{t('webhookBody')}</p><code className="mt-4 block overflow-x-auto rounded-lg bg-muted p-3 text-sm">sha256=HMAC_SHA256(secret, timestamp + &quot;.&quot; + rawBody)</code></section>
    <section className="space-y-4"><h2 className="font-display text-3xl">{t('ci')}</h2><p className="max-w-3xl text-muted-foreground">{t('ciBody')}</p><p className="text-sm font-medium">{t('threshold')}</p><pre className="overflow-x-auto rounded-2xl border bg-slate-950 p-6 text-sm leading-6 text-slate-100"><code>{workflow}</code></pre></section>
  </main>;
}
