import {getTranslations} from 'next-intl/server';
import {Skeleton} from '@/components/ui/skeleton';

export async function RouteSkeleton({detail = false}: {detail?: boolean}) {
  const t = await getTranslations('Common');
  return <div className="min-w-0 space-y-6" aria-busy="true"><span className="sr-only">{t('loading')}</span>
    <div className="space-y-3"><Skeleton className="h-9 w-56 max-w-full" /><Skeleton className="h-4 w-80 max-w-full" /></div>
    <div className={`grid gap-4 ${detail ? 'lg:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3'}`}>{Array.from({length: detail ? 2 : 3}, (_, index) => <Skeleton key={index} className="h-32 rounded-xl" />)}</div>
    <Skeleton className="h-64 w-full rounded-xl" />
  </div>;
}
