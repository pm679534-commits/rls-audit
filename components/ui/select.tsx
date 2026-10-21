'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import {Check, ChevronDown, ChevronUp} from 'lucide-react';
import {cn} from '@/lib/utils';

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;
export const SelectTrigger = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>>(({className, children, ...props}, ref) => <SelectPrimitive.Trigger ref={ref} className={cn('flex h-11 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 [&>span]:line-clamp-1', className)} {...props}>{children}<SelectPrimitive.Icon asChild><ChevronDown className="size-4 opacity-60" /></SelectPrimitive.Icon></SelectPrimitive.Trigger>);
SelectTrigger.displayName = 'SelectTrigger';
export const SelectContent = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Content>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>>(({className, children, position = 'popper', ...props}, ref) => <SelectPrimitive.Portal><SelectPrimitive.Content ref={ref} position={position} className={cn('relative z-50 min-w-32 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-soft', className)} {...props}><SelectPrimitive.ScrollUpButton className="flex justify-center py-1"><ChevronUp className="size-4" /></SelectPrimitive.ScrollUpButton><SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport><SelectPrimitive.ScrollDownButton className="flex justify-center py-1"><ChevronDown className="size-4" /></SelectPrimitive.ScrollDownButton></SelectPrimitive.Content></SelectPrimitive.Portal>);
SelectContent.displayName = 'SelectContent';
export const SelectItem = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Item>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>>(({className, children, ...props}, ref) => <SelectPrimitive.Item ref={ref} className={cn('relative flex cursor-pointer select-none items-center rounded-sm py-2 pl-8 pr-2 text-sm outline-none focus:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50', className)} {...props}><span className="absolute left-2 flex size-4 items-center justify-center"><SelectPrimitive.ItemIndicator><Check className="size-4" /></SelectPrimitive.ItemIndicator></span><SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText></SelectPrimitive.Item>);
SelectItem.displayName = 'SelectItem';
export const SelectLabel = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Label>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>>(({className, ...props}, ref) => <SelectPrimitive.Label ref={ref} className={cn('px-2 py-1.5 text-xs font-semibold text-muted-foreground', className)} {...props} />);
SelectLabel.displayName = 'SelectLabel';
export const SelectSeparator = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Separator>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>>(({className, ...props}, ref) => <SelectPrimitive.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-muted', className)} {...props} />);
SelectSeparator.displayName = 'SelectSeparator';
