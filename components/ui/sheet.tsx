'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {X} from 'lucide-react';
import {useTranslations} from 'next-intl';
import {cn} from '@/lib/utils';

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetPortal = DialogPrimitive.Portal;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;
export function SheetHeader({className, ...props}: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn('flex flex-col gap-2 text-left', className)} {...props} />; }
export function SheetFooter({className, ...props}: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn('mt-auto flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />; }

export const SheetContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {side?: 'left' | 'right'}>(({side = 'right', className, children, ...props}, ref) => {
  const t = useTranslations('Common');
  return <SheetPortal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
    <DialogPrimitive.Content ref={ref} className={cn('fixed inset-y-0 z-50 flex h-full w-[min(88vw,24rem)] flex-col gap-5 border bg-background p-6 shadow-soft data-[state=open]:animate-in data-[state=closed]:animate-out', side === 'right' ? 'right-0 border-l data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right' : 'left-0 border-r data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left', className)} {...props}>
      {children}<DialogPrimitive.Close aria-label={t('close')} className="absolute right-4 top-4 rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><X className="size-5" /></DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </SheetPortal>;
});
SheetContent.displayName = 'SheetContent';
