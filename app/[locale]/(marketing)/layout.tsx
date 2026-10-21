import {MarketingShell} from '@/components/shells/marketing-shell';
import {AnnouncementBanner} from '@/components/announcement-banner';
import {getTranslations} from 'next-intl/server';

export default async function MarketingLayout({children}: {children: React.ReactNode}) {
  const t = await getTranslations('Nav');
  return <MarketingShell navigation={[
    {href:'/features',label:t('features')}, {href:'/how-it-works',label:t('howItWorks')},
    {href:'/pricing',label:t('pricing')}, {href:'/security',label:t('security')},
    {href:'/changelog',label:t('changelog')}, {href:'/contact',label:t('contact')}
  ]}><AnnouncementBanner />{children}</MarketingShell>;
}
