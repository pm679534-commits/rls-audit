'use client';

import {Menu} from 'lucide-react';
import {useTranslations} from 'next-intl';
import {Button} from '@/components/ui/button';
import {Sheet, SheetContent, SheetTitle, SheetTrigger, SheetClose} from '@/components/ui/sheet';
import {LanguageSwitcher} from '@/components/language-switcher';
import {Logo} from '@/components/logo';
import {ThemeToggle} from '@/components/theme-toggle';
import {Link, usePathname} from '@/i18n/navigation';
import {cn} from '@/lib/utils';
import type {ShellLink} from './marketing-shell';

function NavLinks({items, mobile = false, notificationCount}: {items: ShellLink[]; mobile?: boolean; notificationCount?: React.ReactNode}) {
  const pathname = usePathname();
  const t = useTranslations('Nav');
  return <nav aria-label={mobile ? t('mobileWorkspaceNavigation') : t('workspaceNavigation')} className="flex flex-col gap-1">
    {items.map((item) => {
      const active = pathname === item.href || (item.href !== '/dashboard' && item.href !== '/admin' && pathname.startsWith(`${item.href}/`));
      const link = <Link href={item.href} aria-current={active ? 'page' : undefined} className={cn('flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-foreground', active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground')}>{item.label}{item.href === '/dashboard/notifications' && notificationCount}</Link>;
      return mobile ? <SheetClose asChild key={item.href}>{link}</SheetClose> : <div key={item.href}>{link}</div>;
    })}
  </nav>;
}

export function DashboardShell({children, navigation, title, action, notificationCount}: {children: React.ReactNode; navigation: ShellLink[]; title?: string; action?: React.ReactNode; notificationCount?: React.ReactNode}) {
  const t = useTranslations('Nav');
  const common = useTranslations('Common');
  return <div className="min-h-dvh bg-background">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-background focus:p-3">{common('skipToContent')}</a>
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r bg-card lg:flex"><div className="flex h-20 items-center border-b px-6"><Logo /></div><div className="flex-1 overflow-y-auto p-4"><NavLinks items={navigation} notificationCount={notificationCount} /></div></aside>
    <div className="lg:pl-64"><header className="sticky top-0 z-40 flex min-h-20 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">{navigation.length > 0 && <Sheet><SheetTrigger asChild><Button variant="ghost" size="icon" className="lg:hidden" aria-label={t('openMenu')}><Menu aria-hidden="true" /></Button></SheetTrigger><SheetContent side="left"><SheetTitle className="mb-6"><Logo /></SheetTitle><NavLinks items={navigation} mobile notificationCount={notificationCount} /></SheetContent></Sheet>}<span className="truncate text-sm font-semibold sm:text-base">{title ?? t('dashboard')}</span></div>
      <div className="flex items-center gap-1">{action}<LanguageSwitcher /><ThemeToggle /></div>
    </header><main id="main-content" className="mx-auto w-full max-w-[1440px] p-4 pb-20 sm:p-6 lg:p-8">{children}</main></div>
  </div>;
}
