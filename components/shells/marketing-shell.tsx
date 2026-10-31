'use client';

import {Menu} from 'lucide-react';
import {useTranslations} from 'next-intl';
import {Button} from '@/components/ui/button';
import {Sheet, SheetContent, SheetTitle, SheetTrigger, SheetClose} from '@/components/ui/sheet';
import {LanguageSwitcher} from '@/components/language-switcher';
import {Logo} from '@/components/logo';
import {ThemeToggle} from '@/components/theme-toggle';
import {Link} from '@/i18n/navigation';
import {BRAND_NAME} from '@/lib/config';

export type ShellLink = {href: string; label: string};

export function MarketingShell({children, navigation = []}: {children: React.ReactNode; navigation?: ShellLink[]}) {
  const t = useTranslations('Nav');
  const common = useTranslations('Common');
  const home = useTranslations('Home');
  const footer = useTranslations('Marketing.footer');
  const links = [{href: '/', label: t('home')}, ...navigation];
  return <div className="flex min-h-dvh flex-col">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-background focus:p-3">{common('skipToContent')}</a>
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container flex h-18 min-h-[4.5rem] min-w-0 items-center justify-between gap-2 pt-[env(safe-area-inset-top)] sm:gap-4"><Logo className="shrink-0" />
        <nav aria-label={t('primaryNavigation')} className="hidden items-center gap-1 xl:flex">{links.map((item) => <Link key={item.href} href={item.href} className="inline-flex min-h-11 items-center rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">{item.label}</Link>)}</nav>
        <div className="flex min-w-0 shrink-0 items-center gap-1"><LanguageSwitcher /><span className="hidden sm:inline-flex"><ThemeToggle /></span><Link href="/sign-in" className="hidden min-h-11 items-center rounded-md px-3 text-sm font-medium hover:bg-accent xl:inline-flex">{t('signIn')}</Link><Button asChild className="hidden xl:inline-flex"><Link href="/sign-up">{t('getStarted')}</Link></Button>
          <Sheet><SheetTrigger asChild><Button variant="ghost" size="icon" className="xl:hidden" aria-label={t('openMenu')}><Menu aria-hidden="true" /></Button></SheetTrigger>
            <SheetContent side="right" className="overflow-y-auto"><SheetTitle className="font-display text-2xl">{t('openMenu')}</SheetTitle><nav aria-label={t('mobileNavigation')} className="flex flex-col gap-1">{links.map((item) => <SheetClose asChild key={item.href}><Link href={item.href} className="flex min-h-11 items-center rounded-md px-3 text-base hover:bg-accent">{item.label}</Link></SheetClose>)}<SheetClose asChild><Link href="/sign-in" className="flex min-h-11 items-center rounded-md px-3 text-base hover:bg-accent">{t('signIn')}</Link></SheetClose><SheetClose asChild><Link href="/sign-up" className="flex min-h-11 items-center rounded-md px-3 text-base hover:bg-accent">{t('getStarted')}</Link></SheetClose></nav><div className="mt-4 border-t pt-4 sm:hidden"><ThemeToggle /></div></SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
    <main id="main-content" className="flex-1">{children}</main>
    <footer className="border-t bg-secondary/30"><div className="container grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
      <div><Logo /><p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">{home('tagline')}</p><p className="mt-7 text-xs text-muted-foreground">Â© {new Date().getFullYear()} {BRAND_NAME}. {footer('rights')}</p></div>
      <div><h2 className="text-sm font-semibold">{footer('product')}</h2><ul className="mt-4 space-y-1">{[{href:'/features',label:t('features')},{href:'/how-it-works',label:t('howItWorks')},{href:'/pricing',label:t('pricing')},{href:'/docs',label:t('docs')},{href:'/changelog',label:t('changelog')}].map((item) => <li key={item.href}><Link href={item.href} className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground hover:underline">{item.label}</Link></li>)}</ul></div>
      <div><h2 className="text-sm font-semibold">{footer('company')}</h2><ul className="mt-4 space-y-1">{[{href:'/security',label:t('security')},{href:'/contact',label:t('contact')},{href:'/terms',label:footer('terms')},{href:'/privacy',label:footer('privacy')},{href:'/acceptable-use',label:footer('aup')},{href:'/cookies',label:footer('cookies')}].map((item) => <li key={item.href}><Link href={item.href} className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground hover:underline">{item.label}</Link></li>)}</ul></div>
    </div></footer>
  </div>;
}

