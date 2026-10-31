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

export const SheetContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {side?: 'left' | 'right' | 'bottom'}>(({side = 'right', className, children, ...props}, ref) => {
  const t = useTranslations('Common');
  return <SheetPortal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
    <DialogPrimitive.Content ref={ref} className={cn('fixed z-50 flex flex-col gap-5 overflow-y-auto border bg-background px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-soft data-[state=open]:animate-in data-[state=closed]:animate-out', side === 'bottom' ? 'inset-x-0 bottom-0 max-h-[90dvh] w-full rounded-t-2xl border-t data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom' : 'inset-y-0 h-dvh w-[min(88vw,24rem)]', side === 'right' ? 'right-0 border-l data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right' : side === 'left' ? 'left-0 border-r data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left' : '', className)} {...props}>
      {children}<DialogPrimitive.Close aria-label={t('close')} className="absolute right-2 top-2 grid size-11 place-items-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><X className="size-5" /></DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </SheetPortal>;
});
SheetContent.displayName = 'SheetContent';
