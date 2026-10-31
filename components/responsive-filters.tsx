'use client';

import {SlidersHorizontal} from 'lucide-react';
import {Sheet, SheetContent, SheetTitle, SheetTrigger} from '@/components/ui/sheet';

export function ResponsiveFilters({label, children}: {label: string; children: React.ReactNode}) {
  return <>
    <div className="hidden md:block">{children}</div>
    <div className="mb-4 md:hidden"><Sheet><SheetTrigger className="inline-flex min-h-11 items-center gap-2 rounded-md border bg-background px-4 text-sm font-medium"><SlidersHorizontal aria-hidden="true" className="size-4" />{label}</SheetTrigger>
      <SheetContent side="bottom" className="mobile-filter"><SheetTitle className="pr-12 text-lg font-semibold">{label}</SheetTitle>{children}</SheetContent>
    </Sheet></div>
  </>;
}
