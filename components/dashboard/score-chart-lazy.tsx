'use client';

import dynamic from 'next/dynamic';
import {Skeleton} from '@/components/ui/skeleton';

const Chart = dynamic(() => import('./score-chart').then((module) => module.ScoreChart), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full rounded-xl" />
});

export function ScoreChartLazy({points}: {points: {date: string; score: number}[]}) {
  return <Chart points={points} />;
}
