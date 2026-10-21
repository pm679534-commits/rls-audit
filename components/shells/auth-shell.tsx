import {LanguageSwitcher} from '@/components/language-switcher';
import {Logo} from '@/components/logo';
import {ThemeToggle} from '@/components/theme-toggle';
import {useTranslations} from 'next-intl';

export function AuthShell({children}: {children: React.ReactNode}) {
  const t = useTranslations('Common');
  return <div className="min-h-dvh bg-background"><a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-background focus:p-3">{t('skipToContent')}</a><header className="container flex min-h-20 items-center justify-between gap-4"><Logo /><div className="flex items-center gap-2"><LanguageSwitcher /><ThemeToggle /></div></header>
    <main id="main-content" className="container grid min-h-[calc(100dvh-5rem)] place-items-center py-12"><div className="w-full max-w-md">{children}</div></main>
  </div>;
}
