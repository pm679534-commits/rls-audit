import {getTranslations, getLocale} from 'next-intl/server';
import {requireAdmin} from '@/lib/auth';
import {adminContent} from '@/lib/admin/data';
import {AdminHeading, AdminSection, AdminEmpty, AdminPager, DateText} from '@/components/admin/primitives';
import {AdminActionButton, AdminForm} from '@/components/admin/controls';

export default async function AdminContentPage({searchParams}: {searchParams: Promise<{page?: string}>}) {
  await requireAdmin();
  const [data,t] = await Promise.all([adminContent(await searchParams),getTranslations('Phase8')]);
  const locale = await getLocale();
  const announcementFields = (entry?: (typeof data.announcements)[number]) => [
    {name:'title_en',label:t('content.titleEn'),value:entry?.title_en,required:true},
    {name:'title_az',label:t('content.titleAz'),value:entry?.title_az,required:true},
    {name:'body_en',label:t('content.bodyEn'),type:'textarea' as const,value:entry?.body_en,required:true},
    {name:'body_az',label:t('content.bodyAz'),type:'textarea' as const,value:entry?.body_az,required:true},
    {name:'link_url',label:t('content.link'),type:'url' as const,value:entry?.link_url},
    {name:'starts_at',label:t('content.starts'),type:'datetime-local' as const,value:entry?.starts_at ?? new Date().toISOString(),required:true},
    {name:'ends_at',label:t('content.ends'),type:'datetime-local' as const,value:entry?.ends_at},
    {name:'published',label:t('content.published'),type:'checkbox' as const,value:entry?.published ?? false}
  ];
  const changelogFields = (entry?: (typeof data.changelog)[number]) => [
    {name:'slug',label:t('content.slug'),value:entry?.slug,required:true},
    {name:'title_en',label:t('content.titleEn'),value:entry?.title_en,required:true},
    {name:'title_az',label:t('content.titleAz'),value:entry?.title_az,required:true},
    {name:'body_en',label:t('content.bodyEn'),type:'textarea' as const,value:entry?.body_en,required:true},
    {name:'body_az',label:t('content.bodyAz'),type:'textarea' as const,value:entry?.body_az,required:true},
    {name:'published',label:t('content.published'),type:'checkbox' as const,value:!!entry?.published_at}
  ];
  return <div className="space-y-6"><AdminHeading eyebrow={t('panel')} title={t('content.title')} description={t('content.description')} />
    <AdminSection title={t('content.announcements')}><details className="mb-5 rounded-lg border p-4"><summary className="cursor-pointer font-medium">{t('content.newAnnouncement')}</summary><div className="mt-4"><AdminForm kind="announcement_save" fields={announcementFields()} submitLabel={t('save')} successLabel={t('saved')} /></div></details>{data.announcements.length ? <div className="space-y-3">{data.announcements.map((entry) => <details key={entry.id} className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">{entry.title_en} <span className="ml-2 text-xs text-muted-foreground">{entry.published ? t('content.published') : t('content.draft')}</span></summary><div className="mt-4"><AdminForm kind="announcement_save" fixed={{id:entry.id}} fields={announcementFields(entry)} submitLabel={t('save')} successLabel={t('saved')} /><div className="mt-3"><AdminActionButton payload={{kind:'announcement_delete',id:entry.id}} label={t('delete')} confirmMessage={t('deleteConfirm')} destructive /></div></div></details>)}</div> : <AdminEmpty text={t('noResults')} />}</AdminSection>
    <AdminSection title={t('content.changelog')}><details className="mb-5 rounded-lg border p-4"><summary className="cursor-pointer font-medium">{t('content.newChangelog')}</summary><div className="mt-4"><AdminForm kind="changelog_save" fields={changelogFields()} submitLabel={t('save')} successLabel={t('saved')} /></div></details>{data.changelog.length ? <div className="space-y-3">{data.changelog.map((entry) => <details key={entry.id} className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">{entry.title_en} <span className="ml-2 text-xs text-muted-foreground">{entry.published_at ? <DateText value={entry.published_at} locale={locale} /> : t('content.draft')}</span></summary><div className="mt-4"><AdminForm kind="changelog_save" fixed={{id:entry.id}} fields={changelogFields(entry)} submitLabel={t('save')} successLabel={t('saved')} /><div className="mt-3"><AdminActionButton payload={{kind:'changelog_delete',id:entry.id}} label={t('delete')} confirmMessage={t('deleteConfirm')} destructive /></div></div></details>)}</div> : <AdminEmpty text={t('noResults')} />}</AdminSection>
    <AdminPager path="/admin/content" page={data.filter.page} count={data.count} label={t('pages')} />
  </div>;
}
