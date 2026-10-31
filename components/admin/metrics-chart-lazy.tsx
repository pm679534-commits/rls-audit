'use client';

import dynamic from 'next/dynamic';
import {Skeleton} from '@/components/ui/skeleton';

const Chart = dynamic(() => import('./metrics-chart').then((module) => module.AdminMetricsChart), {
  ssr: false,
  loading: () => <Skeleton className="h-72 w-full rounded-xl" />
});

export function AdminMetricsChartLazy(props: {points: {day: string; signups: number; scans: number; failed: number}[]; signups: string; scans: string; failed: string}) {
  return <Chart {...props} />;
}
