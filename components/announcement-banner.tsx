import {getLocale, getTranslations} from 'next-intl/server';
import {unstable_cache} from 'next/cache';
import {createAdminClient} from '@/lib/supabase/admin';

const activeAnnouncement = unstable_cache(async () => {
  const now = new Date().toISOString();
  const {data: entries, error} = await createAdminClient().from('announcements').select('id,title_en,title_az,body_en,body_az,link_url')
    .eq('published', true).lte('starts_at', now).or(`ends_at.is.null,ends_at.gt.${now}`).order('starts_at', {ascending: false}).limit(1);
  return error ? null : entries?.[0] ?? null;
}, ['siteguard-active-announcement'], {revalidate: 60});

export async function AnnouncementBanner() {
  const [locale, t, entry] = await Promise.all([getLocale(), getTranslations('Marketing.banner'), activeAnnouncement()]);
  if (!entry) return null;
  const title = locale === 'az' ? entry.title_az : entry.title_en;
  const body = locale === 'az' ? entry.body_az : entry.body_en;
  return <aside aria-label={title} className="border-b border-primary/20 bg-accent px-4 py-3 text-center text-sm"><strong className="mr-2">{title}</strong><span>{body}</span>{entry.link_url && <a href={entry.link_url} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4">{t('read')}</a>}</aside>;
}
