'use client';

import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut} from '@/components/ui/command';

export function CommandPaletteDialog({sites, open, onOpenChange}: {sites: {id: string; name: string; domain: string}[]; open: boolean; onOpenChange: (open: boolean) => void}) {
  const t = useTranslations('Phase7');
  const nav = useTranslations('Nav');
  const router = useRouter();
  const [query, setQuery] = useState('');
  function navigate(path: string) {onOpenChange(false); setQuery(''); router.push(path);}
  const items = [{path: '/dashboard', name: nav('dashboard')}, {path: '/dashboard/sites', name: nav('sites')}, {path: '/dashboard/reports', name: nav('reports')},
    {path: '/dashboard/notifications', name: nav('notifications')}, {path: '/dashboard/team', name: nav('team')},
    {path: '/dashboard/api-keys', name: t('apiKeys')}, {path: '/dashboard/billing', name: nav('billing')}, {path: '/dashboard/settings', name: nav('settings')}];
  return <CommandDialog open={open} onOpenChange={onOpenChange}><CommandInput value={query} onValueChange={setQuery} onKeyDown={(event) => {if (event.key === 'Enter' && query.trim()) {event.preventDefault(); navigate(`/dashboard/search?q=${encodeURIComponent(query.trim())}`);}}} placeholder={t('searchAll')} aria-label={t('searchAll')} /><CommandList><CommandEmpty>{t('searchEnter')}</CommandEmpty><CommandGroup heading={t('pages')}>{items.map((item) => <CommandItem key={item.path} value={item.name} onSelect={() => navigate(item.path)}>{item.name}</CommandItem>)}</CommandGroup><CommandGroup heading={t('sites')}>{sites.map((site) => <CommandItem key={site.id} value={`${site.name} ${site.domain}`} onSelect={() => navigate(`/dashboard/sites/${site.id}`)}>{site.name}<span className="ml-auto text-xs text-muted-foreground">{site.domain}</span></CommandItem>)}</CommandGroup>{query.trim() && <CommandGroup heading={t('searchResults')}><CommandItem value={`search ${query}`} onSelect={() => navigate(`/dashboard/search?q=${encodeURIComponent(query.trim())}`)}>{t('searchFor', {query})}<CommandShortcut>↵</CommandShortcut></CommandItem></CommandGroup>}</CommandList></CommandDialog>;
}
