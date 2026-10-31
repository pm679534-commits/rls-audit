'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {X} from 'lucide-react';
import {useTranslations} from 'next-intl';
import {cn} from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export const DialogOverlay = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Overlay>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>(({className, ...props}, ref) =>
  <DialogPrimitive.Overlay ref={ref} className={cn('fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0', className)} {...props} />
);
DialogOverlay.displayName = 'DialogOverlay';

export const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>>(({className, children, ...props}, ref) => {
  const t = useTranslations('Common');
  return <DialogPortal><DialogOverlay /><DialogPrimitive.Content ref={ref} className={cn('fixed inset-0 z-50 grid h-dvh w-full max-w-none content-start gap-4 overflow-y-auto border bg-background px-4 pt-[max(3.5rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] shadow-soft duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[90dvh] sm:w-[calc(100%-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:p-6', className)} {...props}>
    {children}<DialogPrimitive.Close className="absolute right-2 top-2 grid size-11 place-items-center rounded-md opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring" aria-label={t('close')}><X className="size-5" /></DialogPrimitive.Close>
  </DialogPrimitive.Content></DialogPortal>;
});
DialogContent.displayName = 'DialogContent';
export function DialogHeader({className, ...props}: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn('flex flex-col gap-1.5 text-center sm:text-left', className)} {...props} />; }
export function DialogFooter({className, ...props}: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />; }
export const DialogTitle = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Title>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(({className, ...props}, ref) => <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold', className)} {...props} />);
DialogTitle.displayName = 'DialogTitle';
export const DialogDescription = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Description>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>>(({className, ...props}, ref) => <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />);
DialogDescription.displayName = 'DialogDescription';
