import {Skeleton} from '@/components/ui/skeleton';
import {getTranslations} from 'next-intl/server';

export default async function DashboardLoading() {
  const t = await getTranslations('Common');
  return <div className="space-y-7" aria-busy="true"><span className="sr-only">{t('loading')}</span>
    <div className="space-y-3"><Skeleton className="h-9 w-64" /><Skeleton className="h-4 w-96 max-w-full" /></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({length: 4}, (_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}</div>
    <div className="grid gap-6 lg:grid-cols-2"><Skeleton className="h-72 rounded-xl" /><Skeleton className="h-72 rounded-xl" /></div>
    <Skeleton className="h-48 rounded-xl" />
  </div>;
}
