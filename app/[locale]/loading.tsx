import {Skeleton} from '@/components/ui/skeleton';

export default function Loading() {
  return <div className="container space-y-6 py-16" aria-busy="true" aria-live="polite">
    <Skeleton className="h-8 w-40" /><Skeleton className="h-14 max-w-xl" />
    <Skeleton className="h-52 w-full" />
  </div>;
}
