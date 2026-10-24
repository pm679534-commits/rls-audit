import {Skeleton} from '@/components/ui/skeleton';

export default function MarketingLoading() {
  return <div className="container space-y-8 py-16" aria-busy="true">
    <Skeleton className="h-5 w-32" />
    <Skeleton className="h-14 w-full max-w-2xl" />
    <Skeleton className="h-6 w-full max-w-xl" />
    <div className="grid gap-5 md:grid-cols-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-48 rounded-2xl" />)}</div>
  </div>;
}
