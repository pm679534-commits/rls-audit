import type {Metadata} from 'next';
import {getTranslations} from 'next-intl/server';
import {z} from 'zod';
import {unstable_cache} from 'next/cache';
import {createAdminClient} from '@/lib/supabase/admin';
import {AdminEmpty, AdminPager, DateText} from '@/components/admin/primitives';
import {marketingMetadata} from '@/lib/marketing/seo';
import type {Locale} from '@/i18n/routing';

const publicChangelog = unstable_cache(async (page: number) => {
  const now = new Date().toISOString();
  return createAdminClient().from('changelog_entries').select('id,slug,title_en,title_az,body_en,body_az,published_at', {count:'planned'})
    .not('published_at','is',null).lte('published_at',now).order('published_at',{ascending:false}).range((page - 1) * 25, page * 25 - 1);
}, ['siteguard-public-changelog'], {revalidate: 60, tags: ['changelog']});

export async function generateMetadata({params}: {params: Promise<{locale: Locale}>}): Promise<Metadata> {
  const {locale} = await params; const t = await getTranslations({locale, namespace: 'Marketing.seo'});
  return marketingMetadata(locale, 'changelog', t('changelogTitle'), t('changelogDescription'));
}

export default async function ChangelogPage({params,searchParams}: {params: Promise<{locale: string}>; searchParams: Promise<{page?: string}>}) {
  const {locale} = await params;
  const {page: rawPage} = await searchParams;
  const page = z.coerce.number().int().min(1).max(10000).catch(1).parse(rawPage ?? 1);
  const [result, t] = await Promise.all([publicChangelog(page), getTranslations('Phase8')]);
  const {data,count,error} = result;
  if (error) throw new Error('Could not load changelog');
  return <div className="container max-w-3xl py-12 sm:py-16"><h1 className="font-display text-4xl">{t('content.changelog')}</h1><p className="mt-3 text-muted-foreground">{t('content.publicDescription')}</p><div className="mt-10 space-y-8">{data?.length ? data.map((entry) => <article key={entry.id} id={entry.slug} className="border-b pb-8"><p className="text-xs text-muted-foreground"><DateText value={entry.published_at} locale={locale} /></p><h2 className="mt-2 text-2xl font-semibold">{locale === 'az' ? entry.title_az : entry.title_en}</h2><p className="mt-4 whitespace-pre-wrap leading-7 text-muted-foreground">{locale === 'az' ? entry.body_az : entry.body_en}</p></article>) : <AdminEmpty text={t('noResults')} />}</div><AdminPager path="/changelog" page={page} count={count ?? 0} label={t('pages')} /></div>;
}
