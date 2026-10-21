'use client';

import {Laptop, Moon, Sun} from 'lucide-react';
import {useTheme} from 'next-themes';
import {useTranslations} from 'next-intl';
import {Button} from '@/components/ui/button';
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';

export function ThemeToggle() {
  const {setTheme, theme} = useTheme();
  const t = useTranslations('Common');
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t('changeTheme')}><Sun className="size-5 dark:hidden" aria-hidden="true" /><Moon className="hidden size-5 dark:block" aria-hidden="true" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onSelect={() => setTheme('light')} aria-current={theme === 'light' ? 'true' : undefined}><Sun aria-hidden="true" />{t('lightTheme')}</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => setTheme('dark')} aria-current={theme === 'dark' ? 'true' : undefined}><Moon aria-hidden="true" />{t('darkTheme')}</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => setTheme('system')} aria-current={theme === 'system' ? 'true' : undefined}><Laptop aria-hidden="true" />{t('systemTheme')}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
