import {LanguageSwitcher} from '@/components/language-switcher';
import {Logo} from '@/components/logo';
import {ThemeToggle} from '@/components/theme-toggle';
import {useTranslations} from 'next-intl';

export function AuthShell({children}: {children: React.ReactNode}) {
  const t = useTranslations('Common');
  return <div className="min-h-dvh bg-background"><a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-background focus:p-3">{t('skipToContent')}</a><header className="container flex min-h-20 min-w-0 items-center justify-between gap-1 pt-[env(safe-area-inset-top)] sm:gap-4"><Logo className="shrink-0" /><div className="flex shrink-0 items-center gap-1 sm:gap-2"><LanguageSwitcher /><span className="hidden min-[360px]:inline-flex"><ThemeToggle /></span></div></header>
    <main id="main-content" className="container grid min-h-[calc(100dvh-5rem)] min-w-0 place-items-center py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:py-12"><div className="w-full min-w-0 max-w-md">{children}</div></main>
  </div>;
}
