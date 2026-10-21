'use client';

import {useEffect, useState} from 'react';
import {Search} from 'lucide-react';
import {useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {Button} from '@/components/ui/button';
import {CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut} from '@/components/ui/command';

export function CommandPalette({sites}: {sites: {id: string; name: string; domain: string}[]}) {
  const t = useTranslations('Phase7');
  const nav = useTranslations('Nav');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {event.preventDefault(); setOpen((value) => !value);}
      if (event.key === '/' && !open && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {event.preventDefault(); setOpen(true);}
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open]);
  function navigate(path: string) {setOpen(false); setQuery(''); router.push(path);}
  const items = [{path: '/dashboard', name: nav('dashboard')}, {path: '/dashboard/sites', name: nav('sites')}, {path: '/dashboard/reports', name: nav('reports')},
    {path: '/dashboard/notifications', name: nav('notifications')}, {path: '/dashboard/team', name: nav('team')},
    {path: '/dashboard/api-keys', name: t('apiKeys')}, {path: '/dashboard/billing', name: nav('billing')}, {path: '/dashboard/settings', name: nav('settings')}];
  return <><Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} aria-label={t('searchAll')} className="gap-2"><Search className="size-4" /><span className="hidden sm:inline">{t('searchAll')}</span><kbd className="hidden rounded border px-1 text-xs text-muted-foreground sm:inline">⌘K</kbd></Button>
    <CommandDialog open={open} onOpenChange={setOpen}><CommandInput value={query} onValueChange={setQuery} onKeyDown={(event) => {if (event.key === 'Enter' && query.trim()) {event.preventDefault(); navigate(`/dashboard/search?q=${encodeURIComponent(query.trim())}`);}}} placeholder={t('searchAll')} aria-label={t('searchAll')} /><CommandList><CommandEmpty>{t('searchEnter')}</CommandEmpty><CommandGroup heading={t('pages')}>{items.map((item) => <CommandItem key={item.path} value={item.name} onSelect={() => navigate(item.path)}>{item.name}</CommandItem>)}</CommandGroup><CommandGroup heading={t('sites')}>{sites.map((site) => <CommandItem key={site.id} value={`${site.name} ${site.domain}`} onSelect={() => navigate(`/dashboard/sites/${site.id}`)}>{site.name}<span className="ml-auto text-xs text-muted-foreground">{site.domain}</span></CommandItem>)}</CommandGroup>{query.trim() && <CommandGroup heading={t('searchResults')}><CommandItem value={`search ${query}`} onSelect={() => navigate(`/dashboard/search?q=${encodeURIComponent(query.trim())}`)}>{t('searchFor', {query})}<CommandShortcut>↵</CommandShortcut></CommandItem></CommandGroup>}</CommandList></CommandDialog>
  </>;
}
