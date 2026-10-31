'use client';

import dynamic from 'next/dynamic';
import {Skeleton} from '@/components/ui/skeleton';

const Widget = dynamic(() => import('./passive-check').then((module) => module.PassiveCheck), {
  ssr: false,
  loading: () => <Skeleton className="h-80 w-full rounded-2xl" />
});

export function PassiveCheckLazy(props: {turnstileKey?: string; nonce?: string}) {
  return <Widget {...props} />;
}
