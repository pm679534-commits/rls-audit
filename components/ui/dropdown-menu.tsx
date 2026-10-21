'use client';

import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import {Check, ChevronRight} from 'lucide-react';
import {cn} from '@/lib/utils';

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;
export const DropdownMenuSubTrigger = React.forwardRef<React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>, React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {inset?: boolean}>(({className, inset, children, ...props}, ref) => <DropdownMenuPrimitive.SubTrigger ref={ref} className={cn('flex cursor-pointer items-center rounded-sm px-2 py-2 text-sm outline-none focus:bg-accent data-[state=open]:bg-accent', inset && 'pl-8', className)} {...props}>{children}<ChevronRight className="ml-auto size-4" /></DropdownMenuPrimitive.SubTrigger>);
DropdownMenuSubTrigger.displayName = 'DropdownMenuSubTrigger';
export const DropdownMenuContent = React.forwardRef<React.ElementRef<typeof DropdownMenuPrimitive.Content>, React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>>(({className, sideOffset = 4, ...props}, ref) => <DropdownMenuPrimitive.Portal><DropdownMenuPrimitive.Content ref={ref} sideOffset={sideOffset} className={cn('z-50 min-w-44 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-soft data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0', className)} {...props} /></DropdownMenuPrimitive.Portal>);
DropdownMenuContent.displayName = 'DropdownMenuContent';
export const DropdownMenuSubContent = React.forwardRef<React.ElementRef<typeof DropdownMenuPrimitive.SubContent>, React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>>(({className, ...props}, ref) => <DropdownMenuPrimitive.SubContent ref={ref} className={cn('z-50 min-w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-soft', className)} {...props} />);
DropdownMenuSubContent.displayName = 'DropdownMenuSubContent';
export const DropdownMenuItem = React.forwardRef<React.ElementRef<typeof DropdownMenuPrimitive.Item>, React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {inset?: boolean}>(({className, inset, ...props}, ref) => <DropdownMenuPrimitive.Item ref={ref} className={cn('relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50', inset && 'pl-8', className)} {...props} />);
DropdownMenuItem.displayName = 'DropdownMenuItem';
export const DropdownMenuCheckboxItem = React.forwardRef<React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>, React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>>(({className, children, checked, ...props}, ref) => <DropdownMenuPrimitive.CheckboxItem ref={ref} checked={checked} className={cn('relative flex cursor-pointer select-none items-center rounded-sm py-2 pl-8 pr-2 text-sm outline-none focus:bg-accent', className)} {...props}><span className="absolute left-2 flex size-4 items-center justify-center"><DropdownMenuPrimitive.ItemIndicator><Check className="size-4" /></DropdownMenuPrimitive.ItemIndicator></span>{children}</DropdownMenuPrimitive.CheckboxItem>);
DropdownMenuCheckboxItem.displayName = 'DropdownMenuCheckboxItem';
export const DropdownMenuLabel = React.forwardRef<React.ElementRef<typeof DropdownMenuPrimitive.Label>, React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>>(({className, ...props}, ref) => <DropdownMenuPrimitive.Label ref={ref} className={cn('px-2 py-1.5 text-sm font-semibold', className)} {...props} />);
DropdownMenuLabel.displayName = 'DropdownMenuLabel';
export const DropdownMenuSeparator = React.forwardRef<React.ElementRef<typeof DropdownMenuPrimitive.Separator>, React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>>(({className, ...props}, ref) => <DropdownMenuPrimitive.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-muted', className)} {...props} />);
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';
