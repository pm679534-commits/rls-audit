import type {Metadata} from 'next';
import {getTranslations} from 'next-intl/server';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {AdminEmpty, AdminPager, DateText} from '@/components/admin/primitives';
import {marketingMetadata} from '@/lib/marketing/seo';
import type {Locale} from '@/i18n/routing';

export async function generateMetadata({params}: {params: Promise<{locale: Locale}>}): Promise<Metadata> {
  const {locale} = await params; const t = await getTranslations({locale, namespace: 'Marketing.seo'});
  return marketingMetadata(locale, 'changelog', t('changelogTitle'), t('changelogDescription'));
}

export default async function ChangelogPage({params,searchParams}: {params: Promise<{locale: string}>; searchParams: Promise<{page?: string}>}) {
  const {locale} = await params;
  const {page: rawPage} = await searchParams;
  const page = z.coerce.number().int().min(1).max(10000).catch(1).parse(rawPage ?? 1);
  const now = new Date().toISOString();
  const {data,count,error} = await (await createClient()).from('changelog_entries').select('id,slug,title_en,title_az,body_en,body_az,published_at', {count:'exact'})
    .not('published_at','is',null).lte('published_at',now).order('published_at',{ascending:false}).range((page - 1) * 25, page * 25 - 1);
  if (error) throw new Error('Could not load changelog');
  const t = await getTranslations('Phase8');
  return <div className="container max-w-3xl py-12 sm:py-16"><h1 className="font-display text-4xl">{t('content.changelog')}</h1><p className="mt-3 text-muted-foreground">{t('content.publicDescription')}</p><div className="mt-10 space-y-8">{data?.length ? data.map((entry) => <article key={entry.id} id={entry.slug} className="border-b pb-8"><p className="text-xs text-muted-foreground"><DateText value={entry.published_at} locale={locale} /></p><h2 className="mt-2 text-2xl font-semibold">{locale === 'az' ? entry.title_az : entry.title_en}</h2><p className="mt-4 whitespace-pre-wrap leading-7 text-muted-foreground">{locale === 'az' ? entry.body_az : entry.body_en}</p></article>) : <AdminEmpty text={t('noResults')} />}</div><AdminPager path="/changelog" page={page} count={count ?? 0} label={t('pages')} /></div>;
}
