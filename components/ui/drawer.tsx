'use client';

import * as React from 'react';
import {Drawer as DrawerPrimitive} from 'vaul';
import {cn} from '@/lib/utils';

export const Drawer = DrawerPrimitive.Root;
export const DrawerTrigger = DrawerPrimitive.Trigger;
export const DrawerClose = DrawerPrimitive.Close;
export const DrawerPortal = DrawerPrimitive.Portal;
export const DrawerContent = React.forwardRef<React.ElementRef<typeof DrawerPrimitive.Content>, React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>>(({className, children, ...props}, ref) =>
  <DrawerPortal><DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" />
    <DrawerPrimitive.Content ref={ref} className={cn('fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col rounded-t-xl border bg-background p-6 shadow-soft', className)} {...props}>
      <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-muted" aria-hidden="true" />{children}
    </DrawerPrimitive.Content>
  </DrawerPortal>
);
DrawerContent.displayName = 'DrawerContent';
export const DrawerTitle = DrawerPrimitive.Title;
export const DrawerDescription = DrawerPrimitive.Description;
export function DrawerHeader({className, ...props}: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn('mb-4 space-y-1.5 text-center', className)} {...props} />; }
export function DrawerFooter({className, ...props}: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn('mt-4 flex flex-col gap-2', className)} {...props} />; }
